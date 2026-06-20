'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useSearchStore } from '@/stores/searchStore';
import { useMultiStreamStore } from '@/stores/multiStreamStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { searchChannels, fetchTopCategories, fetchCategoryChannels, fetchPopularStreams, fetchRecommendations } from '@/lib/kick-api';
import { detectMatureFromCategory, getMatureSubCategoryLabel } from '@/lib/mature-content';
import { isGamblingStream, shouldObscureThumbnail, shouldShowGamblingWarning } from '@/lib/mature-content-enforcer';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Search, X, Clock, Flame, Users, Tv, Loader2, AlertTriangle, Dice5, ChevronLeft, ArrowLeft, Shield, Waves, Mic, Gamepad2, MessageCircle, ShieldAlert, Trophy, Zap, TrendingUp, Sparkles, LayoutGrid, ChevronRight, Eye, ArrowUp, ArrowDown, Minus, Filter, SortAsc, Radio, Timer, Heart, RefreshCw, Globe, Music, Lock, Play } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { FallbackAvatar, FallbackThumbnail } from '@/components/FallbackAvatar';
import type { StreamChannel, CategoryItem } from '@/types';

// Format viewer count: 1.2k, 15k, 1.2M
function formatViewerCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return count.toString();
}

// Format uptime from minutes
function formatUptime(minutes: number | undefined): string {
  if (!minutes || minutes <= 0) return '';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remainHours = hours % 24;
  return remainHours > 0 ? `${days}d ${remainHours}h` : `${days}d`;
}

// Sub-category icon mapping
function getSubCategoryIcon(sub: string): React.ReactNode {
  switch (sub) {
    case 'pool-hot-tub': return <Waves className="h-3 w-3" />;
    case 'adult-entertainment': return <ShieldAlert className="h-3 w-3" />;
    case 'sensual-asmr': return <Mic className="h-3 w-3" />;
    case 'mature-gaming': return <Gamepad2 className="h-3 w-3" />;
    case 'gambling': return <Dice5 className="h-3 w-3" />;
    case 'uncensored-talk': return <MessageCircle className="h-3 w-3" />;
    default: return <AlertTriangle className="h-3 w-3" />;
  }
}

// Sub-category color mapping
function getSubCategoryColor(sub: string): string {
  switch (sub) {
    case 'pool-hot-tub': return 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30';
    case 'adult-entertainment': return 'text-pink-400 bg-pink-500/10 border-pink-500/30';
    case 'sensual-asmr': return 'text-purple-400 bg-purple-500/10 border-purple-500/30';
    case 'mature-gaming': return 'text-red-400 bg-red-500/10 border-red-500/30';
    case 'gambling': return 'text-orange-400 bg-orange-500/10 border-orange-500/30';
    case 'uncensored-talk': return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30';
    default: return 'text-gray-400 bg-gray-500/10 border-gray-500/30';
  }
}

// Search suggestions based on trending categories — includes ASMR, Pool, Gambling, etc.
const SEARCH_SUGGESTIONS = [
  { label: 'xqc', type: 'channel' as const },
  { label: 'Just Chatting', type: 'category' as const },
  { label: 'rust', type: 'category' as const },
  { label: 'ASMR', type: 'category' as const },
  { label: 'Pools, Hot Tubs & Bikinis', type: 'category' as const },
  { label: 'shroud', type: 'channel' as const },
  { label: 'Slots', type: 'category' as const },
  { label: 'hasanabi', type: 'channel' as const },
  { label: 'Valorant', type: 'category' as const },
  { label: 'GTA V', type: 'category' as const },
  { label: 'World of Warcraft', type: 'category' as const },
  { label: 'summit1g', type: 'channel' as const },
  { label: 'amouranth', type: 'channel' as const },
  { label: 'IRL', type: 'category' as const },
  { label: 'Music', type: 'category' as const },
  { label: 'Escape From Tarkov', type: 'category' as const },
];

