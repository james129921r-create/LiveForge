'use client';

import { useEffect, useRef, useState } from 'react';
import Pusher from 'pusher-js';
import { useChatStore } from '@/stores/chatStore';
import { recordChatEvent } from '@/lib/telemetry';
import type { ChatMessage, Emote } from '@/types';

interface KickChatMessage {
  id: string;
  chatroom_id: number;
  content: string;
  type: string;
  created_at: string;
  sender: {
    id: number;
    username: string;
    slug: string;
    color: string;
    identity?: {
      badges?: { type: string; text: string; count?: number }[];
    };
  };
  emotes?: {
    id: string;
    emote_id: string;
    start: number;
    end: number;
  }[];
}

// Pusher config: read from env vars (set via .env) with hardcoded fallback.
// Kick rotates these keys without warning — the dynamic key fetcher below
// will attempt to auto-detect the current key when the old one stops working.
const INITIAL_PUSHER_KEY = process.env.NEXT_PUBLIC_PUSHER_KEY || '32cbd69e4b950bf97679';
const INITIAL_PUSHER_CLUSTER = process.env.NEXT_PUBLIC_PUSHER_CLUSTER || 'us2';

// ─── Dynamic Pusher Config (Strategy A) ────────────────────────────────────
// Live config that can be updated at runtime when Kick rotates keys.
// The /api/kick/chat-config endpoint scrapes Kick's frontend JS for the
// current key. If it fails, we fall back to the hardcoded/ENV values.

interface LivePusherConfig {
  key: string;
  cluster: string;
  channelPattern: string;  // "chatrooms.{id}.v2" or "channel.{id}"
  eventName: string;       // "App\Events\ChatMessageEvent" or "App\Events\ChatMessageSent"
}

const liveConfig: LivePusherConfig = {
  key: INITIAL_PUSHER_KEY,
  cluster: INITIAL_PUSHER_CLUSTER,
  channelPattern: 'chatrooms.{id}.v2',
  eventName: 'App\\Events\\ChatMessageEvent',
};

let configFetchPromise: Promise<void> | null = null;
let lastConfigFetch = 0;
const CONFIG_FETCH_INTERVAL_MS = 30 * 60 * 1000; // Re-fetch every 30 min

/**
 * Fetch the latest Pusher config from our dynamic scraper endpoint.
 * Called on first connection and when Pusher reports a 4004 (key invalid).
 * Debounced: won't fetch more often than every 5 minutes.
 */
async function refreshPusherConfig(): Promise<void> {
  if (configFetchPromise) return configFetchPromise;

  const now = Date.now();
  if (now - lastConfigFetch < 5 * 60 * 1000) return; // 5 min debounce

  configFetchPromise = (async () => {
    try {
      const res = await fetch('/api/kick/chat-config');
      if (!res.ok) return;
      const data = await res.json();
      if (data.key && data.key !== liveConfig.key) {
        console.log(`[KickChat] Pusher key rotated: ${liveConfig.key} → ${data.key}`);
        liveConfig.key = data.key;
      }
      if (data.cluster) liveConfig.cluster = data.cluster;
      if (data.channelPattern) liveConfig.channelPattern = data.channelPattern;
      if (data.eventName) liveConfig.eventName = data.eventName;
      lastConfigFetch = now;
    } catch (err) {
      console.warn('[KickChat] Failed to refresh Pusher config:', (err as Error).message);
    } finally {
      configFetchPromise = null;
    }
  })();

  return configFetchPromise;
}

/**
 * Build the Pusher channel name for a given chatroomId using the current
 * channel pattern (e.g., "chatrooms.{id}.v2" or "channel.{id}").
 */
function pusherChannelName(chatroomId: number): string {
  return liveConfig.channelPattern.replace('{id}', String(chatroomId));
}

// ─── Shared Pusher Singleton ────────────────────────────────────────────────
// All channels share a single Pusher connection. This avoids creating multiple
// WebSocket connections (one per channel), which was causing rate-limiting and
// "Connection failed - will retry" errors.

