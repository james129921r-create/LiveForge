'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { usePlayerStore } from '@/stores/playerStore';
import type { ClipData, ClipDurationOption, RecordingFormat } from '@/types';

/** Maximum clip duration in seconds */
const MAX_CLIP_DURATION: number = 60;

/**
 * Detect the best supported MIME type for MediaRecorder (for clips).
 * Returns the MIME type string and inferred format.
 */
function detectClipMimeType(): { mimeType: string; format: RecordingFormat } {
  if (typeof MediaRecorder === 'undefined') {
    return { mimeType: '', format: 'webm' };
  }

  const candidates = [
    { mime: 'video/webm;codecs=vp9,opus', format: 'webm' as RecordingFormat },
    { mime: 'video/webm;codecs=vp9', format: 'webm' as RecordingFormat },
    { mime: 'video/webm;codecs=vp8,opus', format: 'webm' as RecordingFormat },
    { mime: 'video/webm;codecs=vp8', format: 'webm' as RecordingFormat },
    { mime: 'video/webm', format: 'webm' as RecordingFormat },
    { mime: 'video/mp4', format: 'mp4' as RecordingFormat },
  ];

  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate.mime)) {
      return { mimeType: candidate.mime, format: candidate.format };
    }
  }

  return { mimeType: '', format: 'webm' };
}

/**
 * Timestamped chunk for the ring buffer.
 * Each chunk has a creation timestamp so we can compute
 * which chunks fall within the desired clip window.
 *
 * GC Guardrail: Blobs are immutable references to binary data managed by the
 * browser's media subsystem — they do NOT create per-chunk V8 heap allocations
 * for the raw binary data. The Blob wrapper itself is a lightweight handle.
 * For even tighter GC control, the ring buffer could be converted to use
 * Uint8Array views over an ArrayBuffer pool, but this would require manual
 * concatenation when creating clips (Blob constructor handles this natively).
 * The current Blob-based approach is the recommended pattern for MediaRecorder
 * ring buffers as it avoids V8 GC pressure from large typed array copies.
 */
interface TimestampedChunk {
  blob: Blob;
  timestamp: number; // Date.now() when the chunk was received
  size: number;
}

interface UseClipCaptureReturn {
  startClipCapture: (videoElement: HTMLVideoElement) => boolean;
  stopClipCapture: () => void;
  createClip: (channelName: string, duration?: ClipDurationOption) => ClipData | null;
  isCapturing: boolean;
  lastClipUrl: string | null;
  clearLastClip: () => void;
  error: string | null;
  bufferDuration: number; // how many seconds of buffer are currently available
}

