'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchRecommendations } from '@/lib/kick-api';
import { detectMatureFromCategory } from '@/lib/mature-content';
import { useMultiStreamStore } from '@/stores/multiStreamStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { Loader2, Tv, Sparkles, Zap, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { FallbackAvatar, FallbackThumbnail } from '@/components/FallbackAvatar';
import type { StreamChannel } from '@/types';

function formatViewerCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return count.toString();
}

interface MoreLikeThisProps {
  /** The channel to find similar streams for */
  channel: StreamChannel | null;
  /** Category override — find streams in this category */
  categorySlug?: string;
  onChannelSelect?: (channel: StreamChannel) => void;
  maxItems?: number;
}

export function MoreLikeThis({ channel, categorySlug, onChannelSelect, maxItems = 6 }: MoreLikeThisProps) {
  const [channels, setChannels] = useState<StreamChannel[]>([]);
  const [loading, setLoading] = useState(false);
  const { addChannelToSlot, activeSlotId } = useMultiStreamStore();
  const { showMatureContent } = useSettingsStore();

  useEffect(() => {
    if (!channel && !categorySlug) {
      setChannels([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setChannels([]);

    fetchRecommendations({
      channel: channel?.username,
      category: categorySlug,
      limit: maxItems + 2,
    })
      .then((result) => {
        if (!cancelled) {
          setChannels(result.channels.slice(0, maxItems));
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setChannels([]);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [channel?.username, categorySlug, maxItems]);

  const handleChannelClick = useCallback((ch: StreamChannel) => {
    if (ch.isMature && !showMatureContent) return;
    if (activeSlotId) {
      addChannelToSlot(activeSlotId, ch);
    }
    onChannelSelect?.(ch);
  }, [activeSlotId, addChannelToSlot, onChannelSelect, showMatureContent]);

  // Filter out channels already in the grid
  const { slots } = useMultiStreamStore();
  const activeUsernames = new Set(
    slots.filter(s => s.channel).map(s => s.channel!.username.toLowerCase())
  );
  const sourceUsername = channel?.username?.toLowerCase();
  const filteredChannels = channels.filter(ch => {
    // Exclude the source channel
    if (ch.username.toLowerCase() === sourceUsername) return false;
    // Don't exclude channels already in grid — just show them differently
    return true;
  });

  if (!channel && !categorySlug) return null;

  if (loading) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 px-2 py-1">
          <Sparkles className="h-3.5 w-3.5 text-primary/60" />
          <span className="text-xs font-medium text-muted-foreground">More Like This</span>
        </div>
        <div className="flex items-center justify-center py-4 gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Finding similar streams...</span>
        </div>
      </div>
    );
  }

  if (filteredChannels.length === 0) return null;

  const generalChannels = filteredChannels.filter(ch => !ch.isMature && ch.contentSection !== 'mature');
  const matureChannels = filteredChannels.filter(ch => ch.isMature || ch.contentSection === 'mature');

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 px-2 py-1">
        <Sparkles className="h-3.5 w-3.5 text-primary/60" />
        <span className="text-xs font-medium text-muted-foreground">
          More Like This
        </span>
        {channel?.category && (
          <Badge variant="outline" className="text-[9px] py-0 px-1">
            {channel.category}
          </Badge>
        )}
      </div>

      {/* Horizontal scrollable stream cards */}
      <div className="flex gap-2 overflow-x-auto pb-1 px-2">
        {generalChannels.map((ch) => {
          const isAlreadyAdded = activeUsernames.has(ch.username.toLowerCase());
          return (
            <button
              key={ch.id}
              className={`flex flex-col gap-1.5 p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors shrink-0 w-36 text-left ${
                isAlreadyAdded ? 'ring-1 ring-primary/30' : ''
              }`}
              onClick={() => handleChannelClick(ch)}
            >
              {/* Thumbnail / Avatar area */}
              <div className="w-full aspect-video bg-muted rounded-md flex items-center justify-center overflow-hidden relative">
                {ch.thumbnail ? (
                  <FallbackThumbnail src={ch.thumbnail} alt={ch.displayName} className="w-full h-full object-cover" />
                ) : (
                  <FallbackAvatar src={ch.avatarUrl} alt={ch.displayName} size="sm" />
                )}
                {ch.isLive && (
                  <div className="absolute top-1 left-1 flex items-center gap-0.5 bg-red-500/90 px-1 py-0.5 rounded text-[8px] text-white font-medium">
                    <span className="w-1 h-1 rounded-full bg-white animate-pulse" />
                    LIVE
                  </div>
                )}
                {ch.viewerCount ? (
                  <div className="absolute bottom-1 right-1 flex items-center gap-0.5 bg-black/70 px-1 py-0.5 rounded text-[8px] text-white/80">
                    <Tv className="h-2 w-2" />
                    {formatViewerCount(ch.viewerCount)}
                  </div>
                ) : null}
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <span className="text-xs font-medium truncate">{ch.displayName}</span>
                  {ch.verified && (
                    <svg className="h-2.5 w-2.5 text-blue-400 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground truncate">
                  {ch.category || ch.title || 'Streaming'}
                </div>
                {isAlreadyAdded && (
                  <div className="text-[9px] text-primary mt-0.5">Watching</div>
                )}
              </div>
            </button>
          );
        })}

        {/* Mature channels (only shown if 18+ enabled) */}
        {showMatureContent && matureChannels.map((ch) => {
          const isAlreadyAdded = activeUsernames.has(ch.username.toLowerCase());
          return (
            <button
              key={ch.id}
              className={`flex flex-col gap-1.5 p-2 rounded-lg bg-pink-500/5 hover:bg-pink-500/10 transition-colors shrink-0 w-36 text-left border border-pink-500/10 ${
                isAlreadyAdded ? 'ring-1 ring-primary/30' : ''
              }`}
              onClick={() => handleChannelClick(ch)}
            >
              <div className="w-full aspect-video bg-muted rounded-md flex items-center justify-center overflow-hidden relative">
                {ch.thumbnail ? (
                  <FallbackThumbnail src={ch.thumbnail} alt={ch.displayName} className="w-full h-full object-cover" />
                ) : (
                  <FallbackAvatar src={ch.avatarUrl} alt={ch.displayName} size="sm" />
                )}
                {ch.isLive && (
                  <div className="absolute top-1 left-1 flex items-center gap-0.5 bg-red-500/90 px-1 py-0.5 rounded text-[8px] text-white font-medium">
                    <span className="w-1 h-1 rounded-full bg-white animate-pulse" />
                    LIVE
                  </div>
                )}
                <div className="absolute top-1 right-1">
                  <Badge variant="outline" className="text-[7px] text-pink-400 border-pink-500/30 bg-black/60 py-0 px-0.5">
                    18+
                  </Badge>
                </div>
                {ch.viewerCount ? (
                  <div className="absolute bottom-1 right-1 flex items-center gap-0.5 bg-black/70 px-1 py-0.5 rounded text-[8px] text-white/80">
                    <Tv className="h-2 w-2" />
                    {formatViewerCount(ch.viewerCount)}
                  </div>
                ) : null}
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <span className="text-xs font-medium truncate">{ch.displayName}</span>
                </div>
                <div className="text-[10px] text-muted-foreground truncate">
                  {ch.category || ch.title || 'Streaming'}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
