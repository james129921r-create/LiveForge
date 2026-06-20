'use client';

import { useEffect, useRef, useCallback, useState } from 'react';

/**
 * useStreamSleeping — pauses HLS streams when they are not visible on screen.
 *
 * Uses the Intersection Observer API to detect visibility. When a stream goes
 * invisible (scrolled off-screen or in a non-active tab), it:
 * 1. Pauses the video element
 * 2. Sets an isSleeping flag
 * 3. When it becomes visible again, resumes playback
 *
 * This saves significant CPU/GPU resources when many streams are open.
 *
 * Enhanced features:
 * - sleepThresholdMs: Delay before sleeping (default 30s) to avoid thrashing
 * - aggressiveSleep: Also mutes audio when sleeping
 * - Grace period on wake-up to prevent rapid sleep/wake cycles
 * - Statistics tracking for monitoring
 */

export interface UseStreamSleepingOptions {
  /** Milliseconds of inactivity before sleeping (default: 30000 = 30 seconds) */
  sleepThresholdMs?: number;
  /** When true, also mutes audio on sleeping streams (default: false) */
  aggressiveSleep?: boolean;
  /** Grace period after wake-up before re-sleeping is allowed (default: 10000 = 10 seconds) */
  wakeGracePeriodMs?: number;
}

// ─── Global Sleeping Statistics ────────────────────────────────────────────────

interface SleepingStats {
  sleepingCount: number;
  wakeCount: number;
  sleepCount: number;
}

const sleepingStreams = new Set<string>();
let totalWakeEvents = 0;
let totalSleepEvents = 0;

/**
 * Get global statistics about stream sleeping.
 * Useful for monitoring and diagnostics.
 */
export function getStreamSleepingStats(): SleepingStats {
  return {
    sleepingCount: sleepingStreams.size,
    wakeCount: totalWakeEvents,
    sleepCount: totalSleepEvents,
  };
}

export function useStreamSleeping(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  slotId: string,
  options: UseStreamSleepingOptions = {}
) {
  const {
    sleepThresholdMs = 30_000,
    aggressiveSleep = false,
    wakeGracePeriodMs = 10_000,
  } = options;

  const [isSleeping, setIsSleeping] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Track when the stream went offscreen to implement sleepThreshold
  const wentOffscreenAtRef = useRef<number | null>(null);
  // Track when the stream last woke up to implement grace period
  const lastWakeAtRef = useRef<number>(0);
  // Threshold timer ref
  const sleepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track pre-sleep mute state so we can restore it
  const wasMutedBeforeSleepRef = useRef<boolean | null>(null);

  const sleep = useCallback((video: HTMLVideoElement) => {
    if (!video.paused) {
      video.pause();
    }
    // Aggressive sleep: also mute audio
    if (aggressiveSleep && !video.muted) {
      wasMutedBeforeSleepRef.current = video.muted;
      video.muted = true;
    }
    setIsSleeping(true);
    sleepingStreams.add(slotId);
    totalSleepEvents++;
  }, [slotId, aggressiveSleep]);

  const wake = useCallback((video: HTMLVideoElement) => {
    video.play().catch(() => {
      // Autoplay may be blocked; ignore
    });
    // Restore mute state if aggressiveSleep was used
    if (aggressiveSleep && wasMutedBeforeSleepRef.current !== null) {
      video.muted = wasMutedBeforeSleepRef.current;
      wasMutedBeforeSleepRef.current = null;
    }
    setIsSleeping(false);
    sleepingStreams.delete(slotId);
    totalWakeEvents++;
    lastWakeAtRef.current = Date.now();
  }, [slotId, aggressiveSleep]);

  const handleVisibilityChange = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      for (const entry of entries) {
        const video = videoRef.current;
        if (!video) return;

        if (entry.isIntersecting && entry.intersectionRatio > 0.05) {
          // Stream is now visible — cancel any pending sleep timer
          if (sleepTimerRef.current) {
            clearTimeout(sleepTimerRef.current);
            sleepTimerRef.current = null;
          }
          wentOffscreenAtRef.current = null;

          // Resume if sleeping
          if (isSleeping) {
            wake(video);
          }
        } else {
          // Stream is no longer visible — start sleep threshold timer
          if (!video.paused && !isSleeping) {
            // Check if we're still in the wake grace period
            const now = Date.now();
            const timeSinceWake = now - lastWakeAtRef.current;
            if (timeSinceWake < wakeGracePeriodMs) {
              // Still in grace period, don't sleep yet
              return;
            }

            wentOffscreenAtRef.current = now;

            // Clear any existing timer
            if (sleepTimerRef.current) {
              clearTimeout(sleepTimerRef.current);
            }

            // Set a timer to sleep after the threshold
            sleepTimerRef.current = setTimeout(() => {
              const currentVideo = videoRef.current;
              if (currentVideo && !currentVideo.paused) {
                sleep(currentVideo);
              }
              sleepTimerRef.current = null;
            }, sleepThresholdMs);
          }
        }
      }
    },
    [videoRef, isSleeping, sleep, wake, sleepThresholdMs, wakeGracePeriodMs]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    observerRef.current = new IntersectionObserver(handleVisibilityChange, {
      root: null,
      rootMargin: '50px',
      threshold: [0, 0.05, 0.5],
    });

    observerRef.current.observe(container);

    return () => {
      observerRef.current?.disconnect();
      if (sleepTimerRef.current) {
        clearTimeout(sleepTimerRef.current);
        sleepTimerRef.current = null;
      }
      // Clean up global sleeping set
      sleepingStreams.delete(slotId);
    };
  }, [handleVisibilityChange, slotId]);

  // Also listen for document visibility changes (tab switching)
  useEffect(() => {
    const handleDocumentVisibility = () => {
      const video = videoRef.current;
      if (!video) return;

      if (document.hidden) {
        // Tab is hidden — sleep immediately (no threshold for tab switches)
        if (!video.paused && !isSleeping) {
          sleep(video);
        }
      } else {
        // Tab is visible again — wake sleeping streams
        if (isSleeping) {
          wake(video);
        }
      }
    };

    document.addEventListener('visibilitychange', handleDocumentVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleDocumentVisibility);
    };
  }, [videoRef, isSleeping, sleep, wake]);

  return {
    isSleeping,
    containerRef,
  };
}
