'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchTopCategories, fetchCategoryChannels } from '@/lib/kick-api';
import { detectMatureFromCategory, getMatureSubCategoryLabel } from '@/lib/mature-content';
import { isGamblingStream, shouldObscureThumbnail } from '@/lib/mature-content-enforcer';
import { useMultiStreamStore } from '@/stores/multiStreamStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { Loader2, Flame, Tv, ArrowLeft, Users, ChevronRight, Shield, ShieldAlert, Zap, Dice5 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { FallbackAvatar, FallbackThumbnail } from '@/components/FallbackAvatar';
import type { StreamChannel, CategoryItem } from '@/types';

function formatViewerCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return count.toString();
}

interface CategoryStreamsProps {
  onChannelSelect?: (channel: StreamChannel) => void;
}

export function CategoryStreams({ onChannelSelect }: CategoryStreamsProps) {
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<CategoryItem | null>(null);
  const [categoryChannels, setCategoryChannels] = useState<StreamChannel[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const { addChannelToSlot, activeSlotId } = useMultiStreamStore();
  const { showMatureContent } = useSettingsStore();

  // Load top categories
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchTopCategories()
      .then((cats) => {
        if (!cancelled) {
          setCategories(cats);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // When a category is selected, fetch its channels
  const handleCategoryClick = useCallback(async (category: CategoryItem) => {
    setSelectedCategory(category);
    setLoadingChannels(true);
    setCategoryChannels([]);

    try {
      const result = await fetchCategoryChannels(category.slug);
      setCategoryChannels(result.channels || []);
    } catch {
      setCategoryChannels([]);
    } finally {
      setLoadingChannels(false);
    }
  }, []);

  const handleBack = useCallback(() => {
    setSelectedCategory(null);
    setCategoryChannels([]);
  }, []);

  const handleChannelClick = useCallback((channel: StreamChannel) => {
    // Allow clicking mature channels — if 18+ mode is off, auto-enable it
    if (channel.isMature && !showMatureContent && !isGamblingStream(channel)) return;
    if (isGamblingStream(channel) && !showMatureContent) {
      useSettingsStore.getState().setShowMatureContent(true);
    }
    if (activeSlotId) {
      addChannelToSlot(activeSlotId, channel);
    }
    onChannelSelect?.(channel);
  }, [activeSlotId, addChannelToSlot, onChannelSelect, showMatureContent]);

  // Split categories
  const generalCategories = categories.filter(cat => {
    if (cat.isMature || cat.contentSection === 'mature') return false;
    const { isMature } = detectMatureFromCategory(cat.name);
    return !isMature;
  });

  const matureCategories = categories.filter(cat => {
    if (cat.isMature || cat.contentSection === 'mature') return true;
    const { isMature } = detectMatureFromCategory(cat.name);
    return isMature;
  });

  // Category detail view
  if (selectedCategory) {
    return (
      <CategoryDetailView
        category={selectedCategory}
        channels={categoryChannels}
        loading={loadingChannels}
        onBack={handleBack}
        onChannelClick={handleChannelClick}
        onCategoryClick={handleCategoryClick}
        showMatureContent={showMatureContent}
      />
    );
  }

  // Category list view
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading categories...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* General Categories */}
      {generalCategories.length > 0 && (
        <div>
          <div className="text-xs font-medium px-2 py-1.5 flex items-center gap-1.5 mb-2">
            <Shield className="h-3 w-3 text-green-400" />
            Categories
            <span className="text-muted-foreground font-normal">({generalCategories.length})</span>
          </div>
          <div className="grid grid-cols-2 gap-2 px-1">
            {generalCategories.map((cat) => (
              <CategoryCard
                key={cat.id}
                category={cat}
                onClick={handleCategoryClick}
                showMatureContent={showMatureContent}
              />
            ))}
          </div>
        </div>
      )}

      {/* Mature Categories */}
      {matureCategories.length > 0 && showMatureContent && (
        <div>
          <div className="text-xs font-medium px-2 py-1.5 flex items-center gap-1.5 mb-2">
            <ShieldAlert className="h-3 w-3 text-pink-400" />
            Mature Categories (18+)
            <span className="text-muted-foreground font-normal">({matureCategories.length})</span>
          </div>
          <div className="grid grid-cols-2 gap-2 px-1">
            {matureCategories.map((cat) => (
              <CategoryCard
                key={cat.id}
                category={cat}
                onClick={handleCategoryClick}
                showMatureContent={showMatureContent}
              />
            ))}
          </div>
        </div>
      )}

      {matureCategories.length > 0 && !showMatureContent && (
        <div className="flex items-center gap-1.5 px-2 py-2 rounded bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 text-xs">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
          {matureCategories.length} mature categor{matureCategories.length !== 1 ? 'ies' : 'y'} hidden — enable 18+ to show
        </div>
      )}
    </div>
  );
}

// ─── Category Card ──────────────────────────────────────────────────────────

function CategoryCard({ category, onClick, showMatureContent }: {
  category: CategoryItem;
  onClick: (cat: CategoryItem) => void;
  showMatureContent: boolean;
}) {
  return (
    <button
      className="p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors text-left group"
      onClick={() => onClick(category)}
    >
      <div className="w-full aspect-[16/9] bg-muted rounded-md mb-1.5 flex items-center justify-center overflow-hidden relative">
        <FallbackThumbnail src={category.bannerUrl} alt={category.name} className="w-full h-full object-cover" />
        {category.isMature && (
          <div className="absolute top-1 right-1">
            <Badge variant="outline" className="text-[8px] text-pink-400 border-pink-500/30 bg-black/60 py-0 px-1">
              18+
            </Badge>
          </div>
        )}
        {/* Viewers overlay */}
        {category.viewerCount ? (
          <div className="absolute bottom-1 left-1 flex items-center gap-0.5 bg-black/70 px-1 py-0.5 rounded text-[9px] text-white/80">
            <Users className="h-2.5 w-2.5" />
            {formatViewerCount(category.viewerCount)}
          </div>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-1">
        <span className="text-xs font-medium truncate">{category.name}</span>
        <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0 group-hover:translate-x-0.5 transition-transform" />
      </div>
    </button>
  );
}

// ─── Category Detail View ──────────────────────────────────────────────────

function CategoryDetailView({ category, channels, loading, onBack, onChannelClick, onCategoryClick, showMatureContent }: {
  category: CategoryItem;
  channels: StreamChannel[];
  loading: boolean;
  onBack: () => void;
  onChannelClick: (ch: StreamChannel) => void;
  onCategoryClick?: (cat: CategoryItem) => void;
  showMatureContent: boolean;
}) {
  const liveChannels = channels.filter(ch => ch.isLive);
  const offlineChannels = channels.filter(ch => !ch.isLive);

  // Split by mature
  // General ASMR streams appear in BOTH sections
  // Gambling streams appear as obscured cards in the general section when mature is hidden
  const generalLive = liveChannels.filter(ch => {
    if (!ch.isMature && ch.contentSection !== 'mature') return true;
    // General ASMR appears in general section
    if (ch.asmrType === 'general') return true;
    // Gambling streams appear as obscured cards when mature is hidden
    if (isGamblingStream(ch)) return true;
    return false;
  });
  const matureLive = liveChannels.filter(ch => {
    if (ch.isMature || ch.contentSection === 'mature') return true;
    // Include ASMR channels in mature section for discoverability
    return ch.asmrType !== null && ch.asmrType !== undefined;
  });

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All Categories
        </button>

        <div className="flex items-center gap-3">
          <FallbackThumbnail src={category.bannerUrl} alt={category.name} className="w-14 h-14 rounded-lg object-cover shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm truncate">{category.name}</h3>
              {category.isMature && (
                <Badge variant="outline" className="text-[9px] text-pink-400 border-pink-500/30 shrink-0">18+</Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {category.viewerCount ? `${formatViewerCount(category.viewerCount)} viewers` : ''}
              {category.parentCategory && ` · ${category.parentCategory}`}
            </div>
            {category.subCategories && category.subCategories.length > 0 && (
              <div className="flex gap-1 mt-1 flex-wrap">
                {category.subCategories.map((sub) => (
                  <Badge key={sub} variant="outline" className="text-[8px] py-0 px-1">
                    {getMatureSubCategoryLabel(sub as never)}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Channels */}
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Loading streams...</span>
          </div>
        ) : channels.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Flame className="h-8 w-8 text-muted-foreground/30" />
            <span className="text-sm text-muted-foreground">No live streams in this category right now</span>
            <span className="text-xs text-muted-foreground/70">Streams will appear here when someone goes live</span>
            <button
              onClick={onBack}
              className="mt-2 text-xs text-primary hover:underline flex items-center gap-1"
            >
              <ArrowLeft className="h-3 w-3" />
              Browse other categories
            </button>
            {/* Related category suggestions */}
            {(() => {
              const relatedSlugs: Record<string, string[]> = {
                'rust': ['grand-theft-auto-v', 'escape-from-tarkov', 'valorant'],
                'valorant': ['counter-strike-2', 'apex-legends', 'overwatch-2'],
                'counter-strike-2': ['valorant', 'call-of-duty-warzone', 'apex-legends'],
                'grand-theft-auto-v': ['rust', 'just-chatting', 'red-dead-redemption-2'],
                'just-chatting': ['irl', 'special-events', 'music'],
                'slots': ['poker', 'just-chatting'],
                'league-of-legends': ['valorant', 'teamfight-tactics'],
                'minecraft': ['old-school-runescape', 'rust'],
                'asmr': ['just-chatting', 'irl', 'music'],
                'pools-hot-tubs-and-bikinis': ['asmr', 'just-chatting', 'irl'],
              };
              const related = relatedSlugs[category.slug.toLowerCase()] || [];
              if (related.length === 0) return null;
              return (
                <div className="mt-3 flex flex-col items-center gap-2">
                  <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">Try these instead</span>
                  <div className="flex flex-wrap gap-1.5 justify-center">
                    {related.map((slug) => (
                      <Badge
                        key={slug}
                        variant="outline"
                        className="text-[10px] cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => {
                          const cat: CategoryItem = {
                            id: `suggested-${slug}`,
                            name: slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                            slug,
                          };
                          onCategoryClick?.(cat);
                        }}
                      >
                        {slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                      </Badge>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        ) : (
          <div className="space-y-3">
            {/* General live */}
            {generalLive.length > 0 && (
              <div className="space-y-0.5">
                <div className="text-xs font-medium px-2 py-1 flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  Live Now ({generalLive.length})
                </div>
                {generalLive.map((ch) => (
                  <ChannelRow key={ch.id} channel={ch} onClick={onChannelClick} showMatureContent={showMatureContent} />
                ))}
              </div>
            )}

            {/* Mature live */}
            {matureLive.length > 0 && showMatureContent && (
              <div className="space-y-0.5">
                <div className="text-xs font-medium px-2 py-1 flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  18+ Live ({matureLive.length})
                </div>
                {matureLive.map((ch) => (
                  <ChannelRow key={ch.id} channel={ch} onClick={onChannelClick} showMatureContent={showMatureContent} />
                ))}
              </div>
            )}

            {matureLive.length > 0 && !showMatureContent && (() => {
              const gamblingCount = matureLive.filter(ch => isGamblingStream(ch)).length;
              const nonGamblingHidden = matureLive.length - gamblingCount;
              return nonGamblingHidden > 0 ? (
                <div className="flex items-center gap-1.5 px-2 py-2 rounded bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 text-xs">
                  <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                  {nonGamblingHidden} mature stream{nonGamblingHidden !== 1 ? 's' : ''} hidden — enable 18+
                  {gamblingCount > 0 && (
                    <span className="text-orange-400 ml-1">· {gamblingCount} gambling shown with warning</span>
                  )}
                </div>
              ) : gamblingCount > 0 ? (
                <div className="flex items-center gap-1.5 px-2 py-2 rounded bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs">
                  <Dice5 className="h-3.5 w-3.5 shrink-0" />
                  {gamblingCount} gambling stream{gamblingCount !== 1 ? 's' : ''} shown with warning — enable 18+ for full details
                </div>
              ) : null;
            })()}

            {/* Offline */}
            {offlineChannels.length > 0 && (
              <div>
                <div className="text-xs font-medium px-2 py-1 text-muted-foreground">
                  Offline ({offlineChannels.length})
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1 px-2">
                  {offlineChannels.map((ch) => (
                    <button
                      key={ch.id}
                      className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors shrink-0 opacity-60"
                      onClick={() => onChannelClick(ch)}
                    >
                      <FallbackAvatar src={ch.avatarUrl} alt={ch.displayName} size="sm" />
                      <span className="text-xs font-medium whitespace-nowrap">{ch.displayName}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Channel Row (shared) ──────────────────────────────────────────────────

function ChannelRow({ channel, onClick, showMatureContent }: {
  channel: StreamChannel;
  onClick: (ch: StreamChannel) => void;
  showMatureContent: boolean;
}) {
  const isGambling = isGamblingStream(channel);
  const obscureThumbnail = shouldObscureThumbnail(channel, showMatureContent);

  return (
    <button
      className={`w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors text-left ${
        obscureThumbnail ? 'ring-1 ring-orange-500/30' : ''
      }`}
      onClick={() => onClick(channel)}
    >
      <div className="relative shrink-0">
        <div className={obscureThumbnail ? 'blur-[6px] opacity-40' : ''}>
          <FallbackAvatar src={channel.avatarUrl} alt={channel.displayName} size="md" />
        </div>
        {obscureThumbnail && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-0.5">
              <Dice5 className="h-3.5 w-3.5 text-orange-400" />
              <span className="text-[7px] text-orange-400 font-medium leading-none">18+</span>
            </div>
          </div>
        )}
      </div>
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
          {/* Gambling warning badge */}
          {isGambling && !showMatureContent && (
            <Badge variant="outline" className="text-[9px] text-orange-400 border-orange-500/30 bg-orange-500/10 py-0 gap-0.5">
              <Dice5 className="h-2.5 w-2.5" />
              Gambling
            </Badge>
          )}
          {isGambling && showMatureContent && (
            <Badge variant="outline" className="text-[9px] text-orange-400 border-orange-500/30 bg-orange-500/10 py-0 gap-0.5">
              <Dice5 className="h-2.5 w-2.5" />
              Gambling 18+
            </Badge>
          )}
          {!isGambling && channel.isMature && showMatureContent && (
            <Badge variant="outline" className="text-[9px] text-pink-400 border-pink-500/30 py-0">18+</Badge>
          )}
        </div>
        <div className={`text-xs text-muted-foreground truncate ${obscureThumbnail ? 'opacity-50' : ''}`}>
          {obscureThumbnail ? 'Gambling Content — Click to enable 18+' : (channel.title || channel.category || `kick.com/${channel.username}`)}
        </div>
        {obscureThumbnail && channel.category && (
          <div className="text-[10px] text-orange-400/60 mt-0.5">{channel.category}</div>
        )}
      </div>
      {channel.viewerCount ? (
        <div className={`flex items-center gap-1 text-xs text-muted-foreground shrink-0 ${obscureThumbnail ? 'opacity-50' : ''}`}>
          <Tv className="h-3 w-3" />
          {formatViewerCount(channel.viewerCount)}
        </div>
      ) : null}
    </button>
  );
}