export function useClipCapture(): UseClipCaptureReturn {
  const [isCapturing, setIsCapturing] = useState(false);
  const [lastClipUrl, setLastClipUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bufferDuration, setBufferDuration] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const ringBufferRef = useRef<TimestampedChunk[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const captureStartTimeRef = useRef<number>(0);
  const detectedMimeRef = useRef<{ mimeType: string; format: RecordingFormat }>({ mimeType: 'video/webm', format: 'webm' });
  const bufferCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);

  const { addClip, clipDuration } = usePlayerStore();

  /**
   * Prune the ring buffer to keep only chunks within the max window.
   * We keep chunks up to MAX_CLIP_DURATION seconds old so we can create
   * clips of any supported duration.
   */
  const pruneBuffer = useCallback(() => {
    const now = Date.now();
    const maxAge = MAX_CLIP_DURATION * 1000 + 2000; // Add 2s buffer for timing imprecision
    ringBufferRef.current = ringBufferRef.current.filter(
      (chunk) => now - chunk.timestamp < maxAge
    );

    // Calculate available buffer duration
    if (ringBufferRef.current.length > 0) {
      const oldestChunk = ringBufferRef.current[0];
      const duration = (now - oldestChunk.timestamp) / 1000;
      setBufferDuration(Math.min(duration, MAX_CLIP_DURATION));
    } else {
      setBufferDuration(0);
    }
  }, []);

  const startClipCapture = useCallback((videoElement: HTMLVideoElement): boolean => {
    // Check MediaRecorder support
    if (typeof MediaRecorder === 'undefined') {
      setError('MediaRecorder is not supported in this browser.');
      return false;
    }

    const videoEl = videoElement as HTMLVideoElement & { captureStream?: () => MediaStream };
    if (!videoEl.captureStream) {
      setError('captureStream() is not supported. Clip capture requires a browser that supports this API.');
      return false;
    }

    let stream: MediaStream;
    try {
      stream = videoEl.captureStream();
    } catch {
      setError('Failed to capture stream. This may be due to cross-origin restrictions on the video.');
      return false;
    }

    if (!stream.getVideoTracks().length && !stream.getAudioTracks().length) {
      setError('No media tracks available from the video element.');
      return false;
    }

    // Detect supported MIME type
    const detected = detectClipMimeType();
    if (!detected.mimeType) {
      setError('No supported recording MIME type found for clip capture.');
      return false;
    }
    detectedMimeRef.current = detected;

    // Stop previous capture if any
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // Ignore
      }
    }

    streamRef.current = stream;
    ringBufferRef.current = [];
    captureStartTimeRef.current = Date.now();
    videoElementRef.current = videoElement;
    setError(null);

    try {
      const recorderOptions: MediaRecorderOptions = {
        mimeType: detected.mimeType,
      };

      if (stream.getVideoTracks().length > 0) {
        recorderOptions.videoBitsPerSecond = 2500000; // 2.5 Mbps for clips
      }

      const recorder = new MediaRecorder(stream, recorderOptions);

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          ringBufferRef.current.push({
            blob: e.data,
            timestamp: Date.now(),
            size: e.data.size,
          });
          pruneBuffer();
        }
      };

      recorder.onerror = () => {
        setError('Clip recorder encountered an error.');
        // Try to restart
        try {
          recorder.stop();
        } catch {
          // Ignore
        }
        mediaRecorderRef.current = null;
        // Attempt to restart after a brief delay using a fresh recorder
        setTimeout(() => {
          const video = videoElementRef.current;
          if (video) {
            try {
              const stream = (video as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream?.();
              if (stream) {
                const detected = detectedMimeRef.current;
                const opts: MediaRecorderOptions = { mimeType: detected.mimeType };
                if (stream.getVideoTracks().length > 0) {
                  opts.videoBitsPerSecond = 2500000;
                }
                const newRecorder = new MediaRecorder(stream, opts);
                newRecorder.ondataavailable = (e) => {
                  if (e.data.size > 0) {
                    ringBufferRef.current.push({
                      blob: e.data,
                      timestamp: Date.now(),
                      size: e.data.size,
                    });
                    pruneBuffer();
                  }
                };
                newRecorder.start(1000);
                mediaRecorderRef.current = newRecorder;
              }
            } catch {
              // Restart failed, user can try again
            }
          }
        }, 1000);
      };

      // Use timeslice for rolling buffer - collect 1-second chunks
      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setIsCapturing(true);

      // Periodically prune the buffer and update duration
      bufferCheckIntervalRef.current = setInterval(pruneBuffer, 5000);

      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to start clip capture: ${message}`);
      return false;
    }
  }, [pruneBuffer]);

  const stopClipCapture = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // Ignore
      }
    }
    mediaRecorderRef.current = null;
    streamRef.current = null;
    ringBufferRef.current = [];
    videoElementRef.current = null;
    setIsCapturing(false);
    setBufferDuration(0);

    if (bufferCheckIntervalRef.current) {
      clearInterval(bufferCheckIntervalRef.current);
      bufferCheckIntervalRef.current = null;
    }
  }, []);

  const createClip = useCallback((channelName: string, duration?: ClipDurationOption): ClipData | null => {
    const clipDurationSec = duration ?? clipDuration;
    const clipDurationMs = clipDurationSec * 1000;
    const now = Date.now();

    // Get chunks within the desired duration window
    const windowStart = now - clipDurationMs;
    const relevantChunks = ringBufferRef.current.filter(
      (chunk) => chunk.timestamp >= windowStart
    );

    if (relevantChunks.length === 0) {
      setError('No clip data available. The buffer may still be filling up — try again in a few seconds.');
      return null;
    }

    // Create blob from the relevant chunks
    const mimeType = detectedMimeRef.current.mimeType || 'video/webm';
    const format = detectedMimeRef.current.format;
    const blobs = relevantChunks.map((c) => c.blob);
    const combinedBlob = new Blob(blobs, { type: mimeType });
    const url = URL.createObjectURL(combinedBlob);

    // Compute actual clip duration based on the chunks we have
    const actualStartTime = relevantChunks[0].timestamp;
    const actualDuration = (now - actualStartTime) / 1000;

    const clip: ClipData = {
      id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      channelName,
      startTime: actualStartTime,
      endTime: now,
      duration: Math.min(actualDuration, clipDurationSec),
      blobUrl: url,
      blob: combinedBlob,
      mimeType,
      format,
      createdAt: now,
    };

    setLastClipUrl(url);
    setError(null);
    addClip(clip);

    // Restart the clip recorder to ensure fresh buffer for next clip
    // This approach gives us a clean recorder state after each clip
    const video = videoElementRef.current;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // Ignore
      }
      mediaRecorderRef.current = null;
    }
    ringBufferRef.current = [];
    captureStartTimeRef.current = Date.now();

    // Restart recorder immediately for continuous capture
    if (video && streamRef.current) {
      try {
        const detected = detectedMimeRef.current;
        const recorderOptions: MediaRecorderOptions = {
          mimeType: detected.mimeType,
        };
        if (streamRef.current.getVideoTracks().length > 0) {
          recorderOptions.videoBitsPerSecond = 2500000;
        }

        const recorder = new MediaRecorder(streamRef.current, recorderOptions);

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            ringBufferRef.current.push({
              blob: e.data,
              timestamp: Date.now(),
              size: e.data.size,
            });
            pruneBuffer();
          }
        };

        recorder.onerror = () => {
          setError('Clip recorder encountered an error after restart.');
          try {
            recorder.stop();
          } catch {
            // Ignore
          }
        };

        recorder.start(1000);
        mediaRecorderRef.current = recorder;
      } catch {
        // If restart fails, the user can still use the captured clip
        setError('Failed to restart clip recorder. Clip was saved but continuous capture stopped.');
      }
    }

    return clip;
  }, [clipDuration, addClip, pruneBuffer]);

  const clearLastClip = useCallback(() => {
    if (lastClipUrl) {
      URL.revokeObjectURL(lastClipUrl);
    }
    setLastClipUrl(null);
  }, [lastClipUrl]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          // Ignore
        }
      }
      if (bufferCheckIntervalRef.current) {
        clearInterval(bufferCheckIntervalRef.current);
      }
      if (lastClipUrl) {
        URL.revokeObjectURL(lastClipUrl);
      }
    };
  }, [lastClipUrl]);

  return {
    startClipCapture,
    stopClipCapture,
    createClip,
    isCapturing,
    lastClipUrl,
    clearLastClip,
    error,
    bufferDuration,
  };
}
