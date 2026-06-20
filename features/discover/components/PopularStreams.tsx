'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchPopularStreams } from '@/lib/kick-api';
import { detectMatureFromCategory } from '@/lib/mature-content';
import { isGamblingStream, shouldObscureThumbnail } from '@/lib/mature-content-enforcer';
import { useMultiStreamStore } from '@/stores/multiStreamStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { Loader2, Flame, Tv, Zap, TrendingUp, Users, Dice5, ChevronDown, Clock, ArrowUpRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FallbackAvatar } from '@/components/FallbackAvatar';
import type { StreamChannel } from '@/types';

// Format viewer count: 1.2k, 15k, 1.2M
function formatViewerCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return count.toString();
}

// ─── Shimmer Skeleton ──────────────────────────────────────────────────────

function ShimmerCard() {
  return (
    <div className="w-full flex items-center gap-3 p-2 rounded-lg animate-pulse">
      <div className="relative shrink-0">
        <div className="w-10 h-10 rounded-full bg-muted/60 shimmer" />
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center gap-2">
          <div className="h-4 w-24 rounded bg-muted/60 shimmer" />
          <div className="h-3 w-10 rounded bg-muted/40 shimmer" />
        </div>
        <div className="h-3 w-36 rounded bg-muted/40 shimmer" />
        <div className="h-2.5 w-20 rounded bg-muted/30 shimmer" />
      </div>
      <div className="h-4 w-12 rounded bg-muted/40 shimmer shrink-0" />
    </div>
  );
}

function ShimmerSection({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-0.5">
      {Array.from({ length: count }).map((_, i) => (
        <ShimmerCard key={i} />
      ))}
    </div>
  );
}

function ShimmerLoading() {
  return (
    <div className="space-y-4">
      {/* Stats bar shimmer */}
      <div className="flex items-center gap-3 px-2">
        <div className="h-4 w-16 rounded bg-muted/40 shimmer" />
        <div className="h-4 w-24 rounded bg-muted/40 shimmer" />
      </div>
      {/* Just Went Live section */}
      <div>
        <div className="flex items-center gap-1.5 px-2 py-1.5">
          <div className="h-3.5 w-3.5 rounded bg-muted/40 shimmer" />
          <div className="h-4 w-24 rounded bg-muted/40 shimmer" />
        </div>
        <ShimmerSection count={3} />
      </div>
      {/* Popular Now section */}
      <div>
        <div className="flex items-center gap-1.5 px-2 py-1.5">
          <div className="h-3 w-3 rounded-full bg-muted/40 shimmer" />
          <div className="h-4 w-28 rounded bg-muted/40 shimmer" />
        </div>
        <ShimmerSection count={6} />
      </div>
    </div>
  );
}

// ─── Popular Streams Component ──────────────────────────────────────────────

interface PopularStreamsProps {
  onChannelSelect?: (channel: StreamChannel) => void;
  category?: string;
}