let sharedPusher: Pusher | null = null;
let pusherRefcount = 0;
const activeSubscriptions = new Map<string, unknown>(); // channelSlug → Pusher channel

/**
 * Rebuild the Pusher singleton with a fresh key.
 * Called when we detect the current key is invalid (4004 error).
 */
function rebuildPusher(): Pusher {
  // Disconnect old instance if it exists
  if (sharedPusher) {
    try { sharedPusher.disconnect(); } catch { /* ignore */ }
    sharedPusher = null;
  }

  console.log(`[KickChat] Rebuilding Pusher with key=${liveConfig.key}, cluster=${liveConfig.cluster}`);
  return getSharedPusher();
}

function getSharedPusher(): Pusher {
  if (!sharedPusher) {
    console.debug('[KickChat] Creating shared Pusher instance');

    // Proactively refresh config on first connection (non-blocking)
    refreshPusherConfig();

    sharedPusher = new Pusher(liveConfig.key, {
      cluster: liveConfig.cluster,
      forceTLS: true,
      enabledTransports: ['ws', 'wss'],
      disableStats: true,
      activityTimeout: 30000,
      pongTimeout: 15000,
      unavailableTimeout: 15000,
    });

    // Auto-reconnect on connection errors
    sharedPusher.connection.bind('error', (err: { error?: { data?: { code?: number } } }) => {
      console.debug('[KickChat] Pusher connection error:', err);
      const code = err?.error?.data?.code;

      // Code 4004 = app not found / key invalid — Kick rotated their Pusher key!
      // Trigger dynamic key refresh and rebuild the connection.
      if (code === 4004) {
        console.warn('[KickChat] Pusher key rejected (4004) — Kick may have rotated keys. Auto-healing...');
        refreshPusherConfig().then(() => {
          // If the dynamic fetch found a new key, rebuild Pusher
          if (liveConfig.key !== sharedPusher?.key) {
            rebuildPusher();
            // Re-subscribe all active channels with the new key
            const store = useChatStore.getState();
            for (const channelSlug of Object.keys(store.connectionByChannel)) {
              const chatroomId = (activeSubscriptions.get(channelSlug) as { options?: { chatroomId?: number } })?.options?.chatroomId;
              if (chatroomId) {
                // The channel will be re-subscribed by the ChatConnectionManager on next effect run
                useChatStore.getState().setConnectionStatus(channelSlug, 'connecting');
                useChatStore.getState().setChannelError(channelSlug, 'Reconnecting with updated key...');
              }
            }
          }
        });
        return;
      }

      // Other errors — Pusher-js handles reconnection automatically
      const store = useChatStore.getState();
      for (const channelSlug of Object.keys(store.connectionByChannel)) {
        if (store.connectionByChannel[channelSlug] === 'connected') {
          useChatStore.getState().setConnectionStatus(channelSlug, 'error');
          useChatStore.getState().setChannelError(channelSlug, 'Connection lost — reconnecting');
        }
      }
      recordChatEvent('error', { code });
    });

    sharedPusher.connection.bind('connected', () => {
      console.debug('[KickChat] Shared Pusher connected');
      // Update all previously error'd channels back to connected
      const store = useChatStore.getState();
      for (const channelSlug of Object.keys(store.connectionByChannel)) {
        const status = store.connectionByChannel[channelSlug];
        if (status === 'error' || status === 'connecting') {
          // Will be confirmed when subscription succeeds
        }
      }
      recordChatEvent('connect', {});
    });

    sharedPusher.connection.bind('disconnected', () => {
      console.debug('[KickChat] Shared Pusher disconnected');
      const store = useChatStore.getState();
      for (const channelSlug of Object.keys(store.connectionByChannel)) {
        if (store.connectionByChannel[channelSlug] === 'connected') {
          useChatStore.getState().setConnectionStatus(channelSlug, 'disconnected');
        }
      }
    });

    // Bind to the unavailable event to handle extended outages
    sharedPusher.connection.bind('unavailable', () => {
      console.warn('[KickChat] Pusher connection unavailable — network may be down');
      const store = useChatStore.getState();
      for (const channelSlug of Object.keys(store.connectionByChannel)) {
        if (store.connectionByChannel[channelSlug] !== 'disconnected') {
          useChatStore.getState().setConnectionStatus(channelSlug, 'error');
          useChatStore.getState().setChannelError(channelSlug, 'Network unavailable — will retry');
        }
      }
    });
  }
  return sharedPusher;
}

