'use client';

import { useState, useEffect, useCallback } from 'react';
import { PopularStreams } from './PopularStreams';
import { CategoryStreams } from './CategoryStreams';
import { fetchTrendingStreams, fetchPopularStreams } from '@/lib/kick-api';
import { isGamblingStream, shouldObscureThumbnail } from '@/lib/mature-content-enforcer';
import { useMultiStreamStore } from '@/stores/multiStreamStore';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  TrendingUp,
  ArrowUpRight,
  MessageCircle,
  Star,
  Tv,
  ChevronDown,
  ChevronUp,
  Clock,
  Sparkles,
  Dice5,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

import { FallbackAvatar } from '@/components/FallbackAvatar';
import type { StreamChannel } from '@/types';

// Format viewer count
function formatViewerCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return count.toString();
}

// ─── Collapsible Section ────────────────────────────────────────────────────

function DiscoverySection({
  title,
  icon,
  iconColor = 'text-foreground',
  count,
  children,
  defaultOpen = true,
  badge,
}: {
  title: string;
  icon: React.ReactNode;
  iconColor?: string;
  count?: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-border/30 last:border-b-0">
      <button
        className="w-full flex items-center gap-1.5 px-3 py-2 hover:bg-muted/30 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <span className={iconColor}>{icon}</span>
        <span className="text-xs font-medium flex-1 text-left">{title}</span>
        {badge}
        {count !== undefined && (
          <span className="text-[10px] text-muted-foreground font-normal">({count})</span>
        )}
        {open ? (
          <ChevronUp className="h-3 w-3 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        )}
      </button>
      {open && <div className="px-1 pb-2">{children}</div>}
    </div>
  );
}

// ─── Compact Stream Card ────────────────────────────────────────────────────

function CompactStreamCard({ channel, onClick, showMatureContent }: {
  channel: StreamChannel;
  onClick: (ch: StreamChannel) => void;
  showMatureContent: boolean;
}) {
  const obscureThumbnail = shouldObscureThumbnail(channel, showMatureContent);
  const isGambling = isGamblingStream(channel);

  return (
    <button
      className={`w-full flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-muted/50 transition-colors text-left group ${
        obscureThumbnail ? 'ring-1 ring-orange-500/30' : ''
      }`}
      onClick={() => onClick(channel)}
    >
      <div className="relative shrink-0">
        <div className={obscureThumbnail ? 'blur-[6px] opacity-40' : ''}>
          <FallbackAvatar src={channel.avatarUrl} alt={channel.displayName} size="sm" className="ring-1 ring-offset-1 ring-offset-background ring-transparent group-hover:ring-primary/20 transition-all" />
        </div>
        {channel.isLive && !obscureThumbnail && (
          <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-red-500 border border-background" />
        )}
        {obscureThumbnail && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Dice5 className="h-3 w-3 text-orange-400" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={`text-xs font-medium truncate ${obscureThumbnail ? 'opacity-60' : ''}`}>
            {channel.displayName}
          </span>
          {channel.isLive && (
            <span className="flex items-center gap-0.5 text-[9px] text-red-500 font-medium">
              <span className="w-1 h-1 rounded-full bg-red-500 animate-pulse" />
            </span>
          )}
          {isGambling && (
            <Badge variant="outline" className="text-[7px] text-orange-400 border-orange-500/30 py-0 px-0.5">
              18+
            </Badge>
          )}
        </div>
        <div className="text-[10px] text-muted-foreground truncate">
          {obscureThumbnail ? 'Gambling Content' : (channel.category || channel.title || '')}
        </div>
      </div>

      {channel.viewerCount ? (
        <div className="flex items-center gap-0.5 text-[10px] text-muted-foreground shrink-0">
          <Tv className="h-2.5 w-2.5" />
          {formatViewerCount(channel.viewerCount)}
        </div>
      ) : null}
    </button>
  );
}

// ─── Shimmer Loader for Discovery Lanes ─────────────────────────────────────

function LaneShimmer() {
  return (
    <div className="space-y-1 px-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2.5 p-1.5 animate-pulse">
          <div className="w-8 h-8 rounded-full bg-muted/60 shimmer" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-20 rounded bg-muted/60 shimmer" />
            <div className="h-2.5 w-28 rounded bg-muted/40 shimmer" />
          </div>
          <div className="h-3 w-10 rounded bg-muted/40 shimmer" />
        </div>
      ))}
    </div>
  );
}

// ─── Main DiscoverPanel ─────────────────────────────────────────────────────

