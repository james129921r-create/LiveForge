'use client';

import { useCallback, useState, useEffect, useRef } from 'react';
import { usePlayerStore } from '@/stores/playerStore';
import { useIsMobile } from '@/hooks/use-mobile';
import { Slider } from '@/components/ui/slider';

interface DVRTimelineProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
}

// Segment marker type for visual indicators on the timeline
interface SegmentMarker {
  position: number; // 0-100 percentage
  type: 'ad' | 'highlight' | 'chapter' | 'buffer';
  label?: string;
}

// Format time from live edge (used in multiple places)
function formatTimeFromLive(seconds: number): string {
  if (seconds <= 0) return 'LIVE';
  if (seconds < 60) return `-${Math.round(seconds)}s`;
  if (seconds < 3600) return `-${Math.round(seconds / 60)}m`;
  return `-${Math.round(seconds / 3600)}h`;
}

export function DVRTimeline({ videoRef }: DVRTimelineProps) {
  const { dvrPosition, dvrDuration, isDvrAvailable, latencyMode, setDvrPosition } = usePlayerStore();
  const isMobile = useIsMobile();
  const [bufferedPercent, setBufferedPercent] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekPreviewTime, setSeekPreviewTime] = useState<number | null>(null);
  const [segmentMarkers, setSegmentMarkers] = useState<SegmentMarker[]>([]);
  const [currentPlaybackPercent, setCurrentPlaybackPercent] = useState(0);
  const timelineRef = useRef<HTMLDivElement>(null);

  // Update buffered range periodically
  useEffect(() => {
    if (latencyMode !== 'dvr') return;

    const interval = setInterval(() => {
      const video = videoRef.current;
      if (!video || video.buffered.length === 0 || dvrDuration <= 0) {
        setBufferedPercent(0);
        return;
      }
      const end = video.buffered.end(video.buffered.length - 1);
      const pct = (end / dvrDuration) * 100;
      setBufferedPercent(Math.min(pct, 100));
    }, 500);

    return () => clearInterval(interval);
  }, [latencyMode, videoRef, dvrDuration]);

  // Generate segment markers based on buffered ranges
  useEffect(() => {
    if (!isDvrAvailable || dvrDuration <= 0) {
      setSegmentMarkers([]);
      return;
    }

    const video = videoRef.current;
    if (!video || video.buffered.length === 0) {
      setSegmentMarkers([]);
      return;
    }

    const markers: SegmentMarker[] = [];

    // Add buffer segment markers
    for (let i = 0; i < video.buffered.length; i++) {
      const start = (video.buffered.start(i) / dvrDuration) * 100;
      const end = (video.buffered.end(i) / dvrDuration) * 100;
      if (end - start > 2) { // Only show markers for significant segments
        markers.push({
          position: start,
          type: 'buffer',
          label: undefined,
        });
      }
    }

    // Add regular interval markers (every 5 minutes for DVR window)
    const intervalSeconds = 300; // 5 minutes
    for (let t = intervalSeconds; t < dvrDuration; t += intervalSeconds) {
      const pos = (t / dvrDuration) * 100;
      markers.push({
        position: pos,
        type: 'chapter',
        label: formatTimeFromLive(dvrDuration - t),
      });
    }

    setSegmentMarkers(markers);
  }, [isDvrAvailable, dvrDuration, videoRef, latencyMode]);

  // Keyboard shortcuts for seeking
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const video = videoRef.current;
      if (!video || !isDvrAvailable) return;

      // Don't capture if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        video.currentTime = Math.max(0, video.currentTime - 10);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [videoRef, isDvrAvailable]);

  const handleSeek = useCallback(
    ([value]: number[]) => {
      const video = videoRef.current;
      if (!video || !isDvrAvailable) return;
      const seekTime = (value / 100) * dvrDuration;
      video.currentTime = seekTime;
      setDvrPosition(value);
    },
    [videoRef, dvrDuration, isDvrAvailable, setDvrPosition]
  );

  const handleSeekStart = useCallback(() => {
    setIsSeeking(true);
  }, []);

  const handleSeekEnd = useCallback(() => {
    setIsSeeking(false);
    setSeekPreviewTime(null);
  }, []);

  const _handleTimelineHover = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current || dvrDuration <= 0) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const timeFromLive = dvrDuration * (1 - percent / 100);
    setSeekPreviewTime(timeFromLive);
  }, [dvrDuration]);

  const handleReturnToLive = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isFinite(video.duration)) {
      video.currentTime = video.duration;
      setDvrPosition(100);
    }
  }, [videoRef, setDvrPosition]);

  // Track current playback position for the indicator
  useEffect(() => {
    if (!isDvrAvailable || dvrDuration <= 0) return;
    const interval = setInterval(() => {
      const video = videoRef.current;
      if (video && isFinite(video.currentTime) && isFinite(video.duration) && video.duration > 0) {
        setCurrentPlaybackPercent((video.currentTime / video.duration) * 100);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [isDvrAvailable, dvrDuration, videoRef]);

  if (!isDvrAvailable || dvrDuration <= 0) {
    return (
      <div className="px-3">
        <div className="h-1 bg-white/20 rounded-full overflow-hidden">
          <div className="h-full w-full bg-red-500 rounded-full" />
        </div>
      </div>
    );
  }

  const positionPercent = dvrDuration > 0 ? (dvrPosition / 100) * 100 : 0;
  const isSeekedBack = positionPercent < 95;

  // Calculate time from live edge
  const currentTimeFromLive = dvrDuration > 0 ? (dvrDuration * (1 - dvrPosition / 100)) : 0;

  // Time labels for DVR window
  const timeLabels = [
    { position: 0, label: formatTimeFromLive(dvrDuration) },
    { position: 25, label: formatTimeFromLive(dvrDuration * 0.75) },
    { position: 50, label: formatTimeFromLive(dvrDuration * 0.5) },
    { position: 75, label: formatTimeFromLive(dvrDuration * 0.25) },
  ];

  return (
    <div className="px-3 relative" ref={timelineRef}>
      {/* Segment markers (tick marks) */}
      {latencyMode === 'dvr' && (
        <div className="absolute inset-x-3 top-1/2 -translate-y-1/2 h-0.5 pointer-events-none">
          {/* Buffered range indicator */}
          {bufferedPercent > 0 && (
            <div
              className="absolute h-full bg-white/30 rounded-full"
              style={{ left: '0%', width: `${bufferedPercent}%` }}
            />
          )}

          {/* Segment markers */}
          {segmentMarkers.map((marker, i) => (
            <div
              key={i}
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
              style={{ left: `${marker.position}%` }}
            >
              <div className={`w-0.5 ${
                marker.type === 'buffer' ? 'h-1 bg-white/20' :
                marker.type === 'chapter' ? 'h-2 bg-white/40' :
                'h-1.5 bg-yellow-400/50'
              }`} />
            </div>
          ))}

          {/* Current playback position indicator (thin vertical line) */}
          {currentPlaybackPercent > 0 && (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-white/60 z-10 -translate-x-1/2"
              style={{ left: `${currentPlaybackPercent}%` }}
            />
          )}
        </div>
      )}

      {/* Seek preview tooltip */}
      {isSeeking && seekPreviewTime !== null && (
        <div
          className="absolute -top-6 z-20 bg-black/80 text-white text-[9px] px-1.5 py-0.5 rounded pointer-events-none"
          style={{
            left: `${positionPercent}%`,
            transform: 'translateX(-50%)',
          }}
        >
          {formatTimeFromLive(seekPreviewTime)}
        </div>
      )}

      <Slider
        value={[positionPercent]}
        max={100}
        step={0.1}
        className={`cursor-pointer ${
          isMobile
            ? '[&_[role=slider]]:h-4 [&_[role=slider]]:w-4'
            : '[&_[role=slider]]:h-3 [&_[role=slider]]:w-3'
        }`}
        onValueChange={handleSeek}
        onPointerDown={handleSeekStart}
        onPointerUp={handleSeekEnd}
      />

      {/* Time labels & Return to Live */}
      {(isSeekedBack || latencyMode === 'dvr') && (
        <div className="flex items-center justify-between mt-1">
          <span className="text-[9px] text-gray-400">
            {formatTimeFromLive(currentTimeFromLive)}
          </span>

          {isSeekedBack && (
            <button
              className="flex items-center gap-1 text-[10px] text-red-400 hover:text-red-300 transition-colors"
              onClick={handleReturnToLive}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              Return to LIVE
            </button>
          )}

          <span className="text-[9px] text-red-400 font-medium flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            LIVE
          </span>
        </div>
      )}

      {/* DVR time markers */}
      {latencyMode === 'dvr' && !isMobile && (
        <div className="relative h-3 mt-0.5">
          {timeLabels.map(({ position, label }) => (
            <span
              key={position}
              className="absolute text-[8px] text-gray-500 transform -translate-x-1/2"
              style={{ left: `${position}%` }}
            >
              {label}
            </span>
          ))}
        </div>
      )}

      {/* Keyboard shortcut hint */}
      {isDvrAvailable && !isMobile && latencyMode === 'dvr' && (
        <div className="flex items-center justify-center gap-3 mt-0.5">
          <span className="text-[8px] text-gray-600">
            ← -10s
          </span>
          <span className="text-[8px] text-gray-600">
            → +10s
          </span>
        </div>
      )}
    </div>
  );
}