function retainPusher(): Pusher {
  pusherRefcount++;
  return getSharedPusher();
}

function releasePusher(): void {
  pusherRefcount = Math.max(0, pusherRefcount - 1);
  // Only tear down the shared Pusher when ALL channels are unsubscribed AND
  // no active subscriptions remain. This prevents a race where one channel
  // unsubscribes and destroys the connection while another is still using it.
  if (pusherRefcount === 0 && activeSubscriptions.size === 0 && sharedPusher) {
    console.debug('[KickChat] No more channels or subscriptions — disconnecting shared Pusher');
    try {
      sharedPusher.disconnect();
    } catch {
      // Ignore
    }
    sharedPusher = null;
  }
}

// ─── 7TV / BTTV Emote Fetchers ─────────────────────────────────────────────

async function fetch7tvEmotes(slug: string): Promise<Emote[]> {
  try {
    const res = await fetch(`/api/emotes/7tv?channel=${encodeURIComponent(slug)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data || []).map((e: { id: string; name: string; urls?: Record<string, string> }) => ({
      id: `7tv-${e.id}`,
      name: e.name,
      url: e.urls?.['2'] || e.urls?.['1'] || `https://cdn.7tv.app/emote/${e.id}/2x.webp`,
      provider: '7tv' as const,
    }));
  } catch {
    return [];
  }
}

async function fetchBttvEmotes(slug: string): Promise<Emote[]> {
  try {
    const res = await fetch(`/api/emotes/bttv?channel=${encodeURIComponent(slug)}`);
    if (!res.ok) return [];
    const data = await res.json();
    const emotes = [
      ...(data.channelEmotes || []),
      ...(data.sharedEmotes || []),
    ];
    return emotes.map((e: { id: string; code: string; imageType?: string }) => ({
      id: `bttv-${e.id}`,
      name: e.code,
      url: `https://cdn.betterttv.net/emote/${e.id}/2x${e.imageType === 'gif' ? '.gif' : '.webp'}`,
      provider: 'bttv' as const,
    }));
  } catch {
    return [];
  }
}

async function fetchRecentMessages(chatroomId: number, channelSlug: string): Promise<void> {
  try {
    const res = await fetch(`/api/kick/chatroom/${chatroomId}/messages`);
    if (!res.ok) return;
    const data = await res.json();
    const messages = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);

    const parsed = messages.slice(-50).map((msg: KickChatMessage) => {
      const kickEmotes: Emote[] = (msg.emotes || []).map((e) => ({
        id: `kick-${e.emote_id}`,
        name: msg.content.substring(e.start, e.end + 1),
        url: `https://files.kick.com/emotes/${e.emote_id}/fullsize`,
        provider: 'kick' as const,
      }));

      return {
        id: msg.id,
        username: msg.sender?.slug || msg.sender?.username || 'unknown',
        displayName: msg.sender?.username || 'Unknown',
        content: msg.content || '',
        color: msg.sender?.color || '#e5e5e5',
        badges: msg.sender?.identity?.badges?.map((b) => b.type) || [],
        emotes: kickEmotes,
        timestamp: new Date(msg.created_at).getTime(),
      } as ChatMessage;
    });

    if (parsed.length > 0) {
      const store = useChatStore.getState();
      const existingIds = new Set((store.messagesByChannel[channelSlug] || []).map(m => m.id));
      for (const msg of parsed) {
        if (!existingIds.has(msg.id)) {
          useChatStore.getState().addMessageForChannel(channelSlug, msg);
        }
      }
    }
  } catch {
    // Ignore fetch errors for recent messages
  }
}