interface DiscoverPanelProps {
  onChannelSelect?: (channel: StreamChannel) => void;
}

export function DiscoverPanel({ onChannelSelect }: DiscoverPanelProps) {
  const [trendingData, setTrendingData] = useState<{
    trending: StreamChannel[];
    rising: StreamChannel[];
    newStreamers: StreamChannel[];
  } | null>(null);
  const [trendingLoading, setTrendingLoading] = useState(true);
  const [justWentLive, setJustWentLive] = useState<StreamChannel[]>([]);
  const [mostActiveChat, setMostActiveChat] = useState<StreamChannel[]>([]);
  const { addChannelToSlot, activeSlotId } = useMultiStreamStore();
  const { showMatureContent } = useSettingsStore();

  // Fetch trending data
  useEffect(() => {
    let cancelled = false;
    setTrendingLoading(true);

    fetchTrendingStreams()
      .then((data) => {
        if (!cancelled) {
          setTrendingData(data);
          setTrendingLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setTrendingLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  // Fetch popular streams for "Just Went Live" and "Most Active Chat" lanes
  useEffect(() => {
    let cancelled = false;

    fetchPopularStreams({ limit: 50, liveOnly: true })
      .then((result) => {
        if (!cancelled) {
          const live = result.channels.filter(ch => ch.isLive);

          // Just Went Live: streams with uptime < 30 minutes
          const justLive = live.filter(ch => (ch.uptimeMinutes ?? 0) > 0 && (ch.uptimeMinutes ?? 0) < 30);
          setJustWentLive(justLive);

          // Most Active Chat: approximate by viewer count (Kick doesn't expose chat rates)
          // Top streams by viewers are likely to have the most active chats
          const activeChat = [...live]
            .filter(ch => !ch.isMature || showMatureContent || isGamblingStream(ch))
            .sort((a, b) => (b.viewerCount || 0) - (a.viewerCount || 0))
            .slice(0, 8);
          setMostActiveChat(activeChat);
        }
      })
      .catch(() => {
        // Ignore — PopularStreams handles its own data
      });

    return () => { cancelled = true; };
  }, [showMatureContent]);

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

  // Filter out mature content for non-mature sections
  const filterGeneral = (channels: StreamChannel[]) =>
    channels.filter(ch => {
      if (ch.contentSection === 'mature' && ch.asmrType !== 'general' && !isGamblingStream(ch)) return false;
      if (ch.isMature && ch.asmrType !== 'general' && !isGamblingStream(ch)) return false;
      return true;
    });

  const trending = filterGeneral(trendingData?.trending || []);
  const rising = filterGeneral(trendingData?.rising || []);
  const newStreamers = filterGeneral(trendingData?.newStreamers || []);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto chat-scroll">
        {/* ─── Popular Now ──────────────────────────────────────────────── */}
        <DiscoverySection
          title="Popular Now"
          icon={<div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
          defaultOpen={true}
        >
          <PopularStreams onChannelSelect={onChannelSelect} />
        </DiscoverySection>

        {/* ─── Just Went Live ───────────────────────────────────────────── */}
        {justWentLive.length > 0 && (
          <DiscoverySection
            title="Just Went Live"
            icon={<Clock className="h-3.5 w-3.5" />}
            iconColor="text-green-400"
            count={justWentLive.length}
            defaultOpen={true}
            badge={
              <Badge variant="outline" className="text-[8px] py-0 px-1 text-green-400 border-green-500/30 bg-green-500/10">
                NEW
              </Badge>
            }
          >
            <div className="space-y-0.5 px-1">
              {justWentLive.slice(0, 6).map((channel) => (
                <CompactStreamCard
                  key={channel.id}
                  channel={channel}
                  onClick={handleChannelClick}
                  showMatureContent={showMatureContent}
                />
              ))}
              {justWentLive.length > 6 && (
                <button className="w-full text-center text-[10px] text-primary hover:underline py-1">
                  See {justWentLive.length - 6} more
                </button>
              )}
            </div>
          </DiscoverySection>
        )}

        {/* ─── Trending ─────────────────────────────────────────────────── */}
        <DiscoverySection
          title="Trending"
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          iconColor="text-red-400"
          count={trending.length}
          defaultOpen={true}
          badge={
            trending.length > 0 ? (
              <Badge variant="outline" className="text-[8px] py-0 px-1 text-red-400 border-red-500/30 bg-red-500/10">
                HOT
              </Badge>
            ) : undefined
          }
        >
          {trendingLoading ? (
            <LaneShimmer />
          ) : trending.length > 0 ? (
            <div className="space-y-0.5 px-1">
              {trending.slice(0, 6).map((channel) => (
                <CompactStreamCard
                  key={channel.id}
                  channel={channel}
                  onClick={handleChannelClick}
                  showMatureContent={showMatureContent}
                />
              ))}
              {trending.length > 6 && (
                <button className="w-full text-center text-[10px] text-primary hover:underline py-1">
                  See {trending.length - 6} more
                </button>
              )}
            </div>
          ) : (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">
              No trending streams right now
            </div>
          )}
        </DiscoverySection>

        {/* ─── Rising Stars ─────────────────────────────────────────────── */}
        <DiscoverySection
          title="Rising Stars"
          icon={<ArrowUpRight className="h-3.5 w-3.5" />}
          iconColor="text-amber-400"
          count={rising.length}
          defaultOpen={false}
          badge={
            rising.length > 0 ? (
              <Badge variant="outline" className="text-[8px] py-0 px-1 text-amber-400 border-amber-500/30 bg-amber-500/10">
                100-2K
              </Badge>
            ) : undefined
          }
        >
          {trendingLoading ? (
            <LaneShimmer />
          ) : rising.length > 0 ? (
            <div className="space-y-0.5 px-1">
              {rising.slice(0, 6).map((channel) => (
                <CompactStreamCard
                  key={channel.id}
                  channel={channel}
                  onClick={handleChannelClick}
                  showMatureContent={showMatureContent}
                />
              ))}
              {rising.length > 6 && (
                <button className="w-full text-center text-[10px] text-primary hover:underline py-1">
                  See {rising.length - 6} more
                </button>
              )}
            </div>
          ) : (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">
              No rising streams right now
            </div>
          )}
        </DiscoverySection>

        {/* ─── Most Active Chat ─────────────────────────────────────────── */}
        {mostActiveChat.length > 0 && (
          <DiscoverySection
            title="Most Active Chat"
            icon={<MessageCircle className="h-3.5 w-3.5" />}
            iconColor="text-blue-400"
            count={mostActiveChat.length}
            defaultOpen={false}
          >
            <div className="space-y-0.5 px-1">
              {mostActiveChat.slice(0, 6).map((channel) => (
                <CompactStreamCard
                  key={channel.id}
                  channel={channel}
                  onClick={handleChannelClick}
                  showMatureContent={showMatureContent}
                />
              ))}
              {mostActiveChat.length > 6 && (
                <button className="w-full text-center text-[10px] text-primary hover:underline py-1">
                  See {mostActiveChat.length - 6} more
                </button>
              )}
            </div>
          </DiscoverySection>
        )}

        {/* ─── Explore Categories ───────────────────────────────────────── */}
        <DiscoverySection
          title="Explore Categories"
          icon={<Sparkles className="h-3.5 w-3.5" />}
          iconColor="text-primary"
          defaultOpen={false}
        >
          <CategoryStreams onChannelSelect={onChannelSelect} />
        </DiscoverySection>

        {/* ─── New Streamers ────────────────────────────────────────────── */}
        <DiscoverySection
          title="New Streamers"
          icon={<Star className="h-3.5 w-3.5" />}
          iconColor="text-emerald-400"
          count={newStreamers.length}
          defaultOpen={false}
          badge={
            newStreamers.length > 0 ? (
              <Badge variant="outline" className="text-[8px] py-0 px-1 text-emerald-400 border-emerald-500/30 bg-emerald-500/10">
                &lt;100
              </Badge>
            ) : undefined
          }
        >
          {trendingLoading ? (
            <LaneShimmer />
          ) : newStreamers.length > 0 ? (
            <div className="space-y-0.5 px-1">
              {newStreamers.slice(0, 6).map((channel) => (
                <CompactStreamCard
                  key={channel.id}
                  channel={channel}
                  onClick={handleChannelClick}
                  showMatureContent={showMatureContent}
                />
              ))}
              {newStreamers.length > 6 && (
                <button className="w-full text-center text-[10px] text-primary hover:underline py-1">
                  See {newStreamers.length - 6} more
                </button>
              )}
            </div>
          ) : (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">
              No new streamers online right now
            </div>
          )}
        </DiscoverySection>
      </div>
    </div>
  );
}

// Re-export sub-components for backward compatibility
export { PopularStreams } from './PopularStreams';
export { CategoryStreams } from './CategoryStreams';
export { MoreLikeThis } from './MoreLikeThis';
