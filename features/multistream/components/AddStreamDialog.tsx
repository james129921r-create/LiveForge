'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { StreamChannel } from '@/types';
import { searchChannels } from '@/lib/kick-api';
import { detectMatureFromCategory } from '@/lib/mature-content';
import { useMultiStreamStore } from '@/stores/multiStreamStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Search, Loader2, Clock, Users, AlertTriangle, Dice5, Tv } from 'lucide-react';
import { FallbackAvatar } from '@/components/FallbackAvatar';

interface AddStreamDialogProps {
  slotId: string;
  onAdd: (slotId: string, channel: StreamChannel) => void;
  onClose: () => void;
}

// Format viewer count: 1.2k, 15k, 1.2M
function formatViewerCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return count.toString();
}

export function AddStreamDialog({ slotId, onAdd, onClose }: AddStreamDialogProps) {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<StreamChannel[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [suggestions, setSuggestions] = useState<StreamChannel[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMobile = useIsMobile();

  const { slots } = useMultiStreamStore();
  const { showMatureContent, setShowMatureContent } = useSettingsStore();

  // Recently added channels (channels currently in the grid)
  const recentlyAdded = slots
    .filter((s) => s.channel)
    .map((s) => s.channel!);

  // Load popular channel suggestions on mount — sequential to avoid spawning 8 curl processes simultaneously
  useEffect(() => {
    const POPULAR = ['xqc', 'shroud', 'hasanabi', 'amouranth', 'summit1g', 'lirik', 'trainwreckstv', 'nickmercs', 'pokimane', 'chelxie', 'morgpie', 'novaruu'];
    let cancelled = false;

    // Fetch channels sequentially (2 at a time) to avoid overwhelming the server with curl child processes
    async function fetchSuggestions() {
      const results: StreamChannel[] = [];

      // Process in batches of 2 to limit concurrent curl processes
      for (let i = 0; i < POPULAR.length; i += 2) {
        if (cancelled) break;
        const batch = POPULAR.slice(i, i + 2);
        const batchResults = await Promise.all(
          batch.map((slug) =>
            fetch(`/api/kick/channel/${slug}`)
              .then((r) => (r.ok ? r.json() : null))
              .catch(() => null)
          )
        );
        for (const ch of batchResults) {
          if (ch && !cancelled) results.push(ch);
        }
        // Update suggestions progressively so user sees results as they come in
        if (!cancelled) {
          setSuggestions([...results]);
        }
      }

      if (!cancelled) setLoadingSuggestions(false);
    }

    fetchSuggestions();

    return () => { cancelled = true; };
  }, []);

  // Debounced search
  const handleSearch = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!value.trim()) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    setHasSearched(true);
    setIsSearching(true);

    debounceRef.current = setTimeout(async () => {
      try {
        const result = await searchChannels(value);
        setResults(result.channels);
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  }, []);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const displayResults = query ? results : suggestions;

  // Filter by mature content — also filter out channels without a username (bad API data)
  // General ASMR is always shown regardless of 18+ toggle
  const filteredResults = displayResults.filter(ch => {
    if (!ch.username) return false;
    const isGeneralASMR = ch.asmrType === 'general';
    if (ch.isMature && !showMatureContent && !isGeneralASMR) return false;
    // Also check client-side category as a fallback
    const catCheck = detectMatureFromCategory(ch.category);
    if (catCheck.isMature && !showMatureContent && catCheck.asmrType !== 'general') return false;
    return true;
  });

  const hiddenCount = displayResults.length - filteredResults.length;

  // Currently active channels (to show which are already added)
  const activeUsernames = new Set(slots.filter(s => s.channel).map(s => s.channel!.username.toLowerCase()));

  // Content shared between Dialog and Drawer
  const dialogContent = (
    <>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search channels or categories (e.g. xqc, asmr, pool, rust)..."
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          className={`pl-9 ${isMobile ? 'h-12' : ''}`}
          autoFocus
        />
        {isSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {/* 18+ Toggle Row */}
      <div className="flex items-center justify-between mt-2 px-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Show 18+ content</span>
          {showMatureContent && (
            <Badge variant="outline" className="text-[9px] text-yellow-500 border-yellow-500/30">
              Gambling &amp; Suggestive
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground">18+</span>
          <Switch
            checked={showMatureContent}
            onCheckedChange={setShowMatureContent}
            className="scale-75"
          />
        </div>
      </div>

      {/* Mature content notice */}
      {showMatureContent && (
        <div className="flex items-center gap-1.5 mt-1 px-2 py-1 rounded bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 text-[10px]">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span>18+ mode — gambling &amp; suggestive streams visible</span>
        </div>
      )}

      {/* Recently Added */}
      {recentlyAdded.length > 0 && !query && (
        <div className="mt-3">
          <div className="text-xs text-muted-foreground px-2 py-1 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Recently Added
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 px-1">
            {recentlyAdded.map((channel) => (
              <button
                key={channel.id}
                className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors shrink-0"
                onClick={() => onAdd(slotId, channel)}
              >
                <FallbackAvatar src={channel.avatarUrl} alt={channel.displayName} size="sm" />
                <span className="text-sm font-medium whitespace-nowrap">{channel.displayName}</span>
                {channel.isLive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-1 min-h-0 mt-2">
        {!query && !loadingSuggestions && (
          <div className="text-xs text-muted-foreground px-2 py-1">Popular on Kick</div>
        )}
        {hiddenCount > 0 && (
          <div className="text-[10px] text-yellow-500 px-2 py-1">
            {hiddenCount} mature stream{hiddenCount > 1 ? 's' : ''} hidden — enable 18+ to show
          </div>
        )}
        {filteredResults.map((channel) => {
          const isAlreadyAdded = activeUsernames.has(channel.username?.toLowerCase() ?? '');
          const matureInfo = detectMatureFromCategory(channel.category);
          const isMatureFlag = channel.isMature || matureInfo.isMature;
          const matureTags = channel.matureTags || matureInfo.matureTags;

          return (
            <button
              key={channel.id}
              className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors text-left disabled:opacity-50 min-h-12"
              onClick={() => onAdd(slotId, channel)}
              disabled={!channel.isLive && !channel.hlsUrl}
            >
              <FallbackAvatar src={channel.avatarUrl} alt={channel.displayName} size="md" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm truncate">{channel.displayName}</span>
                  {channel.verified && (
                    <svg className="h-3 w-3 text-blue-400 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                  {channel.isLive ? (
                    <span className="flex items-center gap-1 text-[10px] text-red-500 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                      LIVE
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">OFFLINE</span>
                  )}
                  {isAlreadyAdded && (
                    <span className="text-[10px] text-muted-foreground bg-muted px-1 rounded">Added</span>
                  )}
                  {/* Mature badges */}
                  {isMatureFlag && showMatureContent && (
                    <>
                      {matureTags.includes('gambling') && (
                        <span className="flex items-center gap-0.5 text-[9px] text-orange-400 font-medium bg-orange-500/10 px-1 rounded">
                          <Dice5 className="h-2 w-2" />
                          Gambling
                        </span>
                      )}
                      {matureTags.includes('suggestive') && (
                        <span className="flex items-center gap-0.5 text-[9px] text-pink-400 font-medium bg-pink-500/10 px-1 rounded">
                          <AlertTriangle className="h-2 w-2" />
                          18+
                        </span>
                      )}
                    </>
                  )}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {channel.title || channel.category || `kick.com/${channel.username}`}
                </div>
                {channel.category && (
                  <div className="text-[10px] text-muted-foreground/70 mt-0.5">{channel.category}</div>
                )}
              </div>
              {channel.viewerCount ? (
                <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                  <Tv className="h-3 w-3" />
                  {formatViewerCount(channel.viewerCount)}
                </div>
              ) : null}
            </button>
          );
        })}
        {hasSearched && results.length === 0 && !isSearching && (
          <div className="text-center text-sm text-muted-foreground py-8">
            No channels found. Try a different username.
          </div>
        )}
        {(isSearching || loadingSuggestions) && displayResults.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-8">
            <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
            Searching Kick...
          </div>
        )}
      </div>
    </>
  );

  // Mobile: use Drawer (bottom sheet)
  if (isMobile) {
    return (
      <Drawer open onOpenChange={() => onClose()}>
        <DrawerContent className="max-h-[85vh] p-0 flex flex-col">
          <DrawerHeader className="px-4 pt-2 pb-2 border-b shrink-0">
            <DrawerTitle>Add Stream</DrawerTitle>
            <DrawerDescription>Search by channel name or category to add to your grid</DrawerDescription>
          </DrawerHeader>
          <div className="flex flex-col flex-1 overflow-hidden px-4 pb-4">
            {dialogContent}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  // Desktop: use Dialog
  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add Stream</DialogTitle>
          <DialogDescription>Search by channel name or category to add to your grid</DialogDescription>
        </DialogHeader>
        {dialogContent}
      </DialogContent>
    </Dialog>
  );
}
