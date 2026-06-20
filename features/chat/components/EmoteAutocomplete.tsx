'use client';

import { useState, useCallback, useRef, useEffect, useMemo, useImperativeHandle, forwardRef } from 'react';
import { useChatStore } from '@/stores/chatStore';
import type { Emote } from '@/types';

interface EmoteAutocompleteProps {
  /** Current input value */
  value: string;
  /** Called when the value changes (e.g. after emote insertion) */
  onValueChange: (value: string) => void;
  /** The channel to get emotes for */
  channelName: string;
  children: React.ReactNode;
}

export interface EmoteAutocompleteHandle {
  /** Handle a keyboard event. Returns true if the event was consumed. */
  handleKeyDown: (e: React.KeyboardEvent) => boolean;
  /** Whether the popover is currently open */
  isOpen: boolean;
}

export const EmoteAutocomplete = forwardRef<EmoteAutocompleteHandle, EmoteAutocompleteProps>(
  function EmoteAutocomplete({ value, onValueChange, channelName, children }, ref) {
    const { emoteSets } = useChatStore();
    const [isOpen, setIsOpen] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const popoverRef = useRef<HTMLDivElement>(null);

    // Get all available emotes (channel-specific + global)
    const allEmotes = useMemo(() => {
      const channelEmotes = emoteSets[channelName] || [];
      // Also include emotes from other channels as fallback
      const otherEmotes = Object.entries(emoteSets)
        .filter(([key]) => key !== channelName)
        .flatMap(([, emotes]) => emotes);
      const combined = [...channelEmotes, ...otherEmotes];
      return Array.from(new Map(combined.map(e => [e.name, e])).values());
    }, [emoteSets, channelName]);

    // Determine the current search query from the input value
    const emoteSearch = useMemo(() => {
      const lastColonIndex = value.lastIndexOf(':');
      if (lastColonIndex === -1) return null;
      const afterColon = value.slice(lastColonIndex + 1);
      // If there's a space after the colon context, it's not an emote search
      if (afterColon.includes(' ')) return null;
      return afterColon;
    }, [value]);

    // Filter emotes based on search
    const filteredEmotes = useMemo(() => {
      if (emoteSearch === null) return [];
      if (emoteSearch === '') return allEmotes.slice(0, 8);
      return allEmotes
        .filter(e => e.name.toLowerCase().includes(emoteSearch.toLowerCase()))
        .slice(0, 8);
    }, [emoteSearch, allEmotes]);

    // Update open state based on search
    useEffect(() => {
      const shouldOpen = emoteSearch !== null && filteredEmotes.length > 0;
      if (shouldOpen !== isOpen) {
        setIsOpen(shouldOpen);
      }
    }, [emoteSearch, filteredEmotes.length, isOpen]);

    // Reset selected index when filtered list changes
    useEffect(() => {
      setSelectedIndex(0);
    }, [filteredEmotes.length]);

    const selectEmote = useCallback((emote: Emote) => {
      const lastColonIndex = value.lastIndexOf(':');
      if (lastColonIndex !== -1) {
        const newValue = value.slice(0, lastColonIndex) + emote.name + ' ';
        onValueChange(newValue);
        setIsOpen(false);
      }
    }, [value, onValueChange]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent): boolean => {
      if (!isOpen || filteredEmotes.length === 0) return false;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, filteredEmotes.length - 1));
        return true;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        return true;
      } else if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        if (filteredEmotes[selectedIndex]) {
          selectEmote(filteredEmotes[selectedIndex]);
        }
        return true;
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setIsOpen(false);
        return true;
      }
      return false;
    }, [isOpen, filteredEmotes, selectedIndex, selectEmote]);

    // Expose handleKeyDown via ref
    useImperativeHandle(ref, () => ({
      handleKeyDown,
      isOpen,
    }), [handleKeyDown, isOpen]);

    // Scroll selected item into view
    useEffect(() => {
      if (!isOpen || !popoverRef.current) return;
      const selectedEl = popoverRef.current.querySelector(`[data-emote-index="${selectedIndex}"]`);
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: 'nearest' });
      }
    }, [selectedIndex, isOpen]);

    return (
      <div className="relative">
        {children}
        {/* Emote Autocomplete Popover */}
        {isOpen && filteredEmotes.length > 0 && (
          <div
            ref={popoverRef}
            className="absolute bottom-full left-0 right-0 mb-1 bg-popover border rounded-lg shadow-lg overflow-hidden z-50"
          >
            <div className="text-[10px] text-muted-foreground px-2 py-1 border-b bg-muted/30">
              {emoteSearch
                ? `Emotes matching :${emoteSearch} — Tab to select`
                : 'Type to search emotes — Tab to select'
              }
            </div>
            <div className="max-h-40 overflow-y-auto">
              {filteredEmotes.map((emote, i) => (
                <button
                  key={emote.id}
                  data-emote-index={i}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 text-sm text-left hover:bg-muted/50 transition-colors ${
                    i === selectedIndex ? 'bg-muted/50' : ''
                  }`}
                  onClick={() => selectEmote(emote)}
                  onMouseEnter={() => setSelectedIndex(i)}
                >
                  <img
                    src={emote.url}
                    alt={emote.name}
                    className="h-5 w-5 object-contain shrink-0"
                    onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                  />
                  <span className="text-xs font-mono truncate">{emote.name}</span>
                  <span className="text-[10px] text-muted-foreground ml-auto shrink-0">{emote.provider}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }
);