// ─── Single-channel hook ──────────────────────────────────────────────────

export function useKickChat(chatroomId: number | null, channelSlug?: string) {
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const {
    addMessageForChannel,
    setConnectionStatus,
    setChannelError,
    setEmoteSet,
    clearChannelMessages,
  } = useChatStore();

  const channelSlugRef = useRef(channelSlug);
  const chatroomIdRef = useRef(chatroomId);
  const subscribedRef = useRef(false);

  // Keep refs in sync
  useEffect(() => {
    channelSlugRef.current = channelSlug;
  }, [channelSlug]);

  useEffect(() => {
    chatroomIdRef.current = chatroomId;
  }, [chatroomId]);

  // Subscribe to Pusher channel
  useEffect(() => {
    if (!chatroomId || !channelSlug) return;

    const channel = channelSlug;
    clearChannelMessages(channel);
    setConnectionStatus(channel, 'connecting');
    setChannelError(channel, null);
    setConnectionError(null);

    const pusher = retainPusher();
    const pChanName = pusherChannelName(chatroomId);

    console.debug('[KickChat] Subscribing to', pChanName, 'for', channel);

    const pusherChannel = pusher.subscribe(pChanName);
    activeSubscriptions.set(channel, pusherChannel);
    subscribedRef.current = true;

    // Handle incoming chat messages
    pusherChannel.bind(liveConfig.eventName, (data: { message?: KickChatMessage }) => {
      const msg = data.message;
      if (!msg || !msg.sender) return;

      // Use shared filter helper from store
      if (useChatStore.getState()._shouldFilterMessage({
        id: msg.id,
        username: msg.sender?.slug || msg.sender?.username || '',
        displayName: msg.sender?.username || '',
        content: msg.content || '',
        color: msg.sender?.color || '',
        badges: msg.sender?.identity?.badges?.map((b) => b.type) || [],
        emotes: [],
        timestamp: Date.now(),
      })) return;

      const kickEmotes: Emote[] = (msg.emotes || []).map((e) => ({
        id: `kick-${e.emote_id}`,
        name: msg.content.substring(e.start, e.end + 1),
        url: `https://files.kick.com/emotes/${e.emote_id}/fullsize`,
        provider: 'kick' as const,
      }));

      const chatMsg: ChatMessage = {
        id: msg.id,
        username: msg.sender.slug || msg.sender.username,
        displayName: msg.sender.username,
        content: msg.content,
        color: msg.sender.color || '#e5e5e5',
        badges: msg.sender.identity?.badges?.map((b) => b.type) || [],
        emotes: kickEmotes,
        timestamp: new Date(msg.created_at).getTime(),
      };

      addMessageForChannel(channel, chatMsg);
    });

    pusherChannel.bind('pusher:subscription_succeeded', () => {
      console.debug('[KickChat] Subscribed to', pChanName, 'for', channel);
      setConnectionStatus(channel, 'connected');
      setChannelError(channel, null);
      setConnectionError(null);
      recordChatEvent('connect', { chatroomId, channelSlug });

      // Fetch recent messages after subscribing
      fetchRecentMessages(chatroomId, channel);
    });

    pusherChannel.bind('pusher:subscription_error', (err: unknown) => {
      console.debug('[KickChat] Subscription error:', err);
      setConnectionStatus(channel, 'error');
      setChannelError(channel, 'Failed to join chat room');
      setConnectionError('Failed to join chat room');
      recordChatEvent('error', { chatroomId, channelSlug });
    });

    // Fetch third-party emotes for this channel
    Promise.all([
      fetch7tvEmotes(channelSlug),
      fetchBttvEmotes(channelSlug),
    ]).then(([stvEmotes, bttvEmotes]) => {
      setEmoteSet(channelSlug, [...stvEmotes, ...bttvEmotes]);
    }).catch((err) => {
      console.warn('[KickChat] Failed to load third-party emotes:', err);
    });

    return () => {
      console.debug('[KickChat] Unsubscribing from', pChanName, 'for', channel);
      try {
        // Unbind all event handlers before unsubscribing to prevent memory leaks
        pusherChannel.unbind(liveConfig.eventName);
        pusherChannel.unbind('pusher:subscription_succeeded');
        pusherChannel.unbind('pusher:subscription_error');
        pusher.unsubscribe(pChanName);
      } catch {
        // Ignore
      }
      activeSubscriptions.delete(channel);
      setConnectionStatus(channel, 'disconnected');
      setChannelError(channel, null);
      setConnectionError(null);
      subscribedRef.current = false;
      releasePusher();
    };
  }, [chatroomId, channelSlug, addMessageForChannel, setConnectionStatus, setChannelError, setEmoteSet, clearChannelMessages]);

  return { connect: () => {}, disconnect: () => {}, connectionError };
}

