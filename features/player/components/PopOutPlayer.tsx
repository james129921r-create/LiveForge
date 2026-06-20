'use client';

import { useEffect, useState } from 'react';
import { HLSPlayer } from './HLSPlayer';
import { usePlayerStore } from '@/stores/playerStore';
import { Flame } from 'lucide-react';

interface PopOutPlayerProps {
  channelSlug: string;
  hlsUrl: string;
}

/**
 * PopOutPlayer — Minimal player for pop-out windows.
 * Renders just the HLS player with no sidebar, chat, or other UI.
 * Reads state from URL parameters and syncs via BroadcastChannel.
 */
export function PopOutPlayer({ channelSlug, hlsUrl }: PopOutPlayerProps) {
  const [resolvedUrl, setResolvedUrl] = useState<string | undefined>(hlsUrl || undefined);
  const [resolving, setResolving] = useState(false);
  const _volume = usePlayerStore((s) => s.volume);
  const _isMuted = usePlayerStore((s) => s.isMuted);

  // If no HLS URL provided, try to resolve it from the Kick API
  useEffect(() => {
    if (hlsUrl) {
      setResolvedUrl(hlsUrl);
      return;
    }

    if (!channelSlug) return;

    let cancelled = false;
    setResolving(true);

    (async () => {
      try {
        const { fetchLivestream } = await import('@/lib/kick-api');
        const data = await fetchLivestream(channelSlug);
        if (!cancelled && data?.playbackUrl) {
          setResolvedUrl(data.playbackUrl);
        }
      } catch {
        // Failed to resolve
      } finally {
        if (!cancelled) setResolving(false);
      }
    })();

    return () => { cancelled = true; };
  }, [channelSlug, hlsUrl]);

  if (resolving) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-3 border-white/20 border-t-white" />
          <span className="text-xs text-white/60">Loading stream...</span>
        </div>
      </div>
    );
  }

  if (!resolvedUrl) {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-gray-900 to-gray-950 flex items-center justify-center">
        <div className="text-center">
          <Flame className="h-12 w-12 mx-auto mb-4 text-primary/50" />
          <p className="text-white/60 text-sm">No stream URL available</p>
          <p className="text-white/30 text-xs mt-2">The stream may have ended or is unavailable</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black">
      <HLSPlayer src={resolvedUrl} channelName={channelSlug} />
    </div>
  );
}
