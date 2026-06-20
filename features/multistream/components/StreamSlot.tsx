'use client';

import { useState, useEffect, useCallback } from 'react';
import type { StreamSlot as StreamSlotType } from '@/stores/multiStreamStore';
import { useMultiStreamStore } from '@/stores/multiStreamStore';
import { fetchRecommendations } from '@/lib/kick-api';
import { isGamblingStream, shouldObscureThumbnail } from '@/lib/mature-content-enforcer';
import { X, Link2, AlertTriangle, Dice5, Sparkles, Tv, ChevronRight, Maximize2, Lock, ExternalLink, ArrowDownToLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';
import { useSettingsStore } from '@/stores/settingsStore';
import { useWindowManager } from '@/hooks/useWindowManager';
import { FallbackAvatar } from '@/components/FallbackAvatar';
import type { StreamChannel } from '@/types';

function formatViewerCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return count.toString();
}

interface StreamSlotProps {
  slot: StreamSlotType;
  isActive: boolean;
  showSyncBadge?: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onAdd: () => void;
  className?: string;
  children: React.ReactNode;
  onChannelSelect?: (channel: StreamChannel) => void;
}

export function StreamSlot({
  slot,
  isActive,
  showSyncBadge = false,
  onSelect,
  onRemove,
  onAdd,
  className,
  children,
  onChannelSelect,
}: StreamSlotProps) {
  const isMobile = useIsMobile();
  const { addChannelToSlot, activeSlotId, focusedSlotId, setFocusedSlot, layoutLocked } = useMultiStreamStore();
  const { showMatureContent } = useSettingsStore();
  const { isSlotPoppedOut, bringBackStream } = useWindowManager();

  // More Like This state
  const [showMoreLikeThis, setShowMoreLikeThis] = useState(false);
  const [similarStreams, setSimilarStreams] = useState<StreamChannel[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);

  const isFocused = focusedSlotId === slot.id;
  const isPoppedOut = isSlotPoppedOut(slot.id);

  // Load similar streams when the user clicks "More Like This"
  const loadSimilar = useCallback(async () => {
    if (!slot.channel?.username) return;
    setShowMoreLikeThis(true);
    setSimilarLoading(true);

    try {
      const result = await fetchRecommendations({ channel: slot.channel.username, limit: 6 });
      setSimilarStreams(result.channels.filter(ch =>
        ch.username.toLowerCase() !== slot.channel!.username.toLowerCase()
      ));
    } catch {
      setSimilarStreams([]);
    } finally {
      setSimilarLoading(false);
    }
  }, [slot.channel?.username]);

  // Close more like this when slot is deactivated
  useEffect(() => {
    if (!isActive) setShowMoreLikeThis(false);
  }, [isActive]);

  const handleSimilarClick = useCallback((channel: StreamChannel) => {
    if (channel.isMature && !showMatureContent) {
      useSettingsStore.getState().setShowMatureContent(true);
    }
    const targetSlotId = activeSlotId || slot.id;
    addChannelToSlot(targetSlotId, channel);
    onChannelSelect?.(channel);
    setShowMoreLikeThis(false);
  }, [activeSlotId, addChannelToSlot, onChannelSelect, showMatureContent, slot.id]);

  // Double-click to focus/unfocus
  const handleDoubleClick = useCallback(() => {
    if (focusedSlotId === slot.id) {
      setFocusedSlot(null);
    } else {
      setFocusedSlot(slot.id);
    }
  }, [focusedSlotId, setFocusedSlot, slot.id]);

  // Escape to unfocus
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && focusedSlotId === slot.id) {
        setFocusedSlot(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusedSlotId, setFocusedSlot, slot.id]);

  return (
    <div className="relative">
      <div
        className={`relative rounded-lg overflow-hidden cursor-pointer stream-slot-active ${className ?? ''} ${
          isActive
            ? 'ring-2 ring-primary scale-[1.01] stream-slot-active-glow'
            : 'hover:ring-1 hover:ring-muted-foreground/30'
        } ${isFocused ? 'ring-2 ring-yellow-500' : ''}`}
        onClick={onSelect}
        onDoubleClick={handleDoubleClick}
        title="Double-click to focus · Escape to unfocus"
      >
        {children}

        {/* Remove button */}
        {slot.channel && !layoutLocked && (
          <Button
            variant="ghost"
            size="icon"
            className={`absolute top-1 right-1 h-6 w-6 text-white hover:bg-red-500/80 transition-opacity z-10 ${
              isMobile
                ? 'bg-black/50 opacity-100'
                : 'bg-black/50 opacity-0 hover:opacity-100 focus:opacity-100'
            }`}
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
          >
            <X className="h-3 w-3" />
          </Button>
        )}

        {/* Layout Locked indicator */}
        {layoutLocked && slot.channel && (
          <div className="absolute top-1 right-1 z-10 flex items-center gap-0.5 bg-black/70 px-1 py-0.5 rounded text-[9px] text-white/80">
            <Lock className="h-2.5 w-2.5" />
            LOCKED
          </div>
        )}

        {/* Focus indicator */}
        {isFocused && (
          <div className="absolute top-1 left-1 z-10 flex items-center gap-0.5 bg-yellow-500/80 px-1 py-0.5 rounded text-[9px] text-black font-medium">
            <Maximize2 className="h-2.5 w-2.5" />
            FOCUSED
          </div>
        )}

        {/* Sync Badge */}
        {showSyncBadge && slot.channel && (
          <div className="absolute top-1 left-1 z-10 flex items-center gap-0.5 bg-black/70 px-1 py-0.5 rounded text-[9px] text-white/80">
            <Link2 className="h-2.5 w-2.5" />
            SYNC
          </div>
        )}

        {/* Mature Content Badge */}
        {slot.channel?.isMature && (
          <div className="absolute top-1 left-1 z-10 flex items-center gap-0.5 bg-yellow-500/80 px-1 py-0.5 rounded text-[9px] text-black font-medium">
            {slot.channel.matureTags?.includes('gambling') || isGamblingStream(slot.channel) ? (
              <><Dice5 className="h-2.5 w-2.5" /> GAMBLING</>
            ) : (
              <><AlertTriangle className="h-2.5 w-2.5" /> 18+</>
            )}
          </div>
        )}

        {/* Gambling blurred overlay when mature content is hidden */}
        {slot.channel && shouldObscureThumbnail(slot.channel, showMatureContent) && (
          <div className="absolute inset-0 z-10 bg-black/60 backdrop-blur-sm flex items-center justify-center rounded-lg">
            <div className="flex flex-col items-center gap-1 text-center px-2">
              <Dice5 className="h-6 w-6 text-orange-400" />
              <span className="text-xs text-orange-300 font-semibold">Gambling Content</span>
              <span className="text-[9px] text-orange-300/70">Click to enable 18+ and view</span>
            </div>
          </div>
        )}

        {/* Popped Out indicator overlay */}
        {isPoppedOut && slot.channel && (
          <div className="absolute inset-0 z-10 bg-black/70 backdrop-blur-sm flex items-center justify-center rounded-lg">
            <div className="flex flex-col items-center gap-2 text-center px-3">
              <ExternalLink className="h-6 w-6 text-primary" />
              <span className="text-sm text-white font-semibold">Popped Out</span>
              <span className="text-[10px] text-white/50">{slot.channel.displayName} is in a separate window</span>
              <button
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary hover:bg-primary/90 text-primary-foreground rounded-md transition-colors mt-1"
                onClick={(e) => {
                  e.stopPropagation();
                  bringBackStream(slot.id);
                }}
              >
                <ArrowDownToLine className="h-3 w-3" />
                Bring Back
              </button>
            </div>
          </div>
        )}

        {/* Active slot focus indicator (primary color glow border) */}
        {isActive && slot.channel && (
          <div className="absolute inset-0 rounded-lg pointer-events-none ring-1 ring-primary/30 transition-opacity duration-300" />
        )}

        {/* More Like This button (bottom overlay) */}
        {slot.channel && isActive && !showMoreLikeThis && (
          <button
            className="absolute bottom-1 right-1 z-10 flex items-center gap-1 bg-primary/80 hover:bg-primary px-2 py-1 rounded text-[10px] text-primary-foreground font-medium transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              loadSimilar();
            }}
          >
            <Sparkles className="h-3 w-3" />
            More Like This
          </button>
        )}
      </div>

      {/* More Like This dropdown */}
      {showMoreLikeThis && slot.channel && (
        <div className="absolute bottom-full left-0 right-0 z-20 mb-1 rounded-lg bg-card border shadow-xl max-h-64 overflow-y-auto">
          <div className="sticky top-0 bg-card p-2 border-b flex items-center justify-between">
            <span className="text-xs font-medium flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-primary/70" />
              More Like {slot.channel.displayName}
            </span>
            <button
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setShowMoreLikeThis(false)}
            >
              Close
            </button>
          </div>

          {similarLoading ? (
            <div className="flex items-center justify-center py-6 gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="text-xs text-muted-foreground">Finding similar streams...</span>
            </div>
          ) : similarStreams.length === 0 ? (
            <div className="py-4 text-center text-xs text-muted-foreground">
              No similar streams found
            </div>
          ) : (
            <div className="p-1">
              {similarStreams.map((ch) => {
                const isMature = ch.isMature || (ch.contentSection === 'mature');
                if (isMature && !showMatureContent) return null;

                return (
                  <button
                    key={ch.id}
                    className="w-full flex items-center gap-2 p-2 rounded hover:bg-muted transition-colors text-left"
                    onClick={() => handleSimilarClick(ch)}
                  >
                    <FallbackAvatar src={ch.avatarUrl} alt={ch.displayName} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium truncate">{ch.displayName}</span>
                        {ch.isLive && (
                          <span className="flex items-center gap-0.5 text-[9px] text-red-500 font-medium">
                            <span className="w-1 h-1 rounded-full bg-red-500 animate-pulse" />
                            LIVE
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {ch.category || ch.title || 'Streaming'}
                      </div>
                    </div>
                    {ch.viewerCount ? (
                      <div className="flex items-center gap-0.5 text-[10px] text-muted-foreground shrink-0">
                        <Tv className="h-2.5 w-2.5" />
                        {formatViewerCount(ch.viewerCount)}
                      </div>
                    ) : null}
                    <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
