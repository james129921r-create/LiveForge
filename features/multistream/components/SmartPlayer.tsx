'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { HLSPlayer } from '@/features/player/components';
import { fetchLivestream } from '@/lib/kick-api';
import { useStreamSleeping } from '@/hooks/useStreamSleeping';
import type { StreamChannel } from '@/types';
import { useMultiStreamStore } from '@/stores/multiStreamStore';
import { Loader2, AlertTriangle, RefreshCw, Moon } from 'lucide-react';

interface SmartPlayerProps {
  channel: StreamChannel;
}

/**
 * Smart player wrapper that resolves the HLS playback URL if it's missing.
 *
 * The Kick API returns a different playback_url for each session. When channels
 * are restored from localStorage, the old hlsUrl may be stale or null.
 * This component:
 * 1. If hlsUrl exists, passes it directly to HLSPlayer
 * 2. If hlsUrl is missing, fetches the livestream data to get the current URL
 * 3. Updates the multiStreamStore with the fresh URL so it persists
 * 4. Implements stream sleeping — pauses invisible streams to save resources
 */
const MAX_RESOLVE_RETRIES = 3;
const RESOLVE_RETRY_BASE_DELAY = 1000; // 1s, 2s, 4s
const HLS_TOKEN_REFRESH_INTERVAL = 4 * 60 * 60 * 1000; // Refresh HLS URL every 4 hours

export function SmartPlayer({ channel }: SmartPlayerProps) {
  const [resolvedUrl, setResolvedUrl] = useState<string | undefined>(channel.hlsUrl ?? undefined);
  const [isResolving, setIsResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [resolveAttempt, setResolveAttempt] = useState(0);
  const { addChannelToSlot } = useMultiStreamStore();

  // Find the slot ID for this channel for per-stream audio and sleeping
  const slots = useMultiStreamStore((s) => s.slots);
  const slotId = useMemo(() => {
    const slot = slots.find(s => s.channel?.username === channel.username);
    return slot?.id ?? 'slot-0';
  }, [slots, channel.username]);

  // Stream sleeping — video ref will be passed from the container div
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const { isSleeping, containerRef: sleepContainerRef } = useStreamSleeping(videoRef, slotId);

  // Resolve livestream with retry and exponential backoff
  const resolveWithRetry = useCallback(async (username: string, maxRetries: number = MAX_RESOLVE_RETRIES): Promise<{ playbackUrl: string | null; data: Awaited<ReturnType<typeof fetchLivestream>> }> => {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const data = await fetchLivestream(username);
        if (data?.playbackUrl) {
          return { playbackUrl: data.playbackUrl, data };
        }
        lastError = new Error('No playback URL found');
      } catch (err) {
        lastError = err instanceof Error ? err : new Error('Failed to load stream data');
      }

      if (attempt < maxRetries - 1) {
        const delay = RESOLVE_RETRY_BASE_DELAY * Math.pow(2, attempt);
        setResolveAttempt(attempt + 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    return { playbackUrl: null, data: null };
  }, []);

  useEffect(() => {
    if (channel.hlsUrl) {
      setResolvedUrl(channel.hlsUrl);
      return;
    }

    if (!channel.isLive && !channel.hlsUrl) {
      setResolveError('Channel is offline — no stream available');
      return;
    }

    let cancelled = false;
    setIsResolving(true);
    setResolveError(null);
    setResolveAttempt(0);

    resolveWithRetry(channel.username)
      .then(({ playbackUrl, data }) => {
        if (cancelled) return;
        if (playbackUrl && data) {
          setResolvedUrl(playbackUrl);
          const updatedChannel: StreamChannel = {
            ...channel,
            hlsUrl: playbackUrl,
            isLive: data.isLive,
            viewerCount: data.viewerCount,
            title: data.title || channel.title,
            startedAt: data.startedAt || channel.startedAt,
          };
          const { slots } = useMultiStreamStore.getState();
          const targetSlot = slots.find(s => s.channel?.username === channel.username);
          if (targetSlot) {
            addChannelToSlot(targetSlot.id, updatedChannel);
          }
        } else {
          setResolveError('No playback URL found — the stream may have ended or is blocked');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResolveError('Failed to load stream data after multiple attempts');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsResolving(false);
          setResolveAttempt(0);
        }
      });

    return () => { cancelled = true; };
  }, [channel.username, channel.hlsUrl, channel.isLive, addChannelToSlot, resolveWithRetry]);

  const handleRetry = () => {
    setResolveError(null);
    setIsResolving(true);
    setResolveAttempt(0);
    resolveWithRetry(channel.username)
      .then(({ playbackUrl }) => {
        if (playbackUrl) {
          setResolvedUrl(playbackUrl);
        } else {
          setResolveError('No playback URL found');
        }
      })
      .catch(() => setResolveError('Failed to load stream data'))
      .finally(() => {
        setIsResolving(false);
        setResolveAttempt(0);
      });
  };

  // Periodically refresh the HLS URL to avoid token expiration
  useEffect(() => {
    if (!channel.hlsUrl || !channel.isLive) return;

    const intervalId = setInterval(async () => {
      try {
        const data = await fetchLivestream(channel.username);
        if (data?.playbackUrl) {
          setResolvedUrl(data.playbackUrl);
          const updatedChannel: StreamChannel = {
            ...channel,
            hlsUrl: data.playbackUrl,
            isLive: data.isLive,
            viewerCount: data.viewerCount,
            title: data.title || channel.title,
          };
          const { slots } = useMultiStreamStore.getState();
          const targetSlot = slots.find(s => s.channel?.username === channel.username);
          if (targetSlot) {
            addChannelToSlot(targetSlot.id, updatedChannel);
          }
        }
      } catch {
        // Silently ignore refresh failures
      }
    }, HLS_TOKEN_REFRESH_INTERVAL);

    return () => clearInterval(intervalId);
  }, [channel.username, channel.hlsUrl, channel.isLive, addChannelToSlot]);

  // Show resolving state
  if (isResolving) {
    return (
      <div className="w-full aspect-video bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-white/50" />
          <span className="text-xs text-white/50">Loading stream for {channel.displayName}...</span>
          {resolveAttempt > 0 && (
            <span className="text-[10px] text-white/30">Retry {resolveAttempt}/{MAX_RESOLVE_RETRIES}...</span>
          )}
        </div>
      </div>
    );
  }

  // Show error state
  if (resolveError && !resolvedUrl) {
    return (
      <div className="w-full aspect-video bg-gradient-to-br from-gray-900 to-gray-950 flex items-center justify-center">
        <div className="text-center max-w-xs px-4">
          <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-yellow-500/50" />
          <div className="text-sm text-white/70 mb-1">{channel.displayName}</div>
          <div className="text-xs text-white/40 mb-3">{resolveError}</div>
          <button
            onClick={handleRetry}
            className="flex items-center gap-1.5 mx-auto px-3 py-1.5 text-xs bg-white/10 hover:bg-white/20 rounded-md transition-colors text-white/70"
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={sleepContainerRef} className="relative w-full h-full">
      <HLSPlayer src={resolvedUrl} channelName={channel.displayName} />
      {/* Sleeping indicator overlay */}
      {isSleeping && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-30 pointer-events-none">
          <div className="flex flex-col items-center gap-2">
            <Moon className="h-6 w-6 text-white/40" />
            <span className="text-xs text-white/40 font-medium">Stream paused (off-screen)</span>
          </div>
        </div>
      )}
    </div>
  );
}