// Quick category access chips — prominent buttons for popular/mature categories
const QUICK_CATEGORIES = [
  { label: 'ASMR', slug: 'asmr', icon: <Mic className="h-3 w-3" />, color: 'text-purple-400 bg-purple-500/10 border-purple-500/30' },
  { label: 'Pools & Hot Tubs', slug: 'pools-hot-tubs-and-bikinis', icon: <Waves className="h-3 w-3" />, color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30' },
  { label: 'Gambling', slug: 'slots', icon: <Dice5 className="h-3 w-3" />, color: 'text-orange-400 bg-orange-500/10 border-orange-500/30' },
  { label: 'Just Chatting', slug: 'just-chatting', icon: <MessageCircle className="h-3 w-3" />, color: 'text-blue-400 bg-blue-500/10 border-blue-500/30' },
  { label: 'GTA V', slug: 'grand-theft-auto-v', icon: <Gamepad2 className="h-3 w-3" />, color: 'text-green-400 bg-green-500/10 border-green-500/30' },
  { label: 'Rust', slug: 'rust', icon: <Gamepad2 className="h-3 w-3" />, color: 'text-red-400 bg-red-500/10 border-red-500/30' },
  { label: 'Valorant', slug: 'valorant', icon: <Gamepad2 className="h-3 w-3" />, color: 'text-pink-400 bg-pink-500/10 border-pink-500/30' },
  { label: 'Music', slug: 'music', icon: <Music className="h-3 w-3" />, color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30' },
];

interface SearchPanelProps {
  onChannelSelect?: (channel: StreamChannel) => void;
  /** Called when a channel is added to a slot — parent can use this to auto-switch tabs */
  onChannelAdded?: () => void;
}

type View = 'search' | 'category';
type MainTab = 'popular' | 'categories' | 'search';
type SortMode = 'relevance' | 'viewers' | 'recent';

// ─── Viewer Delta Tracker ─────────────────────────────────────────────────
interface ViewerDelta {
  current: number;
  previous: number;
  delta: number; // positive = rising, negative = falling
  peak: number;
}

function useViewerTracker(channels: StreamChannel[]) {
  const prevRef = useRef<Map<string, number>>(new Map());
  const peakRef = useRef<Map<string, number>>(new Map());

  const deltas = useMemo(() => {
    const map = new Map<string, ViewerDelta>();
    for (const ch of channels) {
      const prev = prevRef.current.get(ch.id) || ch.viewerCount || 0;
      const current = ch.viewerCount || 0;
      const delta = current - prev;
      const prevPeak = peakRef.current.get(ch.id) || 0;
      const peak = Math.max(prevPeak, current);
      peakRef.current.set(ch.id, peak);
      map.set(ch.id, { current, previous: prev, delta, peak });
    }
    // Update prev ref
    for (const ch of channels) {
      prevRef.current.set(ch.id, ch.viewerCount || 0);
    }
    return map;
  }, [channels]);

  return deltas;
}

export function SearchPanel({ onChannelSelect, onChannelAdded }: SearchPanelProps) {
  const { query, recentSearches, setQuery, addRecentSearch, clearRecentSearches } = useSearchStore();
  const [channelResults, setChannelResults] = useState<StreamChannel[]>([]);
  const [categoryResults, setCategoryResults] = useState<CategoryItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const { addChannelToSlot, activeSlotId, activeChannel } = useMultiStreamStore();
  const { showMatureContent, setShowMatureContent } = useSettingsStore();
  const isMobile = useIsMobile();

  // Main tab: popular, categories, search
  const [mainTab, setMainTab] = useState<MainTab>('popular');

  // Search filters
  const [liveOnly, setLiveOnly] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('relevance');
  const [showFilters, setShowFilters] = useState(false);

  // Category browsing state
  const [view, setView] = useState<View>('search');
  const [selectedCategory, setSelectedCategory] = useState<CategoryItem | null>(null);
  const [categoryChannels, setCategoryChannels] = useState<StreamChannel[]>([]);
  const [loadingCategoryChannels, setLoadingCategoryChannels] = useState(false);

  // Popular streams state
  const [popularStreams, setPopularStreams] = useState<StreamChannel[]>([]);
  const [popularLoading, setPopularLoading] = useState(true);
  const [popularStats, setPopularStats] = useState<{ totalLive: number; totalViewers: number; totalChannels: number } | null>(null);

  // More Like This state
  const [moreLikeThis, setMoreLikeThis] = useState<StreamChannel[]>([]);
  const [moreLikeThisLoading, setMoreLikeThisLoading] = useState(false);

  // Load top categories on mount
  const [topCategories, setTopCategories] = useState<CategoryItem[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);

  // Search debounce
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Category search filter
  const [categorySearch, setCategorySearch] = useState('');

  // Refresh counter
  const [refreshKey, setRefreshKey] = useState(0);

  // Load popular streams on mount
  useEffect(() => {
    let cancelled = false;
    setPopularLoading(true);
    fetchPopularStreams({ limit: 30 })
      .then((result) => {
        if (!cancelled) {
          setPopularStreams(result.channels);
          setPopularStats(result.stats || null);
          setPopularLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setPopularLoading(false);
      });
    return () => { cancelled = true; };
  }, [refreshKey]);

  // Load categories on mount
  useEffect(() => {
    let cancelled = false;
    fetchTopCategories({ includeChannelCount: true })
      .then((cats) => {
        if (!cancelled) {
          setTopCategories(cats);
          setCategoriesLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setCategoriesLoading(false);
      });
    return () => { cancelled = true; };
  }, [refreshKey]);

  // Load "More Like This" when active channel changes
  useEffect(() => {
    if (!activeChannel?.username) {
      setMoreLikeThis([]);
      return;
    }

    let cancelled = false;
    setMoreLikeThisLoading(true);

    fetchRecommendations({ channel: activeChannel.username, limit: 10 })
      .then((result) => {
        if (!cancelled) {
          setMoreLikeThis(result.channels);
          setMoreLikeThisLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMoreLikeThis([]);
          setMoreLikeThisLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [activeChannel?.username]);

  // Debounced search with cancellation
  const handleSearch = useCallback(
    (q: string) => {
      setQuery(q);
      setSearchError(null);
      if (view !== 'search') setView('search');

      // Cancel previous request
      if (abortRef.current) {
        abortRef.current.abort();
      }

      if (!q.trim()) {
        setChannelResults([]);
        setCategoryResults([]);
        return;
      }

      // Switch to search tab when user types
      setMainTab('search');

      // Debounce: wait 300ms before firing search
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }

      searchTimeoutRef.current = setTimeout(async () => {
        const controller = new AbortController();
        abortRef.current = controller;

        setIsSearching(true);
        try {
          const result = await searchChannels(q, {
            liveOnly,
            sort: sortMode,
            limit: 25,
          });
          if (!controller.signal.aborted) {
            setChannelResults(result.channels);
            setCategoryResults(result.categories);
            if (result.channels.length > 0 || result.categories.length > 0) {
              addRecentSearch(q);
            }
            if (result.channels.length === 0 && result.categories.length === 0) {
              setSearchError('No results found. Try searching by Kick username (e.g., "xqc") or category name (e.g., "rust", "pool", "asmr").');
            }
          }
        } catch {
          if (!controller.signal.aborted) {
            setSearchError('Search failed. Please try again.');
          }
        } finally {
          if (!controller.signal.aborted) {
            setIsSearching(false);
          }
        }
      }, 300);
    },
    [setQuery, addRecentSearch, view, liveOnly, sortMode]
  );

  // Re-search when filters change
  useEffect(() => {
    if (query.trim() && mainTab === 'search') {
      handleSearch(query);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveOnly, sortMode]);

  const handleChannelClick = (channel: StreamChannel) => {
    // Allow clicking mature channels — if 18+ mode is off, auto-enable it
    // This prevents the frustrating UX of searching "asmr" or "pool" and
    // seeing results that can't be clicked
    // Gambling streams auto-enable 18+ when clicked (even when obscured)
    if (channel.isMature && !showMatureContent) {
      setShowMatureContent(true);
    }
    if (isGamblingStream(channel) && !showMatureContent) {
      setShowMatureContent(true);
    }
    if (activeSlotId) {
      addChannelToSlot(activeSlotId, channel);
    }
    onChannelSelect?.(channel);
    onChannelAdded?.();
  };

  const handleCategoryClick = useCallback(async (category: CategoryItem) => {
    setSelectedCategory(category);
    setView('category');
    setLoadingCategoryChannels(true);
    setCategoryChannels([]);

    try {
      const result = await fetchCategoryChannels(category.slug, { limit: 25 });
      setCategoryChannels(result.channels || []);
    } catch {
      setCategoryChannels([]);
    } finally {
      setLoadingCategoryChannels(false);
    }
  }, []);

  const handleBackToSearch = () => {
    setView('search');
    setSelectedCategory(null);
    setCategoryChannels([]);
  };

  const handleRefresh = () => {
    setRefreshKey(k => k + 1);
  };

  // Split channels into General and Mature sections
  // General ASMR streams appear in BOTH sections
  // Gambling streams appear as obscured cards in the general section when mature is hidden
  const generalChannels = channelResults.filter(ch => {
    if (ch.isMature && ch.asmrType !== 'general' && !isGamblingStream(ch)) return false;
    if (ch.contentSection === 'mature' && ch.asmrType !== 'general' && !isGamblingStream(ch)) return false;
    return true;
  });

  const matureChannels = channelResults.filter(ch => {
    if (ch.isMature || ch.contentSection === 'mature') return true;
    // Include ASMR channels in mature section for discoverability
    return ch.asmrType !== null && ch.asmrType !== undefined;
  });

  // Filter categories by search
  const filteredCategories = useMemo(() => {
    let cats = query ? categoryResults : topCategories;
    if (categorySearch.trim()) {
      const s = categorySearch.toLowerCase();
      cats = cats.filter(c =>
        c.name.toLowerCase().includes(s) ||
        c.slug.toLowerCase().includes(s)
      );
    }
    return cats;
  }, [query, categoryResults, topCategories, categorySearch]);

  // Split categories into General and Mature
  // ASMR category appears in BOTH sections
  const generalCategories = filteredCategories.filter(cat => {
    if (cat.isMature && cat.asmrType !== 'general') return false;
    if (cat.contentSection === 'mature' && cat.asmrType !== 'general') return false;
    const { asmrType } = detectMatureFromCategory(cat.name);
    if (asmrType === 'general') return true;
    const { isMature } = detectMatureFromCategory(cat.name);
    return !isMature;
  });

  const matureCategories = filteredCategories.filter(cat => {
    if (cat.isMature || cat.contentSection === 'mature') return true;
    const { asmrType } = detectMatureFromCategory(cat.name);
    // ASMR categories also appear in mature section
    if (asmrType !== null) return true;
    const { isMature } = detectMatureFromCategory(cat.name);
    return isMature;
  });

  // Also split category detail channels
  const generalCategoryChannels = categoryChannels.filter(ch => {
    if (ch.isMature && ch.asmrType !== 'general' && !isGamblingStream(ch)) return false;
    if (ch.contentSection === 'mature' && ch.asmrType !== 'general' && !isGamblingStream(ch)) return false;
    return true;
  });
  const matureCategoryChannels = categoryChannels.filter(ch => {
    if (ch.isMature || ch.contentSection === 'mature') return true;
    return ch.asmrType !== null && ch.asmrType !== undefined;
  });

  // Streak Champions: find channels with liveStreak >= 3
  const streakChampions = channelResults.filter(ch => (ch.liveStreak ?? 0) >= 3);
  const matureStreakChampions = matureChannels.filter(ch => (ch.liveStreak ?? 0) >= 3);

  // Split popular streams — General ASMR appears in both sections
  // Gambling streams appear as obscured cards in the general section when mature is hidden
  const popularLive = popularStreams.filter(ch => ch.isLive);
  const popularGeneral = popularLive.filter(ch => {
    // General section: all non-mature + general ASMR + gambling (as obscured cards)
    if (ch.contentSection === 'mature' && ch.asmrType !== 'general' && !isGamblingStream(ch)) return false;
    if (ch.isMature && ch.asmrType !== 'general' && !isGamblingStream(ch)) return false;
    return true;
  });
  const popularMature = popularLive.filter(ch => {
    // Mature section: all mature content + all ASMR (both general and sensual)
    if (ch.isMature || ch.contentSection === 'mature') return true;
    // Include ASMR channels in mature section for discoverability
    return ch.asmrType !== null && ch.asmrType !== undefined;
  });
  const popularOffline = popularStreams.filter(ch => !ch.isLive);

  // Split more like this — General ASMR appears in both sections
  // Gambling streams appear as obscured cards in the general section when mature is hidden
  const mltGeneral = moreLikeThis.filter(ch => {
    if (ch.isMature && ch.asmrType !== 'general' && !isGamblingStream(ch)) return false;
    if (ch.contentSection === 'mature' && ch.asmrType !== 'general' && !isGamblingStream(ch)) return false;
    return true;
  });
  const mltMature = moreLikeThis.filter(ch => {
    if (ch.isMature || ch.contentSection === 'mature') return true;
    return ch.asmrType !== null && ch.asmrType !== undefined;
  });

  // Viewer tracking for popular streams
  const viewerDeltas = useViewerTracker(popularLive);

  // ─── Category Detail View ────────────────────────────────────────────────
  if (view === 'category' && selectedCategory) {
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="p-3 border-b">
          <button
            onClick={handleBackToSearch}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>

          <div className="flex items-center gap-3">
            <FallbackThumbnail src={selectedCategory.bannerUrl} alt={selectedCategory.name} className="w-12 h-12 rounded-lg object-cover shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm truncate">{selectedCategory.name}</h3>
                {selectedCategory.isMature && (
                  <Badge variant="outline" className="text-[9px] text-pink-400 border-pink-500/30 shrink-0">18+</Badge>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {selectedCategory.viewerCount ? (
                  <span className="flex items-center gap-1">
                    <Eye className="h-3 w-3" />
                    {formatViewerCount(selectedCategory.viewerCount)} viewers
                  </span>
                ) : null}
                {selectedCategory.parentCategory && (
                  <span>· {selectedCategory.parentCategory}</span>
                )}
              </div>
              {selectedCategory.subCategories && selectedCategory.subCategories.length > 0 && (
                <div className="flex gap-1 mt-1 flex-wrap">
                  {selectedCategory.subCategories.map((sub) => (
                    <Badge key={sub} variant="outline" className={`text-[8px] ${getSubCategoryColor(sub)}`}>
                      {getSubCategoryIcon(sub)}
                      <span className="ml-0.5">{getMatureSubCategoryLabel(sub as never)}</span>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Channels in this category */}
        <div className="flex-1 overflow-y-auto p-2">
          {loadingCategoryChannels ? (
            <div className="text-center text-sm text-muted-foreground py-8">
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
              Loading streams...
            </div>
          ) : categoryChannels.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-8 px-4">
              <Flame className="h-8 w-8 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No one is live in this category right now.</p>
              <div className="flex flex-col gap-2 mt-4">
                <Button
                  variant="default"
                  size="sm"
                  className="mx-auto gap-1.5"
                  onClick={() => { setView('search'); setSelectedCategory(null); setMainTab('popular'); }}
                >
                  <TrendingUp className="h-3.5 w-3.5" />
                  Browse Popular Streams
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="mx-auto gap-1.5"
                  onClick={handleBackToSearch}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Back to Categories
                </Button>
              </div>
              {/* More Like This section */}
              {activeChannel && mltGeneral.length > 0 && (
                <div className="mt-6 text-left">
                  <div className="text-xs font-medium px-2 py-1.5 flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-primary/70" />
                    More Like This
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1 px-2">
                    {mltGeneral.map((ch) => (
                      <MiniStreamCard key={ch.id} channel={ch} onClick={handleChannelClick} showMatureContent={showMatureContent} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              {generalCategoryChannels.length > 0 && (
                <div className="space-y-1 mb-3">
                  <div className="text-xs font-medium text-foreground px-2 py-1 flex items-center gap-1.5">
                    <Shield className="h-3 w-3 text-green-400" />
                    General
                    <span className="text-muted-foreground">({generalCategoryChannels.length})</span>
                  </div>
                  {generalCategoryChannels.map((channel) => (
                    <ChannelRow key={channel.id} channel={channel} onClick={handleChannelClick} showMatureContent={showMatureContent} />
                  ))}
                </div>
              )}

              {matureCategoryChannels.length > 0 && showMatureContent && (
                <div className="space-y-1">
                  <div className="text-xs font-medium text-foreground px-2 py-1 flex items-center gap-1.5">
                    <ShieldAlert className="h-3 w-3 text-pink-400" />
                    Mature Collection (18+)
                    <span className="text-muted-foreground">({matureCategoryChannels.length})</span>
                  </div>
                  {matureCategoryChannels.map((channel) => (
                    <ChannelRow key={channel.id} channel={channel} onClick={handleChannelClick} showMatureContent={showMatureContent} />
                  ))}
                </div>
              )}

              {matureCategoryChannels.length > 0 && !showMatureContent && (() => {
                const gamblingCount = matureCategoryChannels.filter(ch => isGamblingStream(ch)).length;
                const nonGamblingHidden = matureCategoryChannels.length - gamblingCount;
                return nonGamblingHidden > 0 ? (
                  <div className="flex items-center gap-1.5 px-2 py-2 rounded bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 text-xs">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    {nonGamblingHidden} mature stream{nonGamblingHidden !== 1 ? 's' : ''} hidden — enable 18+ toggle
                    {gamblingCount > 0 && (
                      <span className="text-orange-400 ml-1">· {gamblingCount} gambling stream{gamblingCount !== 1 ? 's' : ''} shown with warning</span>
                    )}
                  </div>
                ) : gamblingCount > 0 ? (
                  <div className="flex items-center gap-1.5 px-2 py-2 rounded bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs">
                    <Dice5 className="h-3.5 w-3.5 shrink-0" />
                    {gamblingCount} gambling stream{gamblingCount !== 1 ? 's' : ''} shown with warning — enable 18+ for full details
                  </div>
                ) : null;
              })()}
            </>
          )}
        </div>
      </div>
    );
  }

  // ─── Contextualized search input helpers ────────────────────────────────
  const isCategoryMode = mainTab === 'categories';
  const searchInputValue = isCategoryMode ? categorySearch : query;
  const searchInputPlaceholder = isCategoryMode
    ? 'Filter active categories...'
    : 'Search channels or categories (e.g. xqc, rust, pool, asmr)...';
  const handleSearchInputChange = isCategoryMode
    ? (e: React.ChangeEvent<HTMLInputElement>) => setCategorySearch(e.target.value)
    : (e: React.ChangeEvent<HTMLInputElement>) => handleSearch(e.target.value);
  const handleSearchInputClear = isCategoryMode
    ? () => setCategorySearch('')
    : () => { setQuery(''); setChannelResults([]); setCategoryResults([]); setSearchError(null); setMainTab('popular'); };

  // ─── Main Search View ────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* Search Input */}
      <div className="p-3 border-b" suppressHydrationWarning>
        <form autoComplete="off" onSubmit={(e) => e.preventDefault()} className="relative" suppressHydrationWarning>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={searchInputPlaceholder}
            value={searchInputValue}
            onChange={handleSearchInputChange}
            className={`pl-9 ${showFilters ? 'pr-20' : 'pr-16'} ${isMobile ? 'h-12' : ''}`}
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            data-protonpass-ignore="true"
          />
          {isSearching && (
            <Loader2 className="absolute right-12 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
          )}
          {/* Filter toggle button */}
          <Button
            variant="ghost"
            size="icon"
            className={`absolute right-8 top-1/2 -translate-y-1/2 h-6 w-6 ${showFilters ? 'text-primary' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
            title="Toggle filters"
          >
            <Filter className="h-3 w-3" />
          </Button>
          {searchInputValue && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
              onClick={handleSearchInputClear}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </form>

        {/* Search Filters */}
        {showFilters && (
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <button
              className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border transition-colors ${
                liveOnly
                  ? 'bg-red-500/10 text-red-400 border-red-500/30'
                  : 'bg-muted/30 text-muted-foreground border-muted hover:bg-muted/50'
              }`}
              onClick={() => setLiveOnly(!liveOnly)}
            >
              <Radio className="h-2.5 w-2.5" />
              Live Only
            </button>
            <button
              className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border transition-colors ${
                sortMode === 'viewers'
                  ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                  : 'bg-muted/30 text-muted-foreground border-muted hover:bg-muted/50'
              }`}
              onClick={() => setSortMode(sortMode === 'viewers' ? 'relevance' : 'viewers')}
            >
              <SortAsc className="h-2.5 w-2.5" />
              By Viewers
            </button>
            <button
              className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border transition-colors ${
                sortMode === 'recent'
                  ? 'bg-green-500/10 text-green-400 border-green-500/30'
                  : 'bg-muted/30 text-muted-foreground border-muted hover:bg-muted/50'
              }`}
              onClick={() => setSortMode(sortMode === 'recent' ? 'relevance' : 'recent')}
            >
              <Timer className="h-2.5 w-2.5" />
              Most Recent
            </button>
          </div>
        )}

        {/* Tabs + Refresh */}
        <div className="flex items-center justify-between mt-2">
          <div className="flex gap-1">
            <TabButton
              active={mainTab === 'popular'}
              onClick={() => setMainTab('popular')}
              icon={<TrendingUp className="h-3 w-3" />}
              label="Popular"
            />
            <TabButton
              active={mainTab === 'categories'}
              onClick={() => setMainTab('categories')}
              icon={<LayoutGrid className="h-3 w-3" />}
              label="Categories"
            />
          </div>

          <div className="flex items-center gap-2">
            {/* Refresh button */}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={handleRefresh}
              title="Refresh streams"
            >
              <RefreshCw className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Mature content notice */}
        {showMatureContent && (
          <div className="flex items-center gap-1.5 mt-2 px-2 py-1 rounded bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 text-[10px]">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            <span>18+ mode — Pool/Hot Tub, gambling, ASMR &amp; suggestive content visible</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* ─── Popular Tab ──────────────────────────────────────────────── */}
        {mainTab === 'popular' && (
          <div className="p-2 space-y-4">
            {/* More Like This (if a stream is active) */}
            {activeChannel && (mltGeneral.length > 0 || mltMature.length > 0 || moreLikeThisLoading) && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 px-2 py-1">
                  <Sparkles className="h-3.5 w-3.5 text-primary/70" />
                  <span className="text-xs font-medium">More Like {activeChannel.displayName}</span>
                  {activeChannel.category && (
                    <Badge variant="outline" className="text-[9px] py-0 px-1">
                      {activeChannel.category}
                    </Badge>
                  )}
                </div>
                {moreLikeThisLoading ? (
                  <div className="flex gap-2 overflow-x-auto pb-1 px-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="flex flex-col gap-1.5 p-2 rounded-lg bg-muted/30 shrink-0 w-32">
                        <div className="w-full aspect-video rounded-md skeleton" />
                        <div className="h-3 w-20 rounded skeleton" />
                        <div className="h-2.5 w-14 rounded skeleton" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex gap-2 overflow-x-auto pb-1 px-2">
                    {[...mltGeneral, ...(showMatureContent ? mltMature : mltMature.filter(ch => isGamblingStream(ch)))]
                      .filter((ch, idx, arr) => arr.findIndex(c => c.id === ch.id) === idx) // Deduplicate by id
                      .map((ch) => (
                      <MiniStreamCard
                        key={ch.id}
                        channel={ch}
                        onClick={handleChannelClick}
                        showMatureContent={showMatureContent}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Popular Live Streams */}
            {popularLoading ? (
              <div className="space-y-1">
                <div className="text-xs font-medium px-2 py-1.5 flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full skeleton" />
                  <div className="h-3 w-20 rounded skeleton" />
                </div>
                {Array.from({ length: 4 }).map((_, i) => (
                  <SkeletonChannelRow key={i} />
                ))}
              </div>
            ) : (
              <>
                {/* Stats bar */}
                {(popularLive.length > 0 || popularStats) && (
                  <div className="flex items-center gap-3 px-2 py-1.5 rounded-lg bg-muted/20">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                      <span className="font-medium text-foreground">{popularStats?.totalLive || popularLive.length}</span> live
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Eye className="h-3 w-3" />
                      {formatViewerCount(popularStats?.totalViewers || popularLive.reduce((s, c) => s + (c.viewerCount || 0), 0))} viewers
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Globe className="h-3 w-3" />
                      {popularStats?.totalChannels || popularStreams.length} channels
                    </div>
                  </div>
                )}

                {/* General Popular */}
                {popularGeneral.length > 0 && (
                  <div className="space-y-0.5">
                    <div className="text-xs font-medium px-2 py-1.5 flex items-center gap-1.5 text-foreground">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                      Popular Now
                      <span className="text-muted-foreground font-normal">({popularGeneral.length})</span>
                    </div>
                    {popularGeneral.map((channel) => (
                      <ChannelRow key={channel.id} channel={channel} onClick={handleChannelClick} showMatureContent={showMatureContent} viewerDelta={viewerDeltas.get(channel.id)} />
                    ))}
                  </div>
                )}

                {/* Mature Popular */}
                {popularMature.length > 0 && showMatureContent && (
                  <div className="space-y-0.5">
                    <div className="text-xs font-medium px-2 py-1.5 flex items-center gap-1.5">
                      <ShieldAlert className="h-3 w-3 text-pink-400" />
                      Mature Streams (18+)
                      <span className="text-muted-foreground font-normal">({popularMature.length})</span>
                    </div>
                    {popularMature.map((channel) => (
                      <ChannelRow key={channel.id} channel={channel} onClick={handleChannelClick} showMatureContent={showMatureContent} viewerDelta={viewerDeltas.get(channel.id)} />
                    ))}
                  </div>
                )}

                {popularMature.length > 0 && !showMatureContent && (() => {
                  const gamblingCount = popularMature.filter(ch => isGamblingStream(ch)).length;
                  const nonGamblingHidden = popularMature.length - gamblingCount;
                  return nonGamblingHidden > 0 ? (
                    <div className="flex items-center gap-1.5 px-2 py-2 rounded bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 text-xs">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      {nonGamblingHidden} mature stream{nonGamblingHidden !== 1 ? 's' : ''} hidden — enable 18+ toggle
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

                {/* Offline Channels */}
                {popularOffline.length > 0 && (
                  <div>
                    <div className="text-xs font-medium px-2 py-1.5 text-muted-foreground">
                      Offline ({popularOffline.length})
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1 px-2">
                      {popularOffline.map((channel) => (
                        <button
                          key={channel.id}
                          className="streamer-card is-offline flex items-center gap-2 p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors shrink-0"
                          onClick={() => handleChannelClick(channel)}
                        >
                          <FallbackAvatar src={channel.avatarUrl} alt={channel.displayName} size="sm" />
                          <div className="text-left">
                            <div className="text-xs font-medium whitespace-nowrap">{channel.displayName}</div>
                            {channel.category && (
                              <div className="text-[10px] text-muted-foreground">{channel.category}</div>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ─── Categories Tab ────────────────────────────────────────────── */}
        {mainTab === 'categories' && (
          <div className="p-2 space-y-4">
            {categoriesLoading ? (
              <div className="space-y-3 px-2">
                <div className="grid grid-cols-2 gap-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="p-2 rounded-lg bg-muted/30">
                      <div className="w-full aspect-[16/9] rounded-md skeleton mb-1.5" />
                      <div className="h-3 w-20 rounded skeleton" />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {/* General Categories */}
                {generalCategories.length > 0 && (
                  <div>
                    <div className="text-xs font-medium px-2 py-1.5 flex items-center gap-1.5 mb-2">
                      <Shield className="h-3 w-3 text-green-400" />
                      Categories
                      <span className="text-muted-foreground font-normal">({generalCategories.length})</span>
                      {/* 18+ Toggle — inline with Categories header */}
                      <div className="flex items-center gap-1 ml-auto">
                        <span className="text-[10px] text-muted-foreground">18+</span>
                        <Switch
                          checked={showMatureContent}
                          onCheckedChange={setShowMatureContent}
                          className="scale-75"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {generalCategories.map((cat) => (
                        <CategoryCard key={cat.slug} category={cat} showMatureContent={showMatureContent} onClick={handleCategoryClick} />
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
                    <div className="grid grid-cols-2 gap-2">
                      {matureCategories.map((cat) => (
                        <CategoryCard key={cat.slug} category={cat} showMatureContent={showMatureContent} onClick={handleCategoryClick} />
                      ))}
                    </div>
                  </div>
                )}

                {matureCategories.length > 0 && !showMatureContent && (
                  <div className="flex items-center gap-1.5 px-2 py-2 rounded bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 text-xs">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    {matureCategories.length} mature categor{matureCategories.length !== 1 ? 'ies' : 'y'} hidden — enable 18+ toggle to show
                  </div>
                )}

                {generalCategories.length === 0 && matureCategories.length === 0 && (
                  <div className="text-center text-sm text-muted-foreground py-8">
                    <LayoutGrid className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p>No categories found</p>
                    {categorySearch && (
                      <p className="text-xs mt-1">Try a different search term</p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ─── Search Tab ───────────────────────────────────────────────── */}
        {mainTab === 'search' && (
          <div className="p-2">
            {/* Search suggestions (when no query) */}
            {!query && recentSearches.length === 0 && (
              <div className="space-y-3">
                <div className="text-center text-sm text-muted-foreground py-4">
                  <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p>Search for channels or categories</p>
                  <p className="text-xs mt-1">Try: xqc, rust, just chatting, pool, asmr, shroud</p>
                </div>
                <div className="space-y-2">
                  {/* Quick Category Chips — one-click access to popular categories including ASMR, Pool */}
                  <div className="text-xs text-muted-foreground px-2 flex items-center gap-1">
                    <LayoutGrid className="h-3 w-3" />
                    Browse Categories
                  </div>
                  <div className="flex flex-wrap gap-1.5 px-2">
                    {QUICK_CATEGORIES.map((cat) => {
                      const isMatureCat = cat.slug === 'asmr' || cat.slug === 'pools-hot-tubs-and-bikinis' || cat.slug === 'slots';
                      const isLocked = isMatureCat && !showMatureContent;
                      return (
                        <button
                          key={cat.slug}
                          className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md border transition-colors hover:opacity-80 ${isLocked ? 'text-yellow-500/70 bg-yellow-500/10 border-yellow-500/30' : cat.color}`}
                          onClick={() => {
                            // Auto-enable 18+ mode when clicking a mature category chip
                            if (isMatureCat && !showMatureContent) {
                              setShowMatureContent(true);
                            }
                            setView('category');
                            setSelectedCategory({ id: '', name: cat.label, slug: cat.slug, tags: [] });
                            setLoadingCategoryChannels(true);
                            fetchCategoryChannels(cat.slug, { limit: 20 })
                              .then((result) => {
                                setCategoryChannels(result.channels);
                                setSelectedCategory(result.category || { id: '', name: cat.label, slug: cat.slug, tags: [] });
                              })
                              .catch(() => setCategoryChannels([]))
                              .finally(() => setLoadingCategoryChannels(false));
                          }}
                          title={isLocked ? 'Click to enable 18+ and browse' : `Browse ${cat.label}`}
                        >
                          {isLocked ? <Lock className="h-3 w-3" /> : cat.icon}
                          {cat.label}
                          {isLocked && <Lock className="h-2.5 w-2.5 ml-0.5" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground px-2 flex items-center gap-1">
                    <Sparkles className="h-3 w-3" />
                    Quick Search
                  </div>
                  <div className="flex flex-wrap gap-1.5 px-2">
                    {SEARCH_SUGGESTIONS.map((s) => (
                      <Badge
                        key={s.label}
                        variant="outline"
                        className="text-xs cursor-pointer hover:bg-muted transition-colors gap-1"
                        onClick={() => handleSearch(s.label)}
                      >
                        {s.type === 'channel' ? (
                          <Tv className="h-2.5 w-2.5" />
                        ) : (
                          <LayoutGrid className="h-2.5 w-2.5" />
                        )}
                        {s.label}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Recent Searches */}
            {!query && recentSearches.length > 0 && (
              <div className="mb-3">
                <div className="text-xs text-muted-foreground mb-2 flex items-center justify-between px-2">
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Recent Searches
                  </div>
                  <button
                    className="text-[10px] hover:text-foreground transition-colors"
                    onClick={clearRecentSearches}
                  >
                    Clear all
                  </button>
                </div>
                <div className="flex flex-wrap gap-1 px-2">
                  {recentSearches.map((q) => (
                    <Badge
                      key={q}
                      variant="outline"
                      className="text-xs cursor-pointer hover:bg-muted"
                      onClick={() => handleSearch(q)}
                    >
                      {q}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {searchError && channelResults.length === 0 && categoryResults.length === 0 && query && (
              <div className="text-center text-sm text-muted-foreground py-4">
                {searchError}
              </div>
            )}

            {query && isSearching && channelResults.length === 0 && (
              <div className="space-y-1.5 px-2">
                <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Search className="h-3 w-3" />
                  Searching...
                </div>
                {Array.from({ length: 4 }).map((_, i) => (
                  <SkeletonChannelRow key={i} />
                ))}
              </div>
            )}

            {query && !isSearching && (
              <ChannelResultsSplit
                generalChannels={generalChannels}
                matureChannels={matureChannels}
                streakChampions={streakChampions}
                matureStreakChampions={matureStreakChampions}
                onChannelClick={handleChannelClick}
                showMatureContent={showMatureContent}
                totalResults={channelResults.length}
                categoryResults={categoryResults}
                onCategoryClick={handleCategoryClick}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab Button ──────────────────────────────────────────────────────────────

function TabButton({ active, onClick, icon, label }: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Button
      variant={active ? 'default' : 'ghost'}
      size="sm"
      className="h-7 text-xs gap-1"
      onClick={onClick}
    >
      {icon}
      {label}
    </Button>
  );
}

// ─── Mini Stream Card (for More Like This horizontal scroll) ─────────────

function MiniStreamCard({ channel, onClick, showMatureContent }: {
  channel: StreamChannel;
  onClick: (ch: StreamChannel) => void;
  showMatureContent: boolean;
}) {
  const isMature = channel.isMature || detectMatureFromCategory(channel.category).isMature;
  const isGambling = isGamblingStream(channel);
  const obscureThumbnail = shouldObscureThumbnail(channel, showMatureContent);

  return (
    <button
      className={`flex flex-col gap-1.5 p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors shrink-0 w-32 text-left ${
        isMature && showMatureContent && !isGambling ? 'border border-pink-500/10 bg-pink-500/5' : ''
      } ${obscureThumbnail ? 'border border-orange-500/30' : ''}`}
      onClick={() => onClick(channel)}
    >
      <div className="w-full aspect-video bg-muted rounded-md flex items-center justify-center overflow-hidden relative">
        {obscureThumbnail ? (
          // Gambling content obscured overlay
          <div className="w-full h-full bg-black/60 backdrop-blur-sm flex items-center justify-center">
            <div className="flex flex-col items-center gap-0.5">
              <Dice5 className="h-4 w-4 text-orange-400" />
              <span className="text-[7px] text-orange-300 font-medium">Gambling</span>
            </div>
          </div>
        ) : channel.thumbnail ? (
          <FallbackThumbnail src={channel.thumbnail} alt={channel.displayName} className="w-full h-full object-cover" />
        ) : (
          <FallbackAvatar src={channel.avatarUrl} alt={channel.displayName} size="sm" />
        )}
        {channel.isLive && !obscureThumbnail && (
          <div className="absolute top-1 left-1 flex items-center gap-0.5 bg-red-500/90 px-1 py-0.5 rounded text-[8px] text-white font-medium">
            <span className="w-1 h-1 rounded-full bg-white animate-pulse" />
            LIVE
          </div>
        )}
        {channel.isLive && obscureThumbnail && (
          <div className="absolute top-1 left-1 flex items-center gap-0.5 bg-orange-500/90 px-1 py-0.5 rounded text-[8px] text-white font-medium">
            LIVE
          </div>
        )}
        {/* Gambling warning badge - always shown for gambling streams */}
        {isGambling && (
          <div className="absolute top-1 right-1">
            <Badge variant="outline" className="text-[7px] text-orange-400 border-orange-500/30 bg-black/60 py-0 px-0.5">
              <Dice5 className="h-2 w-2 mr-0.5" />
              18+
            </Badge>
          </div>
        )}
        {!isGambling && isMature && showMatureContent && (
          <div className="absolute top-1 right-1">
            <Badge variant="outline" className="text-[7px] text-pink-400 border-pink-500/30 bg-black/60 py-0 px-0.5">18+</Badge>
          </div>
        )}
        {channel.viewerCount ? (
          <div className="absolute bottom-1 right-1 flex items-center gap-0.5 bg-black/70 px-1 py-0.5 rounded text-[8px] text-white/80">
            <Eye className="h-2 w-2" />
            {formatViewerCount(channel.viewerCount)}
          </div>
        ) : null}
      </div>
      <div className="min-w-0">
        <div className={`text-xs font-medium truncate ${obscureThumbnail ? 'opacity-60' : ''}`}>{channel.displayName}</div>
        <div className="text-[10px] text-muted-foreground truncate">
          {obscureThumbnail ? 'Gambling Content' : (channel.category || channel.title || 'Streaming')}
        </div>
        {channel.uptimeMinutes && channel.uptimeMinutes > 0 && !obscureThumbnail && (
          <div className="text-[10px] text-muted-foreground/60 flex items-center gap-0.5 mt-0.5">
            <Timer className="h-2 w-2" />
            {formatUptime(channel.uptimeMinutes)}
          </div>
        )}
      </div>
    </button>
  );
}

// ─── Channel Row ──────────────────────────────────────────────────────────────

function ChannelRow({ channel, onClick, showMatureContent, viewerDelta }: {
  channel: StreamChannel;
  onClick: (ch: StreamChannel) => void;
  showMatureContent: boolean;
  viewerDelta?: ViewerDelta;
}) {
  const isGambling = isGamblingStream(channel);
  const obscureThumbnail = shouldObscureThumbnail(channel, showMatureContent);

  return (
    <button
      className={`w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors text-left min-h-12 ${
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
          {/* Live streak badge */}
          {(channel.liveStreak ?? 0) >= 3 && (
            <span className="flex items-center gap-0.5 text-[10px] text-amber-400 font-medium bg-amber-500/10 px-1 rounded">
              <Zap className="h-2.5 w-2.5" />
              {channel.liveStreak}d
            </span>
          )}
          {/* Gambling warning badge - always shown for gambling streams */}
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
        </div>
        <div className={`text-xs text-muted-foreground truncate ${obscureThumbnail ? 'opacity-50' : ''}`}>
          {obscureThumbnail ? 'Gambling Content — Click to enable 18+' : (channel.title || channel.category || `kick.com/${channel.username}`)}
        </div>
        {/* Sub-category badges */}
        {channel.subCategories && channel.subCategories.length > 0 && showMatureContent && (
          <div className="flex gap-1 mt-0.5 flex-wrap">
            {channel.subCategories.map((sub) => (
              <Badge key={sub} variant="outline" className={`text-[8px] py-0 px-1 ${getSubCategoryColor(sub)}`}>
                {getSubCategoryIcon(sub)}
                <span className="ml-0.5">{getMatureSubCategoryLabel(sub as never)}</span>
              </Badge>
            ))}
          </div>
        )}
        {channel.category && !channel.subCategories?.length && !obscureThumbnail && (
          <div className="text-[10px] text-muted-foreground/70 mt-0.5">{channel.category}</div>
        )}
        {obscureThumbnail && channel.category && (
          <div className="text-[10px] text-orange-400/60 mt-0.5">{channel.category}</div>
        )}
        {/* Uptime display */}
        {channel.isLive && channel.uptimeMinutes && channel.uptimeMinutes > 0 && !obscureThumbnail && (
          <div className="text-[10px] text-muted-foreground/60 flex items-center gap-0.5 mt-0.5">
            <Timer className="h-2 w-2" />
            {formatUptime(channel.uptimeMinutes)}
          </div>
        )}
      </div>
      {/* Viewer count with delta indicator */}
      <div className="flex flex-col items-end gap-0.5 shrink-0">
        {channel.viewerCount ? (
          <div className={`flex items-center gap-1 text-xs ${obscureThumbnail ? 'opacity-50' : ''}`}>
            <Eye className="h-3 w-3 text-muted-foreground" />
            <span className="font-medium">{formatViewerCount(channel.viewerCount)}</span>
          </div>
        ) : null}
        {/* Viewer delta indicator */}
        {viewerDelta && viewerDelta.delta !== 0 && channel.isLive && (
          <div className={`flex items-center gap-0.5 text-[9px] font-medium ${
            viewerDelta.delta > 0 ? 'text-green-400' : 'text-red-400'
          }`}>
            {viewerDelta.delta > 0 ? (
              <ArrowUp className="h-2.5 w-2.5" />
            ) : (
              <ArrowDown className="h-2.5 w-2.5" />
            )}
            {formatViewerCount(Math.abs(viewerDelta.delta))}
          </div>
        )}
        {/* Peak viewers */}
        {viewerDelta && viewerDelta.peak > (channel.viewerCount || 0) * 1.1 && channel.isLive && (
          <div className="text-[8px] text-amber-400/60 flex items-center gap-0.5">
            <Trophy className="h-2 w-2" />
            Peak: {formatViewerCount(viewerDelta.peak)}
          </div>
        )}
      </div>
    </button>
  );
}

// ─── Channel Results Split (General vs Mature) ─────────────────────────────

function ChannelResultsSplit({
  generalChannels,
  matureChannels,
  streakChampions,
  matureStreakChampions,
  onChannelClick,
  showMatureContent,
  totalResults,
  categoryResults,
  onCategoryClick,
}: {
  generalChannels: StreamChannel[];
  matureChannels: StreamChannel[];
  streakChampions: StreamChannel[];
  matureStreakChampions: StreamChannel[];
  onChannelClick: (ch: StreamChannel) => void;
  showMatureContent: boolean;
  totalResults: number;
  categoryResults: CategoryItem[];
  onCategoryClick: (cat: CategoryItem) => void;
}) {
  if (generalChannels.length === 0 && matureChannels.length === 0 && categoryResults.length === 0) return null;

  return (
    <div className="space-y-3">
      {/* Results count */}
      <div className="text-xs text-muted-foreground px-2 flex items-center gap-1.5">
        <Search className="h-3 w-3" />
        {totalResults} channel{totalResults !== 1 ? 's' : ''} found
        {categoryResults.length > 0 && (
          <> · {categoryResults.length} categor{categoryResults.length !== 1 ? 'ies' : 'y'}</>
        )}
      </div>

      {/* Category results — shown prominently with Browse buttons */}
      {categoryResults.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-medium px-2 py-1 flex items-center gap-1.5">
            <LayoutGrid className="h-3 w-3" />
            Matching Categories
            <span className="text-muted-foreground font-normal">({categoryResults.length})</span>
          </div>
          <div className="space-y-1.5 px-2">
            {categoryResults.slice(0, 6).map((cat) => {
              const isMatureCat = cat.isMature || detectMatureFromCategory(cat.name).isMature;
              const isLocked = isMatureCat && !showMatureContent;
              return (
                <div key={cat.slug} className={`flex items-center gap-2 p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors ${isLocked ? 'opacity-50' : ''}`}>
                  <FallbackThumbnail src={cat.bannerUrl} alt={cat.name} className="w-10 h-10 rounded object-cover shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium truncate">{cat.name}</span>
                      {cat.isMature && (
                        <Badge variant="outline" className="text-[7px] text-pink-400 border-pink-500/30 py-0 px-0.5">18+</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      {cat.viewerCount ? (
                        <span className="flex items-center gap-0.5">
                          <Eye className="h-2.5 w-2.5" />
                          {formatViewerCount(cat.viewerCount)} viewers
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {isLocked ? (
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
                      <Lock className="h-3 w-3" />
                      18+
                    </div>
                  ) : (
                    <button
                      className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors shrink-0 font-medium"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCategoryClick(cat);
                      }}
                    >
                      <Play className="h-3 w-3" />
                      Browse
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Streak Champions ──────────────────────────────────────────────── */}
      {streakChampions.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-medium px-2 py-1 flex items-center gap-1.5 text-amber-400">
            <Trophy className="h-3.5 w-3.5" />
            Streak Champions
          </div>
          {streakChampions.map((channel) => (
            <ChannelRow key={`streak-${channel.id}`} channel={channel} onClick={onChannelClick} showMatureContent={showMatureContent} />
          ))}
        </div>
      )}

      {/* ── General Feed (All Ages) ──────────────────────────────────────── */}
      {generalChannels.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-medium px-2 py-1 flex items-center gap-1.5">
            <Shield className="h-3 w-3 text-green-400" />
            General Feed
            <span className="text-muted-foreground">({generalChannels.length})</span>
          </div>
          {generalChannels.map((channel) => (
            <ChannelRow key={channel.id} channel={channel} onClick={onChannelClick} showMatureContent={showMatureContent} />
          ))}
        </div>
      )}

      {/* ── Mature Collection (18+) ──────────────────────────────────────── */}
      {matureChannels.length > 0 && showMatureContent && (
        <div className="space-y-1">
          <div className="text-xs font-medium px-2 py-1 flex items-center gap-1.5">
            <ShieldAlert className="h-3 w-3 text-pink-400" />
            Mature Collection (18+)
            <span className="text-muted-foreground">({matureChannels.length})</span>
          </div>
          {matureChannels.map((channel) => (
            <ChannelRow key={channel.id} channel={channel} onClick={onChannelClick} showMatureContent={showMatureContent} />
          ))}
        </div>
      )}

      {/* Hidden mature notice (accounts for gambling streams shown as obscured cards) */}
      {matureChannels.length > 0 && !showMatureContent && (() => {
        const gamblingCount = matureChannels.filter(ch => isGamblingStream(ch)).length;
        const nonGamblingHidden = matureChannels.length - gamblingCount;
        return nonGamblingHidden > 0 ? (
          <div className="flex items-center gap-1.5 px-2 py-2 rounded bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 text-xs">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {nonGamblingHidden} mature result{nonGamblingHidden !== 1 ? 's' : ''} hidden — enable 18+ toggle to show
            {gamblingCount > 0 && (
              <span className="text-orange-400 ml-1">· {gamblingCount} gambling shown with warning</span>
            )}
          </div>
        ) : gamblingCount > 0 ? (
          <div className="flex items-center gap-1.5 px-2 py-2 rounded bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs">
            <Dice5 className="h-3.5 w-3.5 shrink-0" />
            {gamblingCount} gambling result{gamblingCount !== 1 ? 's' : ''} shown with warning — enable 18+ for full details
          </div>
        ) : null;
      })()}

      {/* Mature streak champions */}
      {matureStreakChampions.length > 0 && showMatureContent && (
        <div className="space-y-1">
          <div className="text-xs font-medium px-2 py-1 flex items-center gap-1.5 text-amber-400/70">
            <Trophy className="h-3.5 w-3.5" />
            18+ Streak Leaders
          </div>
          {matureStreakChampions.map((channel) => (
            <ChannelRow key={`mature-streak-${channel.id}`} channel={channel} onClick={onChannelClick} showMatureContent={showMatureContent} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Category Card ────────────────────────────────────────────────────────────

function CategoryCard({ category, showMatureContent, onClick, compact }: {
  category: CategoryItem;
  showMatureContent: boolean;
  onClick: (cat: CategoryItem) => void;
  compact?: boolean;
}) {
  const isMatureAndHidden = category.isMature && !showMatureContent;

  if (compact) {
    return (
      <button
        className={`p-1.5 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors text-left flex items-center gap-2 ${isMatureAndHidden ? 'opacity-40' : ''}`}
        onClick={() => onClick(category)}
      >
        <FallbackThumbnail src={category.bannerUrl} alt={category.name} className="w-8 h-8 rounded object-cover shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-medium truncate">{category.name}</div>
          <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
            {category.viewerCount ? (
              <span className="flex items-center gap-0.5">
                <Eye className="h-2 w-2" />
                {formatViewerCount(category.viewerCount)}
              </span>
            ) : null}
            {category.isMature && (
              <Badge variant="outline" className="text-[7px] text-pink-400 border-pink-500/30 py-0 px-0.5">18+</Badge>
            )}
          </div>
        </div>
        <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
      </button>
    );
  }

  return (
    <button
      className={`p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors text-left ${isMatureAndHidden ? 'opacity-40' : ''}`}
      onClick={() => onClick(category)}
    >
      <div className="w-full aspect-[16/9] bg-muted rounded-md mb-1.5 flex items-center justify-center overflow-hidden relative">
        <FallbackThumbnail src={category.bannerUrl} alt={category.name} className="w-full h-full object-cover" />
        {/* Mature badge overlay */}
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
            <Eye className="h-2.5 w-2.5" />
            {formatViewerCount(category.viewerCount)}
          </div>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-1">
        <span className="text-xs font-medium truncate">{category.name}</span>
        <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
      </div>
      {/* Sub-category badges */}
      {category.subCategories && category.subCategories.length > 0 && showMatureContent && (
        <div className="flex gap-1 mt-0.5 flex-wrap">
          {category.subCategories.map((sub) => (
            <Badge key={sub} variant="outline" className={`text-[8px] py-0 px-1 ${getSubCategoryColor(sub)}`}>
              {getSubCategoryIcon(sub)}
              <span className="ml-0.5">{getMatureSubCategoryLabel(sub as never)}</span>
            </Badge>
          ))}
        </div>
      )}
    </button>
  );
}

// ─── Skeleton Channel Row (loading placeholder) ─────────────────────────────

function SkeletonChannelRow() {
  return (
    <div className="w-full flex items-center gap-3 p-2 rounded-lg">
      <div className="w-10 h-10 rounded-full skeleton shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="h-3.5 w-28 rounded skeleton" />
        <div className="h-2.5 w-44 rounded skeleton" />
      </div>
      <div className="shrink-0 space-y-1.5">
        <div className="h-3 w-12 rounded skeleton" />
      </div>
    </div>
  );
}