export function PopularStreams({ onChannelSelect, category }: PopularStreamsProps) {
  const [channels, setChannels] = useState<StreamChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [totalAvailable, setTotalAvailable] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const { addChannelToSlot, activeSlotId } = useMultiStreamStore();
  const { showMatureContent } = useSettingsStore();

  const PAGE_SIZE = 24;
  const scrollRef = useRef<HTMLDivElement>(null);

  // Initial load
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setChannels([]);
    setPage(0);
    setHasMore(true);
    setTotalAvailable(null);

    fetchPopularStreams({ limit: PAGE_SIZE, category })
      .then((result) => {
        if (!cancelled) {
          setChannels(result.channels);
          setHasMore(result.channels.length >= PAGE_SIZE);
          setTotalAvailable(result.total || null);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [category]);

  // Load more
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const nextPage = page + 1;

    try {
      const result = await fetchPopularStreams({
        limit: PAGE_SIZE,
        offset: nextPage * PAGE_SIZE,
        category,
      });
      const newChannels = result.channels.filter(
        (ch) => !channels.some((existing) => existing.id === ch.id)
      );
      setChannels((prev) => [...prev, ...newChannels]);
      setPage(nextPage);
      setHasMore(result.channels.length >= PAGE_SIZE);
      if (result.total) setTotalAvailable(result.total);
    } catch {
      // Ignore load-more failures
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, page, channels, category]);

  // Infinite scroll detection
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      if (scrollHeight - scrollTop - clientHeight < 200 && hasMore && !loadingMore) {
        loadMore();
      }
    };

    el.addEventListener('scroll', handleScroll);
    return () => el.removeEventListener('scroll', handleScroll);
  }, [hasMore, loadingMore, loadMore]);

  const handleChannelClick = useCallback((channel: StreamChannel) => {
    if (channel.isMature && !showMatureContent && channel.asmrType !== 'general' && !isGamblingStream(channel)) return;
    if (isGamblingStream(channel) && !showMatureContent) {
      useSettingsStore.getState().setShowMatureContent(true);
    }
    if (activeSlotId) {
      addChannelToSlot(activeSlotId, channel);
    }
    onChannelSelect?.(channel);
  }, [activeSlotId, addChannelToSlot, onChannelSelect, showMatureContent]);

  // Split channels into sections
  const liveChannels = channels.filter(ch => ch.isLive);
  const offlineChannels = channels.filter(ch => !ch.isLive);

  // Rising streams — streams gaining viewers rapidly (top 20% by viewer count among live)
  const sortedByViewers = [...liveChannels].sort((a, b) => (b.viewerCount || 0) - (a.viewerCount || 0));
  const topThreshold = sortedByViewers.length > 5
    ? (sortedByViewers[Math.floor(sortedByViewers.length * 0.2)]?.viewerCount || 0)
    : 0;
  const risingStreams = liveChannels.filter(ch => (ch.viewerCount || 0) >= topThreshold && topThreshold > 100);

  // Recently went live — streams with uptime < 30 minutes
  const recentlyLive = liveChannels.filter(ch => (ch.uptimeMinutes ?? 0) > 0 && (ch.uptimeMinutes ?? 0) < 30);

  const generalLive = liveChannels.filter(ch => {
    if (ch.contentSection === 'mature' && ch.asmrType !== 'general' && !isGamblingStream(ch)) return false;
    if (ch.isMature && ch.asmrType !== 'general' && !isGamblingStream(ch)) return false;
    return true;
  });

  const matureLive = liveChannels.filter(ch => {
    if (ch.isMature || ch.contentSection === 'mature') return true;
    const catCheck = detectMatureFromCategory(ch.category);
    return catCheck.asmrType !== null && catCheck.asmrType !== undefined;
  });

  const totalViewers = liveChannels.reduce((sum, ch) => sum + (ch.viewerCount || 0), 0);

  if (loading) {
    return <ShimmerLoading />;
  }

  if (channels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <Flame className="h-10 w-10 text-muted-foreground/30" />
        <span className="text-sm text-muted-foreground font-medium">No streams found</span>
        <span className="text-xs text-muted-foreground/70">Try searching for a specific channel or category</span>
        {/* Alternative category suggestions */}
        <div className="mt-3 flex flex-col items-center gap-2">
          <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">Try these categories</span>
          <div className="flex flex-wrap gap-1.5 justify-center">
            {['CS2', 'Valorant', 'Just Chatting', 'GTA V', 'Fortnite', 'Minecraft', 'League of Legends', 'Apex Legends', 'Rust', 'Slots'].map((cat) => (
              <Badge
                key={cat}
                variant="outline"
                className="text-[10px] cursor-pointer hover:bg-primary/10 hover:border-primary/30 transition-colors"
                onClick={() => {
                  // Trigger navigation by re-fetching with this category
                  setChannels([]);
                  setLoading(true);
                  fetchPopularStreams({ limit: PAGE_SIZE, category: cat })
                    .then((result) => {
                      setChannels(result.channels);
                      setHasMore(result.channels.length >= PAGE_SIZE);
                      setTotalAvailable(result.total || null);
                      setLoading(false);
                    })
                    .catch(() => setLoading(false));
                }}
              >
                {cat}
              </Badge>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="space-y-4 max-h-full overflow-y-auto chat-scroll">
      {/* Stats bar */}
      <div className="flex items-center gap-3 px-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <TrendingUp className="h-3.5 w-3.5 text-red-400" />
          <span className="font-medium text-foreground">{liveChannels.length}</span> live
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          {formatViewerCount(totalViewers)} viewers
        </div>
        {totalAvailable !== null && totalAvailable > channels.length && (
          <div className="text-[10px] text-muted-foreground/60">
            Showing {channels.length} of {totalAvailable}+
          </div>
        )}
        {hasMore && totalAvailable === null && channels.length >= PAGE_SIZE && (
          <div className="text-[10px] text-muted-foreground/60">
            Showing {channels.length}+
          </div>
        )}
      </div>

      {/* Recently Went Live */}
      {recentlyLive.length > 0 && (
        <div>
          <div className="text-xs font-medium px-2 py-1.5 flex items-center gap-1.5 text-green-400">
            <Clock className="h-3.5 w-3.5" />
            Just Went Live
            <span className="text-muted-foreground font-normal">({recentlyLive.length})</span>
          </div>
          <div className="space-y-0.5">
            {recentlyLive.slice(0, 5).map((channel) => (
              <StreamCard
                key={channel.id}
                channel={channel}
                onClick={handleChannelClick}
                showMatureContent={showMatureContent}
              />
            ))}
          </div>
        </div>
      )}

      {/* Rising Streams */}
      {risingStreams.length > 0 && (
        <div>
          <div className="text-xs font-medium px-2 py-1.5 flex items-center gap-1.5 text-amber-400">
            <ArrowUpRight className="h-3.5 w-3.5" />
            Rising
            <span className="text-muted-foreground font-normal">({risingStreams.length})</span>
          </div>
          <div className="space-y-0.5">
            {risingStreams.slice(0, 5).map((channel) => (
              <StreamCard
                key={channel.id}
                channel={channel}
                onClick={handleChannelClick}
                showMatureContent={showMatureContent}
              />
            ))}
          </div>
        </div>
      )}

      {/* General Live Streams */}
      {generalLive.length > 0 && (
        <div>
          <div className="text-xs font-medium px-2 py-1.5 flex items-center gap-1.5 text-foreground">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            Popular Now
            <span className="text-muted-foreground font-normal">({generalLive.length})</span>
          </div>
          <div className="space-y-0.5">
            {generalLive.map((channel) => (
              <StreamCard
                key={channel.id}
                channel={channel}
                onClick={handleChannelClick}
                showMatureContent={showMatureContent}
              />
            ))}
          </div>
        </div>
      )}

      {/* Mature Live Streams */}
      {matureLive.length > 0 && showMatureContent && (
        <div>
          <div className="text-xs font-medium px-2 py-1.5 flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            Mature Streams (18+)
            <span className="text-muted-foreground font-normal">({matureLive.length})</span>
          </div>
          <div className="space-y-0.5">
            {matureLive.map((channel) => (
              <StreamCard
                key={channel.id}
                channel={channel}
                onClick={handleChannelClick}
                showMatureContent={showMatureContent}
              />
            ))}
          </div>
        </div>
      )}

      {/* Hidden mature notice */}
      {matureLive.length > 0 && !showMatureContent && (() => {
        const gamblingCount = matureLive.filter(ch => isGamblingStream(ch)).length;
        const nonGamblingHidden = matureLive.length - gamblingCount;
        return nonGamblingHidden > 0 ? (
          <div className="flex items-center gap-1.5 px-2 py-2 rounded bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 text-xs">
            <Flame className="h-3.5 w-3.5 shrink-0" />
            {nonGamblingHidden} mature stream{nonGamblingHidden !== 1 ? 's' : ''} hidden — enable 18+ toggle to show
          </div>
        ) : null;
      })()}

      {/* Load More button */}
      {hasMore && (
        <div className="flex justify-center py-3">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={loadMore}
            disabled={loadingMore}
          >
            {loadingMore ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading...
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" />
                Load More
              </>
            )}
          </Button>
        </div>
      )}

      {/* Sparse results notice */}
      {!hasMore && liveChannels.length > 0 && liveChannels.length < 10 && (
        <div className="flex flex-col items-center gap-2 px-2 py-3">
          <span className="text-[10px] text-muted-foreground/50">
            Results may be limited — try a category filter for more streams
          </span>
          <div className="flex flex-wrap gap-1.5 justify-center">
            {['CS2', 'Valorant', 'Just Chatting', 'GTA V', 'Fortnite'].map((cat) => (
              <Badge
                key={cat}
                variant="outline"
                className="text-[10px] cursor-pointer hover:bg-primary/10 hover:border-primary/30 transition-colors"
                onClick={() => {
                  setChannels([]);
                  setLoading(true);
                  fetchPopularStreams({ limit: PAGE_SIZE, category: cat })
                    .then((result) => {
                      setChannels(result.channels);
                      setHasMore(result.channels.length >= PAGE_SIZE);
                      setTotalAvailable(result.total || null);
                      setLoading(false);
                    })
                    .catch(() => setLoading(false));
                }}
              >
                {cat}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Offline Channels (compact) */}
      {offlineChannels.length > 0 && (
        <div>
          <div className="text-xs font-medium px-2 py-1.5 text-muted-foreground">
            Offline ({offlineChannels.length})
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 px-2">
            {offlineChannels.map((channel) => (
              <button
                key={channel.id}
                className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors shrink-0 opacity-60"
                onClick={() => handleChannelClick(channel)}
              >
                <FallbackAvatar src={channel.avatarUrl} alt={channel.displayName} size="xs" />
                <span className="text-xs font-medium whitespace-nowrap">{channel.displayName}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Stream Card ────────────────────────────────────────────────────────────

function StreamCard({ channel, onClick, showMatureContent }: {
  channel: StreamChannel;
  onClick: (ch: StreamChannel) => void;
  showMatureContent: boolean;
}) {
  const isMature = channel.isMature || detectMatureFromCategory(channel.category).isMature;
  const isGambling = isGamblingStream(channel);
  const obscureThumbnail = shouldObscureThumbnail(channel, showMatureContent);

  return (
    <button
      className={`w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors text-left group relative ${
        obscureThumbnail ? 'ring-1 ring-orange-500/30' : ''
      }`}
      onClick={() => onClick(channel)}
    >
      {/* Avatar with live ring */}
      <div className="relative shrink-0">
        <div className={obscureThumbnail ? 'blur-[6px] opacity-40' : ''}>
          <FallbackAvatar src={channel.avatarUrl} alt={channel.displayName} size="md" className="ring-2 ring-offset-2 ring-offset-background ring-transparent group-hover:ring-primary/30 transition-all" />
        </div>
        {channel.isLive && !obscureThumbnail && (
          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-red-500 border-2 border-background" />
        )}
        {obscureThumbnail && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-0.5">
              <Dice5 className="h-3.5 w-3.5 text-orange-400" />
              <span className="text-[7px] text-orange-400 font-medium leading-none">18+</span>
            </div>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`font-medium text-sm truncate ${obscureThumbnail ? 'opacity-60' : ''}`}>{channel.displayName}</span>
          {channel.verified && !obscureThumbnail && (
            <svg className="h-3.5 w-3.5 text-blue-400 shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
          {channel.isLive && !obscureThumbnail ? (
            <span className="flex items-center gap-1 text-[10px] text-red-500 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              LIVE
            </span>
          ) : channel.isLive && obscureThumbnail ? (
            <span className="flex items-center gap-1 text-[10px] text-orange-400 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
              LIVE
            </span>
          ) : (
            <span className="text-[10px] text-muted-foreground">OFFLINE</span>
          )}
          {(channel.liveStreak ?? 0) >= 3 && (
            <span className="flex items-center gap-0.5 text-[10px] text-amber-400 font-medium bg-amber-500/10 px-1 rounded">
              <Zap className="h-2.5 w-2.5" />
              {channel.liveStreak}d
            </span>
          )}
          {isGambling && !showMatureContent && (
            <Badge variant="outline" className="text-[9px] text-orange-400 border-orange-500/30 bg-orange-500/10 py-0 gap-0.5">
              <Dice5 className="h-2.5 w-2.5" />
              Gambling
            </Badge>
          )}
          {isMature && showMatureContent && !isGambling && (
            <Badge variant="outline" className="text-[9px] text-pink-400 border-pink-500/30 py-0">18+</Badge>
          )}
          {isGambling && showMatureContent && (
            <Badge variant="outline" className="text-[9px] text-orange-400 border-orange-500/30 bg-orange-500/10 py-0 gap-0.5">
              <Dice5 className="h-2.5 w-2.5" />
              Gambling 18+
            </Badge>
          )}
        </div>
        <div className={`text-xs text-muted-foreground truncate ${obscureThumbnail ? 'opacity-50' : ''}`}>
          {obscureThumbnail ? 'Gambling Content — Click to enable 18+' : (channel.title || channel.category || `kick.com/${channel.username}`)}
        </div>
        {channel.category && !obscureThumbnail && (
          <div className="text-[10px] text-muted-foreground/70 mt-0.5">{channel.category}</div>
        )}
      </div>

      {/* Viewers */}
      {channel.viewerCount ? (
        <div className={`flex items-center gap-1 text-xs text-muted-foreground shrink-0 ${obscureThumbnail ? 'opacity-50' : ''}`}>
          <Tv className="h-3 w-3" />
          {formatViewerCount(channel.viewerCount)}
        </div>
      ) : null}
    </button>
  );
}
