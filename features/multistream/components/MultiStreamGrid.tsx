'use client';

import { useCallback, useState } from 'react';
import { useMultiStreamStore } from '@/stores/multiStreamStore';
import { SmartPlayer } from './SmartPlayer';
import { StreamSlot } from './StreamSlot';
import { LayoutSelector } from './LayoutSelector';
import { AddStreamDialog } from './AddStreamDialog';
import { usePlayerStore } from '@/stores/playerStore';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Plus, LayoutGrid, Link2, Search, Flame, Sparkles } from 'lucide-react';
import type { GridLayout, StreamChannel } from '@/types';

interface MultiStreamGridProps {
  onChannelSelect?: (channel: StreamChannel) => void;
  onOpenSearch?: () => void;
}

/**
 * Grid CSS classes for each layout type.
 * Asymmetric layouts use explicit grid-template-columns and grid-template-rows
 * for proper master/secondary slot sizing.
 */
const gridClasses: Record<GridLayout, string> = {
  '1x1': 'grid-cols-1',
  '1+2': 'grid-cols-1 md:[grid-template-columns:2fr_1fr] md:[grid-template-rows:1fr_1fr]',
  '2+1': 'grid-cols-1 md:[grid-template-columns:1fr_2fr] md:[grid-template-rows:1fr_1fr]',
  '2x2': 'grid-cols-1 md:grid-cols-2',
  '1+3': 'grid-cols-1 md:[grid-template-columns:2fr_1fr] md:[grid-template-rows:1fr_1fr_1fr]',
  '1+1+2': 'grid-cols-1 md:[grid-template-columns:1fr_1fr] md:[grid-template-rows:2fr_1fr]',
  '3x3': 'grid-cols-1 md:grid-cols-3',
};

/**
 * Per-slot CSS classes for asymmetric layouts.
 * These control col-span and row-span to create the master/secondary pattern.
 */
const getSlotClassName = (layout: GridLayout, index: number): string => {
  switch (layout) {
    case '1+2':
      // Slot 0: master (left, spans 2 rows), Slots 1-2: stacked on right
      if (index === 0) return 'md:row-span-2';
      return '';
    case '2+1':
      // Slot 0-1: stacked on left, Slot 2: master (right, spans 2 rows)
      if (index === 2) return 'md:row-span-2';
      return '';
    case '1+3':
      // Slot 0: master (left, spans 3 rows), Slots 1-3: stacked on right
      if (index === 0) return 'md:row-span-3';
      return '';
    case '1+1+2':
      // All slots fit naturally in the 2x2 grid with larger top row
      // No special span needed — the grid-template-rows handles sizing
      return '';
    default:
      return '';
  }
};

