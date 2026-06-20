'use client';

import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useHLS, type QualityLevel } from '../hooks/useHLS';
import { usePlaybackControls, useKeyboardShortcuts } from '../hooks/usePlaybackControls';
import { useClipCapture } from '../hooks/useClipCapture';
import { useStreamRecorder } from '../hooks/useStreamRecorder';
import { PlaybackControls } from './PlaybackControls';
import { DVRTimeline } from './DVRTimeline';
import { LatencyControl } from './LatencyControl';
import { PlayerOverlay } from './PlayerOverlay';
import { AudioOnlyOverlay } from './AudioOnlyOverlay';
import { ClipCreator } from './ClipCreator';
import { usePlayerStore } from '@/stores/playerStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useIsMobile } from '@/hooks/use-mobile';
import { registerStreamVideo, unregisterStreamVideo } from '../hooks/useStreamSync';
import { useMultiStreamStore } from '@/stores/multiStreamStore';
import { useStreamSleeping } from '@/hooks/useStreamSleeping';
import { RefreshCw, Settings, Eye, Wifi, WifiOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { ClipData, ClipDurationOption } from '@/types';

interface HLSPlayerProps {
  src?: string;
  channelName?: string;
}

// Quality selector component
function QualitySelector({ currentQuality, qualityLevels, onSetQuality }: {
  currentQuality: QualityLevel;
  qualityLevels: { height: number; bitrate: number }[];
  onSetQuality: (q: QualityLevel) => void;
}) {
  const [open, setOpen] = useState(false);
  const qualities: QualityLevel[] = ['auto', '1080p', '720p', '480p', '360p', '160p'];

  // Only show qualities that have levels available
  const availableHeights = new Set(qualityLevels.map(l => l.height));
  const filteredQualities = qualities.filter(q => {
    if (q === 'auto') return true;
    const h = { '1080p': 1080, '720p': 720, '480p': 480, '360p': 360, '160p': 160 }[q];
    // Show quality if we have that exact height OR a close one
    if (!h) return false;
    return [...availableHeights].some(ah => Math.abs(ah - h) <= 10);
  });

  if (filteredQualities.length <= 1) return null;

  return (
    <div className="relative">
      <button
        className="flex items-center gap-1 text-[10px] text-white/70 hover:text-white bg-black/50 px-1.5 py-0.5 rounded"
        onClick={() => setOpen(!open)}
      >
        <Settings className="h-3 w-3" />
        {currentQuality === 'auto' ? 'Auto' : currentQuality}
      </button>
      {open && (
        <div className="absolute bottom-full right-0 mb-1 bg-black/90 rounded-md py-1 min-w-[80px] z-30">
          {filteredQualities.map(q => (
            <button
              key={q}
              className={`w-full px-3 py-1 text-left text-[10px] hover:bg-white/10 transition-colors ${
                currentQuality === q ? 'text-primary font-medium' : 'text-white/70'
              }`}
              onClick={() => { onSetQuality(q); setOpen(false); }}
            >
              {q === 'auto' ? 'Auto' : q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Connection status indicator
function ConnectionStatus({ state }: { state: 'disconnected' | 'connecting' | 'connected' | 'error' }) {
  if (state === 'connected') return null;

  return (
    <div className={`absolute top-8 right-3 z-10 flex items-center gap-1 text-[10px] px-2 py-1 rounded-full ${
      state === 'connecting' ? 'bg-yellow-500/20 text-yellow-400' :
      state === 'error' ? 'bg-red-500/20 text-red-400' :
      'bg-gray-500/20 text-gray-400'
    }`}>
      {state === 'connecting' ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin" />
          Connecting...
        </>
      ) : state === 'error' ? (
        <>
          <WifiOff className="h-3 w-3" />
          Disconnected
        </>
      ) : (
        <>
          <Wifi className="h-3 w-3" />
          Offline
        </>
      )}
    </div>
  );
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function HLSPlayer({ src, channelName }: HLSPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Determine the slot ID for this player for stream sync registration
  const activeSlotId = useMultiStreamStore((s) => s.activeSlotId);
  const slots = useMultiStreamStore((s) => s.slots);
  const syncSlotId = useMemo(() => {
    const slot = slots.find((s) => s.channel?.displayName === channelName || s.channel?.username === channelName);
    return slot?.id ?? activeSlotId ?? 'slot-0';
  }, [slots, channelName, activeSlotId]);

  // ─── Stream Sleeping (visibility-based) ──────────────────────────────────
  // When a stream is not visible (scrolled off, in a background tab, or
  // behind another window), we reduce quality and buffer to save memory.
  const { isSleeping, containerRef: sleepingContainerRef } = useStreamSleeping(
    videoRef,
    syncSlotId,
    { sleepThresholdMs: 30_000, aggressiveSleep: false, wakeGracePeriodMs: 10_000 }
  );

  // Track original HLS settings to restore after wake
  const originalMaxBufferLengthRef = useRef<number | null>(null);

  // When sleeping, reduce HLS quality and buffer to minimize memory
  // We access the hlsInstance ref from useHLS (returned below) to adjust settings
  // This effect runs AFTER useHLS is initialized

  // Register/unregister video element for stream sync
  useEffect(() => {
    const video = videoRef.current;
    if (video && src) {
      registerStreamVideo(syncSlotId, video);
    }
    return () => {
      unregisterStreamVideo(syncSlotId);
    };
  }, [syncSlotId, src]);

  // Re-register when video ref becomes available (after src loads)
  useEffect(() => {
    const video = videoRef.current;
    if (video && src) {
      registerStreamVideo(syncSlotId, video);
    }
  }, [src, syncSlotId, registerStreamVideo]);

  const {
    error, retryCount, isRetrying, isLoading, manualRetry,
    connectionState, qualityLevels, currentQuality, setQuality,
    hlsInstance,
  } = useHLS(videoRef, src);

  // ─── Visibility-based HLS quality/buffer adjustment ──────────────────
  // When a stream goes offscreen (sleeping): set startLevel = -1 (auto),
  // enable auto level, and reduce maxBufferLength to 5 to save memory.
  // When it comes back onscreen: restore original settings.
  useEffect(() => {
    const hls = hlsInstance.current;
    if (!hls || !src) return;

    if (isSleeping) {
      // Save original maxBufferLength before modifying
      if (originalMaxBufferLengthRef.current === null) {
        originalMaxBufferLengthRef.current = hls.config.maxBufferLength ?? 30;
      }
      // Reduce to lowest quality and minimal buffer
      // Use setTimeout to avoid React compiler's "cannot modify" rule
      // since hls.startLevel and hls.config are mutable external state
      setTimeout(() => {
        if (hlsInstance.current) {
          hlsInstance.current.startLevel = -1; // auto (lowest available)
          hlsInstance.current.currentLevel = -1; // switch to auto immediately
          hlsInstance.current.config.maxBufferLength = 5;
          hlsInstance.current.config.maxMaxBufferLength = 10;
        }
      }, 0);
    } else {
      // Restore original buffer settings
      if (originalMaxBufferLengthRef.current !== null) {
        setTimeout(() => {
          if (hlsInstance.current) {
            hlsInstance.current.config.maxBufferLength = originalMaxBufferLengthRef.current ?? 30;
            hlsInstance.current.config.maxMaxBufferLength = (originalMaxBufferLengthRef.current ?? 30) * 2;
          }
        }, 0);
        originalMaxBufferLengthRef.current = null;
      }
    }
  }, [isSleeping, hlsInstance, src]);

  const { toggleFullscreen, togglePlay, toggleMute, changeVolume } = usePlaybackControls(videoRef);
  useKeyboardShortcuts(videoRef);

  const { isTheaterMode, audioMode, isPiP, setPiP, isRecording, isRecordingPaused, recordingDuration, isMuted, volume } = usePlayerStore();
  const { chatVisible, chatPosition } = useSettingsStore();
  const isMobile = useIsMobile();

  const isExpanded = isTheaterMode || !chatVisible;
  const isAudioOnly = audioMode === 'audioOnly';

  // Mobile tap-to-toggle controls
  const [showControls, setShowControls] = useState(true);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Double-tap fullscreen
  const lastTapRef = useRef<number>(0);
  const tapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Swipe gesture state
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  // Stream recorder hook
  const {
    startRecording, stopRecording, pauseRecording, resumeRecording,
    isRecording: recorderIsRecording,
    recordingUrl: recorderUrl,
    error: recorderError,
  } = useStreamRecorder();

  // Clip capture hook
  const { startClipCapture, stopClipCapture, createClip, isCapturing, clearLastClip, error: clipError, bufferDuration } = useClipCapture();
  const [activeClip, setActiveClip] = useState<ClipData | null>(null);

  // Track if autoplay was blocked
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  // Detect autoplay blocked — show play button overlay
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    const handlePlay = () => setAutoplayBlocked(false);
    const handlePause = () => {
      // If paused right after connecting, likely autoplay blocked
      if (connectionState === 'connected' && !video.muted && video.paused && video.readyState >= 1) {
        setAutoplayBlocked(true);
      }
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
    };
  }, [src, connectionState]);

  const handleManualPlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = true;
    video.play().then(() => {
      setAutoplayBlocked(false);
      // Try unmuting after a short delay
      setTimeout(() => {
        video.muted = isMuted;
      }, 500);
    }).catch(() => {
      // Still can't play — user may need to interact with the page
    });
  }, [isMuted]);

  // Show recorder errors as toasts
  useEffect(() => {
    if (recorderError) {
      toast.error(recorderError);
    }
  }, [recorderError]);

  // Show clip errors as toasts
  useEffect(() => {
    if (clipError) {
      toast.error(clipError);
    }
  }, [clipError]);

  // Notify when recording starts/stops
  useEffect(() => {
    if (recorderIsRecording) {
      toast.success('Recording started', { duration: 2000 });
    }
  }, [recorderIsRecording]);

  // Start clip capture when source changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    const handleReady = () => {
      startClipCapture(video);
    };

    video.addEventListener('playing', handleReady);
    return () => {
      video.removeEventListener('playing', handleReady);
      stopClipCapture();
    };
  }, [src, startClipCapture, stopClipCapture]);

  // Handle record toggle
  const handleRecordToggle = useCallback(() => {
    if (recorderIsRecording) {
      stopRecording();
      if (recorderUrl) {
        toast.success('Recording saved! Click the download icon to save.', { duration: 4000 });
      }
    } else {
      const video = videoRef.current;
      if (video) {
        const success = startRecording(video, channelName || 'unknown', channelName || 'unknown');
        if (!success) {
          toast.error('Failed to start recording. Your browser may not support this feature.');
        }
      }
    }
  }, [recorderIsRecording, stopRecording, startRecording, recorderUrl, channelName]);

  const handleRecordPause = useCallback(() => {
    pauseRecording();
  }, [pauseRecording]);

  const handleRecordResume = useCallback(() => {
    resumeRecording();
  }, [resumeRecording]);

  // Handle clip creation
  const handleClipCreate = useCallback((duration?: ClipDurationOption) => {
    const clip = createClip(channelName || 'Unknown', duration);
    if (clip) {
      setActiveClip(clip);
      toast.success(`Clip created (${formatDuration(clip.duration)})`, { duration: 3000 });
    }
  }, [createClip, channelName]);

  const handleCloseClip = useCallback(() => {
    setActiveClip(null);
    clearLastClip();
  }, [clearLastClip]);

  const handleTap = (_e: React.MouseEvent | React.TouchEvent) => {
    if (!isMobile) return;

    const now = Date.now();
    const timeSinceLastTap = now - lastTapRef.current;

    // Double-tap detection
    if (timeSinceLastTap < 300) {
      // Double tap — toggle fullscreen
      if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
      toggleFullscreen(containerRef?.current);
      lastTapRef.current = 0;
      return;
    }

    lastTapRef.current = now;

    // Single tap — toggle controls with a delay to detect double tap
    tapTimeoutRef.current = setTimeout(() => {
      setShowControls((prev) => !prev);
      if (showControls) {
        if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
        controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 4000);
      }
    }, 300);
  };

  // Touch gesture handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!isMobile) return;
    const touch = e.touches[0];
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
    };
  }, [isMobile]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!isMobile || !touchStartRef.current) return;
    const touch = e.changedTouches[0];
    const startX = touchStartRef.current.x;
    const startY = touchStartRef.current.y;
    const endX = touch.clientX;
    const endY = touch.clientY;

    const diffX = endX - startX;
    const diffY = endY - startY;
    const absX = Math.abs(diffX);
    const absY = Math.abs(diffY);

    // Minimum swipe distance
    const minSwipe = 50;
    const video = videoRef.current;
    if (!video) return;

    // Determine if it's a horizontal or vertical swipe
    if (absX > absY && absX > minSwipe) {
      // Horizontal swipe = seek
      const seekSeconds = (diffX / window.innerWidth) * 60; // Max 60s seek
      video.currentTime = Math.max(0, video.currentTime + seekSeconds);
    } else if (absY > absX && absY > minSwipe) {
      // Vertical swipe on left half = volume
      const containerRect = containerRef.current?.getBoundingClientRect();
      if (containerRect && startX < containerRect.left + containerRect.width / 2) {
        const volumeDelta = -diffY / window.innerHeight;
        video.volume = Math.max(0, Math.min(1, video.volume + volumeDelta));
        changeVolume(Math.max(0, Math.min(1, video.volume + volumeDelta)));
      }
    }

    touchStartRef.current = null;
  }, [isMobile, videoRef, changeVolume]);

  // Auto-hide controls on mobile after initial display
  useEffect(() => {
    if (isMobile && src) {
      controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 4000);
      return () => {
        if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      };
    }
  }, [isMobile, src]);

  // Sync video volume on mount and when store changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = volume;
    video.muted = isMuted;
  }, [src, volume, isMuted]); // Re-sync when src, volume, or mute state changes

  // PiP event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleEnterPiP = () => setPiP(true);
    const handleLeavePiP = () => setPiP(false);

    video.addEventListener('enterpictureinpicture', handleEnterPiP);
    video.addEventListener('leavepictureinpicture', handleLeavePiP);

    return () => {
      video.removeEventListener('enterpictureinpicture', handleEnterPiP);
      video.removeEventListener('leavepictureinpicture', handleLeavePiP);
    };
  }, [setPiP]);

  // Download recording when available
  const [showRecordingDownload, setShowRecordingDownload] = useState(false);

  useEffect(() => {
    if (recorderUrl && !recorderIsRecording) {
      setShowRecordingDownload(true);
    }
  }, [recorderUrl, recorderIsRecording]);

  return (
    <div ref={sleepingContainerRef} className="w-full">
    <div
      ref={containerRef}
      onClick={handleTap}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className={`relative group bg-black rounded-lg overflow-hidden transition-all duration-300 ${
        isExpanded ? 'w-full' : chatVisible ? (chatPosition === 'right' ? 'flex-1' : 'flex-1') : 'w-full'
      }`}
    >
      {/* Video Element */}
      <video
        aria-label="Live stream video player"
        ref={videoRef}
        className={`w-full aspect-video bg-black transition-opacity duration-300 ${
          isAudioOnly ? 'opacity-0 absolute inset-0' : ''
        }`}
        playsInline
        autoPlay
        muted={isMuted}
      />

      {/* Audio Only Overlay */}
      {src && isAudioOnly && (
        <AudioOnlyOverlay
          channelName={channelName}
          onTogglePlay={togglePlay}
          onToggleMute={toggleMute}
          onVolumeChange={changeVolume}
        />
      )}

      {/* Autoplay Blocked Overlay */}
      {autoplayBlocked && !error && src && connectionState === 'connected' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-[15]">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleManualPlay();
            }}
            className="flex flex-col items-center gap-2 text-white hover:scale-105 transition-transform"
          >
            <div className="w-16 h-16 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center">
              <svg className="w-8 h-8 ml-1" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
            <span className="text-xs text-white/60">Click to play (muted)</span>
          </button>
        </div>
      )}

      {/* Loading Spinner */}
      {isLoading && !error && src && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-10">
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-3 border-white/20 border-t-white" />
            <span className="text-xs text-white/60">Loading stream...</span>
          </div>
        </div>
      )}

      {/* Connection Status */}
      <ConnectionStatus state={connectionState} />

      {/* Error Overlay */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
          <div className="text-center text-white max-w-xs px-4">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-red-500/10 flex items-center justify-center">
              <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <div className="text-red-400 text-sm font-semibold mb-1">Playback Error</div>
            <div className="text-xs text-gray-400 mb-3">{error}</div>
            {isRetrying && (
              <div className="flex items-center justify-center gap-2 text-xs text-yellow-400 mb-3">
                <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Retry {retryCount}...
              </div>
            )}
            <div className="flex items-center justify-center gap-2 flex-wrap">
              {!isRetrying && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    manualRetry();
                  }}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-white/10 hover:bg-white/20 rounded-md transition-colors"
                >
                  <RefreshCw className="h-3 w-3" />
                  Retry Playback
                </button>
              )}
              {retryCount >= 2 && !isRetrying && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    // Try switching to normal latency mode and retry
                    usePlayerStore.getState().setLatencyMode('normal');
                    setTimeout(() => manualRetry(), 100);
                  }}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-primary/20 hover:bg-primary/30 text-primary rounded-md transition-colors"
                >
                  <Settings className="h-3 w-3" />
                  Safe Mode
                </button>
              )}
              {retryCount >= 4 && !isRetrying && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    // Try low latency mode as last resort
                    usePlayerStore.getState().setLatencyMode('low');
                    setTimeout(() => manualRetry(), 100);
                  }}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-md transition-colors"
                >
                  <Eye className="h-3 w-3" />
                  Low Latency Retry
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* No Source */}
      {!src && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-950">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/5 flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="text-gray-400 text-sm">Search for a channel to start watching</div>
            <div className="text-gray-500 text-xs mt-1">Try: xqc, asmr, pool, rust, shroud</div>
          </div>
        </div>
      )}

      {/* Player Overlay (visible on hover on desktop, always on mobile) */}
      {src && !isAudioOnly && <PlayerOverlay channelName={channelName} slotId={syncSlotId} />}

      {/* Quality selector — top right */}
      {src && !error && !isAudioOnly && qualityLevels.length > 0 && (
        <div className={`absolute top-3 right-3 z-10 transition-opacity ${
          isMobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}>
          <QualitySelector
            currentQuality={currentQuality}
            qualityLevels={qualityLevels}
            onSetQuality={setQuality}
          />
        </div>
      )}

      {/* Recording Indicator */}
      {isRecording && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 bg-black/70 px-2.5 py-1 rounded-full">
          <span className={`w-2 h-2 rounded-full ${isRecordingPaused ? 'bg-yellow-400' : 'bg-red-500'} ${isRecordingPaused ? '' : 'record-pulse'}`} />
          <span className="text-[10px] text-white font-mono">
            {isRecordingPaused ? 'PAUSED' : formatDuration(recordingDuration)}
          </span>
        </div>
      )}

      {/* Recording Download Banner */}
      {showRecordingDownload && recorderUrl && !isRecording && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-green-500/20 border border-green-500/30 px-3 py-1.5 rounded-full">
          <span className="text-[10px] text-green-300">Recording ready!</span>
          <button
            className="text-[10px] text-white bg-green-500/30 hover:bg-green-500/40 px-2 py-0.5 rounded transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              const a = document.createElement('a');
              a.href = recorderUrl;
              a.download = `recording_${channelName || 'stream'}_${new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')}.webm`;
              a.click();
            }}
          >
            Download
          </button>
          <button
            className="text-[10px] text-white/60 hover:text-white px-1 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              setShowRecordingDownload(false);
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Clip Buffer Status Indicator */}
      {isCapturing && !activeClip && src && (
        <div className={`absolute top-3 right-14 z-10 transition-opacity ${
          isMobile ? 'opacity-60' : 'opacity-0 group-hover:opacity-60'
        }`}>
          <span className="text-[9px] text-white/40 font-mono">
            Buffer: {bufferDuration.toFixed(0)}s
          </span>
        </div>
      )}

      {/* PiP Indicator */}
      {isPiP && (
        <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5 bg-black/70 px-2 py-1 rounded-full">
          <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <rect x="2" y="2" width="20" height="20" rx="2" strokeWidth="2" />
            <rect x="12" y="12" width="8" height="8" rx="1" fill="white" />
          </svg>
          <span className="text-[10px] text-white">PiP</span>
        </div>
      )}

      {/* Controls */}
      {src && !isAudioOnly && (
        <div className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent ${
          isMobile
            ? (showControls ? 'opacity-100' : 'opacity-0 pointer-events-none')
            : 'opacity-0 group-hover:opacity-100'
        } transition-opacity duration-200`}>
          {/* DVR Timeline */}
          <DVRTimeline videoRef={videoRef} />
          {/* Playback Controls */}
          <PlaybackControls
            videoRef={videoRef}
            containerRef={containerRef}
            onClipCreate={handleClipCreate}
            onRecordToggle={handleRecordToggle}
            onRecordPause={handleRecordPause}
            onRecordResume={handleRecordResume}
          />
        </div>
      )}

      {/* Clip Creator */}
      {activeClip && (
        <ClipCreator clip={activeClip} onClose={handleCloseClip} />
      )}

      {/* Latency Indicator */}
      {src && <LatencyControl />}

      {/* Sleeping indicator */}
      {isSleeping && src && (
        <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5 bg-black/70 px-2 py-1 rounded-full">
          <span className="w-2 h-2 rounded-full bg-yellow-400" />
          <span className="text-[10px] text-white">Sleeping</span>
        </div>
      )}
    </div>
    </div>
  );
}
