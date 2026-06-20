'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { StreamChannel } from '@/types';
import { usePlayerStore } from '@/stores/playerStore';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PopOutState {
  slotId: string;
  channelSlug: string;
  channelName: string;
  hlsUrl: string;
  volume: number;
  muted: boolean;
}

export interface BroadcastMessage {
  type: 'state-update' | 'stream-popped-out' | 'stream-brought-back' | 'window-closed';
  slotId: string;
  state?: Partial<PopOutState>;
  timestamp: number;
}

// ─── BroadcastChannel singleton ─────────────────────────────────────────────

let channelInstance: BroadcastChannel | null = null;

function getBroadcastChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined') return null;
  if (channelInstance) return channelInstance;
  try {
    channelInstance = new BroadcastChannel('liveforge-sync');
    return channelInstance;
  } catch {
    // BroadcastChannel not supported — graceful degradation
    return null;
  }
}

// ─── Popped-out slot tracking ───────────────────────────────────────────────

const poppedOutSlots = new Set<string>();

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useWindowManager() {
  const [isPopOut, setIsPopOut] = useState(false);
  const [popOutState, setPopOutState] = useState<PopOutState | null>(null);
  const [poppedSlots, setPoppedSlots] = useState<Set<string>>(new Set(poppedOutSlots));
  const listenersRef = useRef<((state: PopOutState) => void)[]>([]);
  const popOutWindowsRef = useRef<Map<string, Window>>(new Map());

  // Detect if we're in a pop-out window on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const popoutSlotId = params.get('popout');

    if (popoutSlotId) {
      setIsPopOut(true);
      const state: PopOutState = {
        slotId: popoutSlotId,
        channelSlug: params.get('channel') || '',
        channelName: params.get('name') || params.get('channel') || '',
        hlsUrl: params.get('hls') || '',
        volume: parseFloat(params.get('volume') || '0.75'),
        muted: params.get('muted') === 'true',
      };
      setPopOutState(state);

      // Notify parent window that pop-out is alive
      const bc = getBroadcastChannel();
      if (bc) {
        bc.postMessage({
          type: 'stream-popped-out',
          slotId: popoutSlotId,
          state,
          timestamp: Date.now(),
        } satisfies BroadcastMessage);
      }

      // Notify parent when this window closes
      const handleBeforeUnload = () => {
        if (bc) {
          bc.postMessage({
            type: 'window-closed',
            slotId: popoutSlotId,
            timestamp: Date.now(),
          } satisfies BroadcastMessage);
        }
      };
      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => {
        window.removeEventListener('beforeunload', handleBeforeUnload);
      };
    }
  }, []);

  // Listen for broadcast messages
  useEffect(() => {
    const bc = getBroadcastChannel();
    if (!bc) return;

    const handler = (event: MessageEvent) => {
      const msg = event.data as BroadcastMessage;
      if (!msg?.type || !msg?.slotId) return;

      switch (msg.type) {
        case 'stream-popped-out':
          poppedOutSlots.add(msg.slotId);
          setPoppedSlots(new Set(poppedOutSlots));
          break;
        case 'stream-brought-back':
        case 'window-closed':
          poppedOutSlots.delete(msg.slotId);
          setPoppedSlots(new Set(poppedOutSlots));
          break;
        case 'state-update':
          if (msg.state) {
            listenersRef.current.forEach((cb) => {
              cb({ slotId: msg.slotId, channelSlug: '', channelName: '', hlsUrl: '', volume: 0.75, muted: false, ...msg.state });
            });
          }
          break;
      }
    };

    bc.addEventListener('message', handler);
    return () => bc.removeEventListener('message', handler);
  }, []);

  // Pop out a stream into a new window
  const popOutStream = useCallback((slotId: string, channel?: StreamChannel | null) => {
    const playerState = usePlayerStore.getState();
    const volume = playerState.volume;
    const isMuted = playerState.isMuted;
    const channelSlug = channel?.username || '';
    const channelName = channel?.displayName || '';
    const hlsUrl = channel?.hlsUrl || '';

    const params = new URLSearchParams({
      popout: slotId,
      channel: channelSlug,
      name: channelName,
      hls: hlsUrl,
      volume: String(volume),
      muted: String(isMuted),
    });

    const url = `${window.location.origin}?${params.toString()}`;

    // Open new window
    const newWindow = window.open(
      url,
      `liveforge-popout-${slotId}`,
      'width=960,height=600,menubar=no,toolbar=no,location=no,status=no'
    );

    if (newWindow) {
      popOutWindowsRef.current.set(slotId, newWindow);
      poppedOutSlots.add(slotId);
      setPoppedSlots(new Set(poppedOutSlots));

      // Detect when pop-out window closes
      const checkClosed = setInterval(() => {
        if (newWindow.closed) {
          clearInterval(checkClosed);
          poppedOutSlots.delete(slotId);
          setPoppedSlots(new Set(poppedOutSlots));
          popOutWindowsRef.current.delete(slotId);

          // Broadcast that the window closed
          const bc = getBroadcastChannel();
          if (bc) {
            bc.postMessage({
              type: 'window-closed',
              slotId,
              timestamp: Date.now(),
            } satisfies BroadcastMessage);
          }
        }
      }, 1000);
    }
  }, []);

  // Bring back a popped-out stream
  const bringBackStream = useCallback((slotId: string) => {
    const popOutWindow = popOutWindowsRef.current.get(slotId);
    if (popOutWindow && !popOutWindow.closed) {
      popOutWindow.close();
    }
    popOutWindowsRef.current.delete(slotId);
    poppedOutSlots.delete(slotId);
    setPoppedSlots(new Set(poppedOutSlots));

    // Broadcast that stream was brought back
    const bc = getBroadcastChannel();
    if (bc) {
      bc.postMessage({
        type: 'stream-brought-back',
        slotId,
        timestamp: Date.now(),
      } satisfies BroadcastMessage);
    }
  }, []);

  // Get the pop-out state from URL (for pop-out windows)
  const getPopOutState = useCallback((): PopOutState | null => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const popoutSlotId = params.get('popout');
    if (!popoutSlotId) return null;

    return {
      slotId: popoutSlotId,
      channelSlug: params.get('channel') || '',
      channelName: params.get('name') || '',
      hlsUrl: params.get('hls') || '',
      volume: parseFloat(params.get('volume') || '0.75'),
      muted: params.get('muted') === 'true',
    };
  }, []);

  // Broadcast state changes to other windows
  const broadcastState = useCallback((slotId: string, state: Partial<PopOutState>) => {
    const bc = getBroadcastChannel();
    if (!bc) return;

    bc.postMessage({
      type: 'state-update',
      slotId,
      state,
      timestamp: Date.now(),
    } satisfies BroadcastMessage);
  }, []);

  // Listen for state changes from other windows
  const onStateChange = useCallback((callback: (state: PopOutState) => void) => {
    listenersRef.current.push(callback);
    return () => {
      listenersRef.current = listenersRef.current.filter((cb) => cb !== callback);
    };
  }, []);

  // Check if a slot is popped out
  const isSlotPoppedOut = useCallback((slotId: string): boolean => {
    return poppedOutSlots.has(slotId);
  }, []);

  return {
    isPopOut,
    popOutState,
    poppedSlots,
    popOutStream,
    bringBackStream,
    getPopOutState,
    broadcastState,
    onStateChange,
    isSlotPoppedOut,
  };
}