export function MultiStreamGrid({ onChannelSelect, onOpenSearch }: MultiStreamGridProps) {
  const { layout, slots, setLayout, addChannelToSlot, removeChannelFromSlot, activeSlotId, setActiveSlot } =
    useMultiStreamStore();
  const { streamSyncEnabled, setStreamSyncEnabled } = usePlayerStore();
  const [addDialogSlotId, setAddDialogSlotId] = useState<string | null>(null);
  const isMobile = useIsMobile();

  const handleAddChannel = useCallback(
    (slotId: string, channel: StreamChannel) => {
      addChannelToSlot(slotId, channel);
      setAddDialogSlotId(null);
      onChannelSelect?.(channel);
    },
    [addChannelToSlot, onChannelSelect]
  );

  // Find first empty slot for FAB
  const firstEmptySlot = slots.find((s) => !s.channel);
  const allEmpty = slots.every((s) => !s.channel);

  // When all slots are empty, show welcome state
  if (allEmpty) {
    return (
      <div className="flex flex-col h-full">
        <WelcomeState onOpenSearch={() => onOpenSearch?.()} />
        {addDialogSlotId && (
          <AddStreamDialog
            slotId={addDialogSlotId}
            onAdd={handleAddChannel}
            onClose={() => setAddDialogSlotId(null)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Layout Controls */}
      <div className="flex items-center justify-between">
        {isMobile ? (
          /* Mobile: compact dropdown */
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                <LayoutGrid className="h-3.5 w-3.5" />
                {layout}
                <span className="text-muted-foreground ml-1">
                  {slots.filter((s) => s.channel).length}/{slots.length}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2" align="start">
              <LayoutSelector currentLayout={layout} onLayoutChange={setLayout} />
              <div className="border-t mt-2 pt-2">
                <Button
                  variant={streamSyncEnabled ? 'default' : 'ghost'}
                  size="sm"
                  className="w-full h-8 text-xs gap-1.5"
                  onClick={() => setStreamSyncEnabled(!streamSyncEnabled)}
                >
                  <Link2 className="h-3.5 w-3.5" />
                  Stream Sync {streamSyncEnabled ? 'ON' : 'OFF'}
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        ) : (
          /* Desktop: full layout selector */
          <div className="flex items-center gap-2">
            <LayoutSelector currentLayout={layout} onLayoutChange={setLayout} />
            <Button
              variant={streamSyncEnabled ? 'default' : 'outline'}
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => setStreamSyncEnabled(!streamSyncEnabled)}
              title="Sync all streams to the same latency"
            >
              <Link2 className="h-3.5 w-3.5" />
              Sync {streamSyncEnabled ? 'ON' : ''}
            </Button>
          </div>
        )}

        {!isMobile && (
          <div className="text-sm text-muted-foreground">
            {slots.filter((s) => s.channel).length}/{slots.length} streams
          </div>
        )}
      </div>

      {/* Grid */}
      <div className={`grid ${gridClasses[layout]} ${isMobile ? 'gap-1' : 'gap-2'} flex-1 min-h-0`}>
        {slots.map((slot, index) => (
          <StreamSlot
            key={slot.id}
            slot={slot}
            isActive={slot.id === activeSlotId}
            showSyncBadge={streamSyncEnabled}
            onSelect={() => setActiveSlot(slot.id)}
            onRemove={() => removeChannelFromSlot(slot.id)}
            onAdd={() => setAddDialogSlotId(slot.id)}
            onChannelSelect={onChannelSelect}
            className={getSlotClassName(layout, index)}
          >
            {slot.channel ? (
              <SmartPlayer channel={slot.channel} />
            ) : (
              <EmptySlot onAdd={() => setAddDialogSlotId(slot.id)} />
            )}
          </StreamSlot>
        ))}
      </div>

      {/* Floating Add Stream Button (mobile FAB) */}
      {isMobile && firstEmptySlot && (
        <button
          className="fixed bottom-20 right-4 z-30 h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 active:scale-95 transition-all"
          onClick={() => setAddDialogSlotId(firstEmptySlot.id)}
          aria-label="Add Stream"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}

      {/* Add Stream Dialog */}
      {addDialogSlotId && (
        <AddStreamDialog
          slotId={addDialogSlotId}
          onAdd={handleAddChannel}
          onClose={() => setAddDialogSlotId(null)}
        />
      )}
    </div>
  );
}

const CATEGORY_SUGGESTIONS = ['ASMR', 'Pool', 'Rust', 'GTA V', 'Slots', 'Just Chatting', 'Valorant', 'IRL'];

function EmptySlot({ onAdd }: { onAdd: () => void }) {
  return (
    <div
      className="w-full h-full aspect-video rounded-lg flex items-center justify-center border-2 border-dashed border-muted-foreground/15 group relative overflow-hidden empty-slot-shimmer hover:border-muted-foreground/30 hover:bg-muted-foreground/5 transition-all duration-300"
    >
      {/* Shimmer overlay on hover */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-br from-primary/5 via-transparent to-primary/5" />

      <button
        onClick={onAdd}
        aria-label="Add stream to this slot"
        className="relative flex flex-col items-center gap-2 text-muted-foreground hover:text-foreground transition-all duration-200 p-4 group-hover:scale-105"
      >
        <svg className="w-10 h-10 plus-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        <span className="text-sm font-medium">Add Stream</span>
        <div className="flex flex-wrap justify-center gap-1 mt-1 max-w-[200px]">
          {CATEGORY_SUGGESTIONS.slice(0, 4).map((cat) => (
            <span key={cat} className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted-foreground/10 text-muted-foreground/60 group-hover:bg-muted-foreground/15 group-hover:text-muted-foreground/80 transition-colors duration-200">
              {cat}
            </span>
          ))}
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted-foreground/10 text-muted-foreground/60 group-hover:bg-muted-foreground/15 group-hover:text-muted-foreground/80 transition-colors duration-200">…</span>
        </div>
      </button>
    </div>
  );
}

interface WelcomeStateProps {
  onOpenSearch: () => void;
}

function WelcomeState({ onOpenSearch }: WelcomeStateProps) {
  return (
    <div className="flex-1 flex items-center justify-center p-6 welcome-fade-in">
      <div className="text-center max-w-md space-y-6">
        {/* Logo & Title */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg">
            <Flame className="h-8 w-8 text-primary-foreground" />
          </div>
          <h2 className="text-2xl font-bold">Welcome to LiveForge</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Watch multiple Kick.com streams at once. Add your first stream to get started.
          </p>
        </div>

        {/* Quick-start suggestions */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            onClick={onOpenSearch}
            className="flex flex-col items-center gap-2 p-4 rounded-xl bg-muted/40 hover:bg-muted/70 border border-muted-foreground/10 hover:border-muted-foreground/20 transition-all duration-200 hover:scale-[1.02]"
          >
            <Search className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium">Search</span>
            <span className="text-[10px] text-muted-foreground">Find a channel</span>
          </button>
          <button
            onClick={onOpenSearch}
            className="flex flex-col items-center gap-2 p-4 rounded-xl bg-muted/40 hover:bg-muted/70 border border-muted-foreground/10 hover:border-muted-foreground/20 transition-all duration-200 hover:scale-[1.02]"
          >
            <LayoutGrid className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium">Categories</span>
            <span className="text-[10px] text-muted-foreground">Browse by type</span>
          </button>
          <button
            onClick={onOpenSearch}
            className="flex flex-col items-center gap-2 p-4 rounded-xl bg-muted/40 hover:bg-muted/70 border border-muted-foreground/10 hover:border-muted-foreground/20 transition-all duration-200 hover:scale-[1.02]"
          >
            <Sparkles className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium">Popular</span>
            <span className="text-[10px] text-muted-foreground">Trending now</span>
          </button>
        </div>

        {/* Tip */}
        <p className="text-[10px] text-muted-foreground/60">
          Press <kbd className="kbd-key text-[9px] mx-0.5">?</kbd> for keyboard shortcuts
        </p>
      </div>
    </div>
  );
}