// ─── Multi-channel connection manager (non-hook) ──────────────────────────

interface ChannelConnection {
  chatroomId: number;
}

/**
 * Manages multiple Pusher channel subscriptions using a single shared Pusher connection.
 * Used by the ChatPanel to maintain subscriptions to all active stream chats.
 */
export class ChatConnectionManager {
  private connections: Map<string, ChannelConnection> = new Map();
  private store = useChatStore;

  connectChannel(channelSlug: string, chatroomId: number) {
    // Don't create duplicate connections
    if (this.connections.has(channelSlug)) {
      const existing = this.connections.get(channelSlug)!;
      if (existing.chatroomId === chatroomId) return;
      // Different chatroomId, disconnect old one
      this.disconnectChannel(channelSlug);
    }

    const {
      addMessageForChannel,
      setConnectionStatus,
      setChannelError,
      setEmoteSet,
    } = this.store.getState();

    setConnectionStatus(channelSlug, 'connecting');
    setChannelError(channelSlug, null);

    const pusher = retainPusher();
    const pChannelName = pusherChannelName(chatroomId);

    console.debug('[MultiChat] Subscribing to', pChannelName, 'for', channelSlug);

    try {
      const pusherChannel = pusher.subscribe(pChannelName);
      activeSubscriptions.set(channelSlug, pusherChannel);

      pusherChannel.bind(liveConfig.eventName, (data: { message?: KickChatMessage }) => {
        const msg = data.message;
        if (!msg || !msg.sender) return;

        // Use shared filter helper from store
        if (useChatStore.getState()._shouldFilterMessage({
          id: msg.id,
          username: msg.sender?.slug || msg.sender?.username || '',
          displayName: msg.sender?.username || '',
          content: msg.content || '',
          color: msg.sender?.color || '',
          badges: msg.sender?.identity?.badges?.map((b: { type: string }) => b.type) || [],
          emotes: [],
          timestamp: Date.now(),
        })) return;

        const kickEmotes: Emote[] = (msg.emotes || []).map((e) => ({
          id: `kick-${e.emote_id}`,
          name: msg.content.substring(e.start, e.end + 1),
          url: `https://files.kick.com/emotes/${e.emote_id}/fullsize`,
          provider: 'kick' as const,
        }));

        const chatMsg: ChatMessage = {
          id: msg.id,
          username: msg.sender.slug || msg.sender.username,
          displayName: msg.sender.username,
          content: msg.content,
          color: msg.sender.color || '#e5e5e5',
          badges: msg.sender.identity?.badges?.map((b) => b.type) || [],
          emotes: kickEmotes,
          timestamp: new Date(msg.created_at).getTime(),
        };

        addMessageForChannel(channelSlug, chatMsg);
      });

      pusherChannel.bind('pusher:subscription_succeeded', () => {
        console.debug('[MultiChat] Subscribed for', channelSlug);
        setConnectionStatus(channelSlug, 'connected');
        setChannelError(channelSlug, null);
        recordChatEvent('connect', { chatroomId, channelSlug });

        // Fetch recent messages
        fetchRecentMessages(chatroomId, channelSlug);
      });

      pusherChannel.bind('pusher:subscription_error', (err: unknown) => {
        console.debug('[MultiChat] Subscription error for', channelSlug, err);
        setConnectionStatus(channelSlug, 'error');
        setChannelError(channelSlug, 'Failed to join chat room');
        recordChatEvent('error', { chatroomId, channelSlug });
      });

      this.connections.set(channelSlug, { chatroomId });

      // Fetch third-party emotes
      Promise.all([
        fetch7tvEmotes(channelSlug),
        fetchBttvEmotes(channelSlug),
      ]).then(([stvEmotes, bttvEmotes]) => {
        setEmoteSet(channelSlug, [...stvEmotes, ...bttvEmotes]);
      }).catch(() => {
        // Ignore emote fetch errors
      });
    } catch (err) {
      console.debug('[MultiChat] Failed to subscribe for', channelSlug, err);
      setConnectionStatus(channelSlug, 'error');
      setChannelError(channelSlug, 'Failed to initialize chat');
      releasePusher();
    }
  }

