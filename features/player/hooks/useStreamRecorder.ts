'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { usePlayerStore } from '@/stores/playerStore';
import type { RecordingSegment, RecordingFormat, RecordingProgress } from '@/types';

/** Maximum recording duration in seconds (30 minutes) */
const MAX_RECORDING_DURATION = 30 * 60;

/**
 * Detect the best supported MIME type for MediaRecorder.
 * Returns the MIME type string and inferred format.
 */
function detectSupportedMimeType(): { mimeType: string; format: RecordingFormat } {
  if (typeof MediaRecorder === 'undefined') {
    return { mimeType: '', format: 'webm' };
  }

  // Prefer VP9 webm, then VP8 webm, then plain webm, then mp4
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

interface UseStreamRecorderReturn {
  startRecording: (videoElement: HTMLVideoElement, channelName: string, channelSlug: string) => boolean;
  stopRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  isRecording: boolean;
  isPaused: boolean;
  recordingProgress: RecordingProgress;
  recordingUrl: string | null;
  recordingBlob: Blob | null;
  segments: RecordingSegment[];
  error: string | null;
}

export function useStreamRecorder(): UseStreamRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingProgress, setRecordingProgress] = useState<RecordingProgress>({
    segmentCount: 0,
    estimatedSize: 0,
    duration: 0,
    format: 'webm',
    mimeType: 'video/webm',
  });
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const [segments, setSegments] = useState<RecordingSegment[]>([]);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedDurationRef = useRef<number>(0); // accumulated pause time in ms
  const pauseStartRef = useRef<number>(0);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxDurationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const detectedMimeRef = useRef<{ mimeType: string; format: RecordingFormat }>({ mimeType: 'video/webm', format: 'webm' });

  const {
    setRecording: setStoreRecording,
    setRecordingPaused: setStoreRecordingPaused,
    setRecordingDuration: setStoreRecordingDuration,
    setRecordingFormat: setStoreRecordingFormat,
    setRecordingBlob: setStoreRecordingBlob,
    setRecordingUrl: setStoreRecordingUrl,
  } = usePlayerStore();

  // Internal stop function that doesn't depend on useCallback circular refs
  const doStopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      setIsRecording(false);
      setIsPaused(false);
      setStoreRecording(false);
      setStoreRecordingPaused(false);
      return;
    }

    // Capture chunks before stopping
    const chunks = [...chunksRef.current];
    const mimeType = recorder.mimeType || detectedMimeRef.current.mimeType;

    // Stop the recorder
    try {
      recorder.stop();
    } catch {
      // Already stopped, that's fine
    }
    mediaRecorderRef.current = null;
    streamRef.current = null;
    setIsRecording(false);
    setIsPaused(false);

    // Clear intervals and timeouts
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    if (maxDurationTimeoutRef.current) {
      clearTimeout(maxDurationTimeoutRef.current);
      maxDurationTimeoutRef.current = null;
    }

    // Merge all chunks into a single blob
    if (chunks.length > 0) {
      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      setRecordingBlob(blob);
      setRecordingUrl(url);
      setStoreRecordingBlob(blob);
      setStoreRecordingUrl(url);
    }

    // Update store
    setStoreRecording(false);
    setStoreRecordingPaused(false);
  }, [setStoreRecording, setStoreRecordingPaused, setStoreRecordingBlob, setStoreRecordingUrl]);

  const startRecording = useCallback(
    (videoElement: HTMLVideoElement, _channelName: string, _channelSlug: string): boolean => {
      // Check MediaRecorder support
      if (typeof MediaRecorder === 'undefined') {
        setError('MediaRecorder is not supported in this browser.');
        return false;
      }

      // Try captureStream
      const videoEl = videoElement as HTMLVideoElement & { captureStream?: () => MediaStream };
      if (!videoEl.captureStream) {
        setError('captureStream() is not supported for this video element. This may be due to cross-origin restrictions.');
        return false;
      }

      let stream: MediaStream;
      try {
        stream = videoEl.captureStream();
      } catch {
        setError('Failed to capture stream from video element. Ensure the video is playing and not cross-origin restricted.');
        return false;
      }

      if (!stream.getVideoTracks().length && !stream.getAudioTracks().length) {
        setError('No media tracks available from the video element.');
        return false;
      }

      // Detect supported MIME type
      const detected = detectSupportedMimeType();
      if (!detected.mimeType) {
        setError('No supported recording MIME type found in this browser.');
        return false;
      }
      detectedMimeRef.current = detected;

      streamRef.current = stream;
      chunksRef.current = [];
      startTimeRef.current = Date.now();
      pausedDurationRef.current = 0;
      setError(null);

      // Clean up previous recording URL
      if (recordingUrl) {
        URL.revokeObjectURL(recordingUrl);
        setRecordingUrl(null);
        setStoreRecordingUrl(null);
      }
      setRecordingBlob(null);
      setStoreRecordingBlob(null);
      setSegments([]);

      try {
        const recorderOptions: MediaRecorderOptions = {
          mimeType: detected.mimeType,
        };

        // Set video bitrate if we have video tracks
        if (stream.getVideoTracks().length > 0) {
          recorderOptions.videoBitsPerSecond = 4000000; // 4 Mbps
        }

        const recorder = new MediaRecorder(stream, recorderOptions);

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            chunksRef.current.push(e.data);

            const segment: RecordingSegment = {
              index: chunksRef.current.length - 1,
              url: URL.createObjectURL(e.data),
              duration: 1,
              size: e.data.size,
              timestamp: Date.now(),
              blob: e.data,
            };

            setSegments((prev) => [...prev, segment]);
          }
        };

        recorder.onerror = () => {
          setError('MediaRecorder encountered an error.');
          // Inline stop logic to avoid circular reference
          const errChunks = [...chunksRef.current];
          const errMime = recorder.mimeType || detected.mimeType;
          try { recorder.stop(); } catch { /* already stopped */ }
          mediaRecorderRef.current = null;
          streamRef.current = null;
          setIsRecording(false);
          setIsPaused(false);
          if (progressIntervalRef.current) { clearInterval(progressIntervalRef.current); progressIntervalRef.current = null; }
          if (maxDurationTimeoutRef.current) { clearTimeout(maxDurationTimeoutRef.current); maxDurationTimeoutRef.current = null; }
          if (errChunks.length > 0) {
            const blob = new Blob(errChunks, { type: errMime });
            const url = URL.createObjectURL(blob);
            setRecordingBlob(blob);
            setRecordingUrl(url);
            setStoreRecordingBlob(blob);
            setStoreRecordingUrl(url);
          }
          setStoreRecording(false);
          setStoreRecordingPaused(false);
        };

        // Collect data every second for progress tracking and segment creation
        recorder.start(1000);
        mediaRecorderRef.current = recorder;
        setIsRecording(true);
        setIsPaused(false);

        // Update store
        const recordingId = `rec-${Date.now()}`;
        setStoreRecording(true, recordingId);
        setStoreRecordingPaused(false);
        setStoreRecordingFormat(detected.format);
        setStoreRecordingDuration(0);

        // Update progress periodically
        progressIntervalRef.current = setInterval(() => {
          const totalSize = chunksRef.current.reduce((acc, chunk) => acc + chunk.size, 0);
          const elapsed = (Date.now() - startTimeRef.current - pausedDurationRef.current) / 1000;

          setRecordingProgress({
            segmentCount: chunksRef.current.length,
            estimatedSize: totalSize,
            duration: elapsed,
            format: detected.format,
            mimeType: detected.mimeType,
          });

          setStoreRecordingDuration(elapsed);

          // Auto-stop at max duration
          if (elapsed >= MAX_RECORDING_DURATION) {
            doStopRecording();
          }
        }, 1000);

        // Also set a hard timeout to ensure we stop at 30 minutes
        maxDurationTimeoutRef.current = setTimeout(() => {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            doStopRecording();
          }
        }, (MAX_RECORDING_DURATION + 5) * 1000);

        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error starting recording';
        setError(`Failed to start recording: ${message}`);
        return false;
      }
    },
    [recordingUrl, setStoreRecording, setStoreRecordingPaused, setStoreRecordingDuration, setStoreRecordingFormat, setStoreRecordingBlob, setStoreRecordingUrl, doStopRecording]
  );

  const stopRecording = useCallback(() => {
    doStopRecording();
  }, [doStopRecording]);

  const pauseRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== 'recording') return;

    try {
      recorder.pause();
      pauseStartRef.current = Date.now();
      setIsPaused(true);
      setStoreRecordingPaused(true);
    } catch {
      // Some recorders don't support pause
    }
  }, [setStoreRecordingPaused]);

  const resumeRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== 'paused') return;

    try {
      recorder.resume();
      if (pauseStartRef.current > 0) {
        pausedDurationRef.current += Date.now() - pauseStartRef.current;
        pauseStartRef.current = 0;
      }
      setIsPaused(false);
      setStoreRecordingPaused(false);
    } catch {
      // Some recorders don't support resume
    }
  }, [setStoreRecordingPaused]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          // Already stopped
        }
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
      if (maxDurationTimeoutRef.current) {
        clearTimeout(maxDurationTimeoutRef.current);
      }
      if (recordingUrl) {
        URL.revokeObjectURL(recordingUrl);
      }
    };
  }, [recordingUrl]);

  return {
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    isRecording,
    isPaused,
    recordingProgress,
    recordingUrl,
    recordingBlob,
    segments,
    error,
  };
}
