'use client';

import { useCallback, useRef, useEffect, useState } from 'react';
import { usePlayerStore } from '@/stores/playerStore';
import { toast } from '@/hooks/use-toast';

// ─── Global Video Element Registry ─────────────────────────────────────────
// Each HLSPlayer instance registers its video element here so the sync
// logic can access all active streams without prop-drilling refs.

interface RegisteredStream {
  slotId: string;
  video: HTMLVideoElement;
  /** Track if this slot is active (not removed) */
  active: boolean;
}

const streamRegistry: RegisteredStream[] = [];

export function registerStreamVideo(slotId: string, video: HTMLVideoElement | null) {
  if (!video) {
    // Remove if null
    const idx = streamRegistry.findIndex((s) => s.slotId === slotId);
    if (idx >= 0) streamRegistry.splice(idx, 1);
    return;
  }
  const existing = streamRegistry.find((s) => s.slotId === slotId);
  if (existing) {
    existing.video = video;
    existing.active = true;
  } else {
    streamRegistry.push({ slotId, video, active: true });
  }
}

export function unregisterStreamVideo(slotId: string) {
  const idx = streamRegistry.findIndex((s) => s.slotId === slotId);
  if (idx >= 0) {
    // Clean up: mark as inactive first, then remove
    streamRegistry.splice(idx, 1);
  }
}

// ─── Sync Hook ─────────────────────────────────────────────────────────────

interface UseStreamSyncReturn {
  enabled: boolean;
  referenceStreamId: string | null;
  syncAll: () => void;
}

/** Sync interval for active streams (foreground) */
const SYNC_INTERVAL_ACTIVE_MS = 5000;

/** Sync interval for inactive/sleeping streams (background) — reduced frequency */
const SYNC_INTERVAL_INACTIVE_MS = 15000; // every 3s → 15s for less active streams

/** Only adjust if latency diff exceeds 2 seconds */
const LATENCY_THRESHOLD_MS = 2000;

/**
 * Maximum latency difference guard: if the difference between two streams
 * exceeds this value, don't try to sync them (the stream is probably
 * too far behind and seeking would cause a jarring jump).
 */
const MAX_LATENCY_DIFF_MS = 60_000; // 60 seconds

export function useStreamSync(): UseStreamSyncReturn {
  const streamSyncEnabled = usePlayerStore((s) => s.streamSyncEnabled);
  const updateStreamLatency = usePlayerStore((s) => s.updateStreamLatency);
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [referenceStreamId, setReferenceStreamId] = useState<string | null>(null);
  const lastToastRef = useRef<number>(0);

  // Track whether we have any inactive/sleeping streams to adjust interval
  const hasInactiveStreamsRef = useRef(false);

  // Calculate latencies for all registered streams
  const getLatencies = useCallback((): Record<string, number> => {
    const latencies: Record<string, number> = {};

    for (const stream of streamRegistry) {
      if (!stream.active) continue;
      const { slotId, video } = stream;
      if (!video || !isFinite(video.duration) || video.duration === 0) continue;

      // For live streams: latency = duration - currentTime (how far behind live edge)
      const latency = (video.duration - video.currentTime) * 1000;
      latencies[slotId] = latency;
      updateStreamLatency(slotId, latency);
    }

    return latencies;
  }, [updateStreamLatency]);

  // Synchronize all streams to the reference stream
  const syncAll = useCallback(() => {
    const latencies = getLatencies();
    const entries = Object.entries(latencies);

    if (entries.length < 2) return; // Need at least 2 streams to sync

    // Find reference stream (closest to live edge = lowest latency)
    let minLatency = Infinity;
    let refId: string | null = null;

    for (const [slotId, latency] of entries) {
      if (latency < minLatency) {
        minLatency = latency;
        refId = slotId;
      }
    }

    if (!refId) return;

    setReferenceStreamId(refId);

    // Get the reference stream's video element
    const refStream = streamRegistry.find((s) => s.slotId === refId);
    if (!refStream?.video) return;

    const referenceLatency = minLatency;
    let syncedCount = 0;
    let inactiveCount = 0;

    // Align each non-reference stream to the reference's latency
    for (const stream of streamRegistry) {
      if (!stream.active) continue;
      if (stream.slotId === refId) continue;
      const { video } = stream;
      if (!video || !isFinite(video.duration) || video.duration === 0) continue;

      const currentLatency = (video.duration - video.currentTime) * 1000;
      const latencyDiff = currentLatency - referenceLatency;

      // Check if the stream is paused (inactive/sleeping)
      if (video.paused) {
        inactiveCount++;
        continue; // Don't try to sync sleeping/paused streams
      }

      // Max latency diff guard: if diff is too large, skip this stream
      if (Math.abs(latencyDiff) > MAX_LATENCY_DIFF_MS) {
        continue;
      }

      // Only adjust if the latency difference exceeds the threshold
      if (Math.abs(latencyDiff) > LATENCY_THRESHOLD_MS) {
        // Calculate target position: we want this stream to have the same
        // latency as the reference, so seek to (duration - referenceLatency/1000)
        const targetTime = video.duration - referenceLatency / 1000;

        if (isFinite(targetTime) && targetTime > 0) {
          // Use requestAnimationFrame to avoid direct mutation during render
          requestAnimationFrame(() => {
            video.currentTime = targetTime;
          });
          syncedCount++;
        }
      }
    }

    // Track whether we have inactive streams to adjust polling interval
    hasInactiveStreamsRef.current = inactiveCount > 0;

    // Show a toast notification when streams are synchronized (throttled)
    if (syncedCount > 0) {
      const now = Date.now();
      // Only show toast every 15 seconds to avoid spam
      if (now - lastToastRef.current > 15000) {
        lastToastRef.current = now;
        toast({
          title: 'Streams Synchronized',
          description: `Aligned ${syncedCount} stream${syncedCount > 1 ? 's' : ''} to live edge (Δ > ${(LATENCY_THRESHOLD_MS / 1000).toFixed(0)}s)`,
        });
      }
    }
  }, [getLatencies]);

  // Start/stop sync interval when enabled changes
  useEffect(() => {
    if (streamSyncEnabled) {
      // Run immediate sync
      syncAll();

      // Start sync interval — use the active interval initially
      // The interval adjusts based on inactive stream count
      const getIntervalMs = () => {
        return hasInactiveStreamsRef.current
          ? SYNC_INTERVAL_INACTIVE_MS
          : SYNC_INTERVAL_ACTIVE_MS;
      };

      // Use a dynamic interval that adjusts based on stream activity
      const runDynamicInterval = () => {
        syncAll();
        syncIntervalRef.current = setTimeout(runDynamicInterval, getIntervalMs()) as unknown as ReturnType<typeof setInterval>;
      };

      syncIntervalRef.current = setTimeout(runDynamicInterval, getIntervalMs()) as unknown as ReturnType<typeof setInterval>;
    } else {
      if (syncIntervalRef.current) {
        clearTimeout(syncIntervalRef.current as unknown as ReturnType<typeof setTimeout>);
        syncIntervalRef.current = null;
      }
      setReferenceStreamId(null);
    }

    return () => {
      if (syncIntervalRef.current) {
        clearTimeout(syncIntervalRef.current as unknown as ReturnType<typeof setTimeout>);
        syncIntervalRef.current = null;
      }
    };
  }, [streamSyncEnabled, syncAll]);

  return {
    enabled: streamSyncEnabled,
    referenceStreamId,
    syncAll,
  };
}