  disconnectChannel(channelSlug: string) {
    const conn = this.connections.get(channelSlug);
    if (conn) {
      const pChanName = pusherChannelName(conn.chatroomId);
      console.debug('[MultiChat] Unsubscribing from', pChanName, 'for', channelSlug);
      try {
        if (sharedPusher) {
          // Unbind event handlers before unsubscribing to prevent memory leaks
          const channel = sharedPusher.channel(pChanName);
          if (channel) {
            channel.unbind(liveConfig.eventName);
            channel.unbind('pusher:subscription_succeeded');
            channel.unbind('pusher:subscription_error');
          }
          sharedPusher.unsubscribe(pChanName);
        }
      } catch {
        // Ignore
      }
      activeSubscriptions.delete(channelSlug);
      this.connections.delete(channelSlug);
      const { setConnectionStatus, setChannelError } = this.store.getState();
      setConnectionStatus(channelSlug, 'disconnected');
      setChannelError(channelSlug, null);
      releasePusher();
    }
  }

  disconnectAll() {
    for (const channelSlug of this.connections.keys()) {
      this.disconnectChannel(channelSlug);
    }
  }

  getConnectedChannels(): string[] {
    return Array.from(this.connections.keys());
  }
}

// ─── React hook for multi-channel chat ──────────────────────────────────

/**
 * Hook that manages chat connections for all active channels.
 * Returns a ChatConnectionManager instance and reconnects when channels change.
 */
export function useMultiChannelChat(activeChannels: Array<{ username: string; chatroomId?: number }>) {
  // Use useState with lazy initializer to avoid accessing ref during render
  const [manager] = useState(() => new ChatConnectionManager());

  useEffect(() => {
    // Determine which channels should be connected
    const desiredChannels = new Map<string, number>();
    for (const ch of activeChannels) {
      if (ch.username && ch.chatroomId) {
        desiredChannels.set(ch.username, ch.chatroomId);
      }
    }

    // Disconnect channels that are no longer active
    for (const connectedChannel of manager.getConnectedChannels()) {
      if (!desiredChannels.has(connectedChannel)) {
        manager.disconnectChannel(connectedChannel);
      }
    }

    // Connect new channels
    for (const [channelSlug, chatroomId] of desiredChannels) {
      manager.connectChannel(channelSlug, chatroomId);
    }
  }, [activeChannels, manager]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      manager.disconnectAll();
    };
  }, [manager]);

  return manager;
}
