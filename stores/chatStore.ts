import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ChatMessage, ChatFilter, Emote } from '@/types';

// Maximum messages kept in the store per channel (complete history for scroll-back)
const MAX_STORE_MESSAGES = 500;
// Maximum DOM nodes rendered at any time (virtualization window)
const MAX_DOM_NODES = 150;

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error';

// ─── Color palette for channel color coding (8+ distinct colors) ─────────────

const CHANNEL_COLOR_PALETTE = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#06b6d4', // cyan
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#6366f1', // indigo
  '#14b8a6', // teal
  '#f43f5e', // rose
];

// ─── Alert Types ────────────────────────────────────────────────────────────

export interface KeywordAlert {
  id: string;
  keyword: string;
  enabled: boolean;
  caseSensitive: boolean;
}

export interface MentionAlert {
  id: string;
  username: string;
  enabled: boolean;
}

interface ChatState {
  /** Messages for the currently active channel */
  messages: ChatMessage[];
  /** Whether the active channel's chat is connected */
  isConnected: boolean;
  /** Chat filters */
  filters: ChatFilter[];
  /** Emote sets per channel */
  emoteSets: Record<string, Emote[]>;
  /** Whether auto-scroll is enabled */
  autoScroll: boolean;
  /** Max messages to keep in the store */
  maxMessages: number;
  /** Max DOM nodes to render (virtualization) */
  maxDomNodes: number;

  // ─── Multi-channel support ───────────────────────────────────────────────
  /** The currently active chat channel (username/slug) */
  activeChatChannel: string | null;
  /** Per-channel message history */
  messagesByChannel: Record<string, ChatMessage[]>;
  /** Per-channel connection status */
  connectionByChannel: Record<string, ConnectionStatus>;
  /** Per-channel connection errors */
  errorsByChannel: Record<string, string | null>;
  /** Per-channel unread message counts */
  unreadCounts: Record<string, number>;

  // ─── Unified Chat ────────────────────────────────────────────────────────
  /** Whether unified chat mode is enabled (merge all channels into one feed) */
  unifiedChatEnabled: boolean;
  /** Channel color assignments for visual coding */
  channelColors: Record<string, string>;
  /** Color assignment index counter */
  _nextColorIndex: number;
  /** Channel filter for unified mode — null means all channels, array means only those channels */
  unifiedChannelFilter: string[] | null;
  /** Show only messages that mention the user */
  unifiedMentionsOnly: boolean;
  /** Show only messages from channels with unread messages */
  unifiedUnreadOnly: boolean;

  // ─── Alerts ──────────────────────────────────────────────────────────────
  /** Keyword alerts — notify when specific keywords appear */
  keywordAlerts: KeywordAlert[];
  /** Mention tracking — notify when specific usernames are mentioned */
  mentionAlerts: MentionAlert[];
  /** Alert fire count (for badge display) */
  alertFireCount: number;
  /** Last alert timestamp (for visual indicator) */
  lastAlertTimestamp: number | null;

  // ─── Global Blocking ─────────────────────────────────────────────────────
  /** Usernames to hide across all channels */
  globallyBlockedUsers: string[];

  // ─── Actions ─────────────────────────────────────────────────────────────
  addMessage: (message: ChatMessage) => void;
  addMessageForChannel: (channel: string, message: ChatMessage) => void;
  setConnected: (connected: boolean) => void;
  setConnectionStatus: (channel: string, status: ConnectionStatus) => void;
  setChannelError: (channel: string, error: string | null) => void;
  addFilter: (filter: ChatFilter) => void;
  removeFilter: (filterId: string) => void;
  toggleFilter: (filterId: string) => void;
  setEmoteSet: (channelId: string, emotes: Emote[]) => void;
  setAutoScroll: (auto: boolean) => void;
  clearMessages: () => void;
  setActiveChatChannel: (channel: string | null) => void;
  clearChannelMessages: (channel: string) => void;
  clearAllChannelMessages: () => void;
  removeChannel: (channel: string) => void;
  clearUnread: (channel: string) => void;

  /** Get the virtualized slice of messages for rendering (last maxDomNodes) */
  getVisibleMessages: () => ChatMessage[];
  /** Get the count of hidden (unrendered) messages at the top */
  getHiddenCount: () => number;

  // ─── Unified Chat Actions ────────────────────────────────────────────────
  setUnifiedChatEnabled: (enabled: boolean) => void;
  setChannelColor: (channel: string, color: string) => void;
  /** Auto-assign a color for a channel */
  assignChannelColor: (channel: string) => void;
  /** Get unified messages from all channels with color coding */
  getUnifiedMessages: () => Array<ChatMessage & { channelSlug: string; channelColor: string }>;
  /** Set channel filter for unified mode */
  setUnifiedChannelFilter: (channels: string[] | null) => void;
  /** Toggle mentions-only filter in unified mode */
  setUnifiedMentionsOnly: (enabled: boolean) => void;
  /** Toggle unread-only filter in unified mode */
  setUnifiedUnreadOnly: (enabled: boolean) => void;

  // ─── Alert Actions ───────────────────────────────────────────────────────
  addKeywordAlert: (keyword: string, caseSensitive?: boolean) => void;
  removeKeywordAlert: (id: string) => void;
  toggleKeywordAlert: (id: string) => void;
  addMentionAlert: (username: string) => void;
  removeMentionAlert: (id: string) => void;
  toggleMentionAlert: (id: string) => void;
  clearAlertFireCount: () => void;

  // ─── Global Blocking Actions ─────────────────────────────────────────────
  addGloballyBlockedUser: (username: string) => void;
  removeGloballyBlockedUser: (username: string) => void;
}

const DEFAULT_FILTERS: ChatFilter[] = [
  { id: 'filter-bot', type: 'word', value: 'bot', enabled: false },
];

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
  messages: [],
  isConnected: false,
  filters: DEFAULT_FILTERS,
  emoteSets: {},
  autoScroll: true,
  maxMessages: MAX_STORE_MESSAGES,
  maxDomNodes: MAX_DOM_NODES,

  // Multi-channel state
  activeChatChannel: null,
  messagesByChannel: {},
  connectionByChannel: {},
  errorsByChannel: {},
  unreadCounts: {},

  // Unified chat state
  unifiedChatEnabled: false,
  channelColors: {},
  _nextColorIndex: 0,
  unifiedChannelFilter: null,
  unifiedMentionsOnly: false,
  unifiedUnreadOnly: false,

  // Alerts state
  keywordAlerts: [],
  mentionAlerts: [],
  alertFireCount: 0,
  lastAlertTimestamp: null,

  // Global blocking
  globallyBlockedUsers: [],

  // ─── Helper: check if a message should be filtered ──────────────────────
  _shouldFilterMessage: (message: ChatMessage): boolean => {
    const state = get();

    // Check global blocked users
    if (state.globallyBlockedUsers.some(
      (u) => u.toLowerCase() === message.username.toLowerCase()
    )) {
      return true;
    }

    // Check regular filters
    const passesFilter = state.filters
      .filter((f) => f.enabled)
      .every((filter) => {
        if (filter.type === 'word') {
          return !message.content.toLowerCase().includes(filter.value.toLowerCase());
        }
        if (filter.type === 'user') {
          return message.username.toLowerCase() !== filter.value.toLowerCase();
        }
        if (filter.type === 'regex') {
          try {
            return !new RegExp(filter.value, 'i').test(message.content);
          } catch {
            return true;
          }
        }
        return true;
      });

    return !passesFilter;
  },

  // ─── Helper: check alerts for a message ─────────────────────────────────
  _checkAlerts: (message: ChatMessage, _channel: string) => {
    const state = get();
    let fired = false;

    // Check keyword alerts
    for (const alert of state.keywordAlerts) {
      if (!alert.enabled) continue;
      const content = alert.caseSensitive ? message.content : message.content.toLowerCase();
      const keyword = alert.caseSensitive ? alert.keyword : alert.keyword.toLowerCase();
      if (content.includes(keyword)) {
        fired = true;
        break;
      }
    }

    // Check mention alerts
    if (!fired) {
      for (const alert of state.mentionAlerts) {
        if (!alert.enabled) continue;
        if (message.username.toLowerCase() === alert.username.toLowerCase()) {
          fired = true;
          break;
        }
        // Also check if username is mentioned in content
        if (message.content.toLowerCase().includes(`@${alert.username.toLowerCase()}`)) {
          fired = true;
          break;
        }
      }
    }

    if (fired) {
      set({
        alertFireCount: state.alertFireCount + 1,
        lastAlertTimestamp: Date.now(),
      });
    }
  },

  addMessage: (message) =>
    set((s) => {
      // Use shared filter helper
      if (get()._shouldFilterMessage(message)) return s;

      // Check alerts
      const activeChannel = s.activeChatChannel;
      if (activeChannel) {
        // Check keyword and mention alerts
        let alertFired = false;
        for (const alert of s.keywordAlerts) {
          if (!alert.enabled) continue;
          const content = alert.caseSensitive ? message.content : message.content.toLowerCase();
          const keyword = alert.caseSensitive ? alert.keyword : alert.keyword.toLowerCase();
          if (content.includes(keyword)) {
            alertFired = true;
            break;
          }
        }
        if (!alertFired) {
          for (const alert of s.mentionAlerts) {
            if (!alert.enabled) continue;
            if (message.username.toLowerCase() === alert.username.toLowerCase() ||
                message.content.toLowerCase().includes(`@${alert.username.toLowerCase()}`)) {
              alertFired = true;
              break;
            }
          }
        }
      }

      // Keep up to maxMessages in the store for scroll-back, but DOM only
      // renders the last maxDomNodes via getVisibleMessages()
      const messages = [...s.messages, message].slice(-s.maxMessages);

      // Also add to per-channel messages if we know the active channel
      let messagesByChannel = s.messagesByChannel;
      if (activeChannel) {
        const channelMsgs = [...(s.messagesByChannel[activeChannel] || []), message].slice(-s.maxMessages);
        messagesByChannel = { ...s.messagesByChannel, [activeChannel]: channelMsgs };
      }

      // Auto-assign color for channel if not already assigned
      let channelColors = s.channelColors;
      let nextIndex = s._nextColorIndex;
      if (activeChannel && !channelColors[activeChannel]) {
        channelColors = {
          ...channelColors,
          [activeChannel]: CHANNEL_COLOR_PALETTE[nextIndex % CHANNEL_COLOR_PALETTE.length],
        };
        nextIndex++;
      }

      return {
        messages,
        messagesByChannel,
        channelColors,
        _nextColorIndex: nextIndex,
        ...(alertFired ? {
          alertFireCount: s.alertFireCount + 1,
          lastAlertTimestamp: Date.now(),
        } : {}),
      };
    }),

  addMessageForChannel: (channel, message) =>
    set((s) => {
      // Use shared filter helper
      if (get()._shouldFilterMessage(message)) return s;

      // Check alerts for this channel
      let alertFired = false;
      for (const alert of s.keywordAlerts) {
        if (!alert.enabled) continue;
        const content = alert.caseSensitive ? message.content : message.content.toLowerCase();
        const keyword = alert.caseSensitive ? alert.keyword : alert.keyword.toLowerCase();
        if (content.includes(keyword)) {
          alertFired = true;
          break;
        }
      }
      if (!alertFired) {
        for (const alert of s.mentionAlerts) {
          if (!alert.enabled) continue;
          if (message.username.toLowerCase() === alert.username.toLowerCase() ||
              message.content.toLowerCase().includes(`@${alert.username.toLowerCase()}`)) {
            alertFired = true;
            break;
          }
        }
      }

      // Add to per-channel messages
      const channelMsgs = [...(s.messagesByChannel[channel] || []), message].slice(-s.maxMessages);
      const messagesByChannel = { ...s.messagesByChannel, [channel]: channelMsgs };

      // If this is the active channel, also update the main messages array
      const isActive = channel === s.activeChatChannel;
      const messages = isActive
        ? [...s.messages, message].slice(-s.maxMessages)
        : s.messages;

      // Update unread count if not the active channel
      const unreadCounts = isActive
        ? s.unreadCounts
        : { ...s.unreadCounts, [channel]: (s.unreadCounts[channel] || 0) + 1 };

      // Auto-assign color for this channel if not already assigned
      let channelColors = s.channelColors;
      let nextIndex = s._nextColorIndex;
      if (!channelColors[channel]) {
        channelColors = {
          ...channelColors,
          [channel]: CHANNEL_COLOR_PALETTE[nextIndex % CHANNEL_COLOR_PALETTE.length],
        };
        nextIndex++;
      }

      return {
        messagesByChannel,
        messages,
        unreadCounts,
        channelColors,
        _nextColorIndex: nextIndex,
        ...(alertFired ? {
          alertFireCount: s.alertFireCount + 1,
          lastAlertTimestamp: Date.now(),
        } : {}),
      };
    }),

  setConnected: (connected) => set({ isConnected: connected }),

  setConnectionStatus: (channel, status) =>
    set((s) => ({
      connectionByChannel: { ...s.connectionByChannel, [channel]: status },
      // Also update the legacy isConnected for the active channel
      isConnected: channel === s.activeChatChannel ? status === 'connected' : s.isConnected,
    })),

  setChannelError: (channel, error) =>
    set((s) => ({
      errorsByChannel: {
        ...s.errorsByChannel,
        [channel]: error,
      },
    })),

  addFilter: (filter) => set((s) => ({ filters: [...s.filters, filter] })),
  removeFilter: (filterId) =>
    set((s) => ({ filters: s.filters.filter((f) => f.id !== filterId) })),
  toggleFilter: (filterId) =>
    set((s) => ({
      filters: s.filters.map((f) =>
        f.id === filterId ? { ...f, enabled: !f.enabled } : f
      ),
    })),
  setEmoteSet: (channelId, emotes) =>
    set((s) => ({ emoteSets: { ...s.emoteSets, [channelId]: emotes } })),
  setAutoScroll: (auto) => set({ autoScroll: auto }),
  clearMessages: () => set({ messages: [] }),

  clearChannelMessages: (channel) =>
    set((s) => ({
      messagesByChannel: { ...s.messagesByChannel, [channel]: [] },
      messages: channel === s.activeChatChannel ? [] : s.messages,
    })),

  clearAllChannelMessages: () =>
    set((s) => {
      const cleared: Record<string, ChatMessage[]> = {};
      for (const ch of Object.keys(s.messagesByChannel)) {
        cleared[ch] = [];
      }
      return { messagesByChannel: cleared, messages: [] };
    }),

  removeChannel: (channel) =>
    set((s) => {
      const { [channel]: _msgs, ...restMessages } = s.messagesByChannel;
      const { [channel]: _conn, ...restConnections } = s.connectionByChannel;
      const { [channel]: _errs, ...restErrors } = s.errorsByChannel;
      const { [channel]: _unread, ...restUnread } = s.unreadCounts;
      return {
        messagesByChannel: restMessages,
        connectionByChannel: restConnections,
        errorsByChannel: restErrors,
        unreadCounts: restUnread,
        activeChatChannel: s.activeChatChannel === channel ? null : s.activeChatChannel,
        messages: s.activeChatChannel === channel ? [] : s.messages,
        isConnected: s.activeChatChannel === channel ? false : s.isConnected,
      };
    }),

  clearUnread: (channel) =>
    set((s) => ({
      unreadCounts: { ...s.unreadCounts, [channel]: 0 },
    })),

  setActiveChatChannel: (channel) =>
    set((s) => {
      if (channel === s.activeChatChannel) return s;

      // Switch the main messages array to the new channel's messages
      const messages = channel
        ? (s.messagesByChannel[channel] || [])
        : [];

      // Clear unread count for the new active channel
      const unreadCounts = channel
        ? { ...s.unreadCounts, [channel]: 0 }
        : s.unreadCounts;

      // Update isConnected based on the new channel's connection status
      const isConnected = channel
        ? s.connectionByChannel[channel] === 'connected'
        : false;

      return {
        activeChatChannel: channel,
        messages,
        unreadCounts,
        isConnected,
      };
    }),

  getVisibleMessages: () => {
    const { messages, maxDomNodes } = get();
    // Only render the last N messages to keep DOM node count low
    return messages.slice(-maxDomNodes);
  },

  getHiddenCount: () => {
    const { messages, maxDomNodes } = get();
    return Math.max(0, messages.length - maxDomNodes);
  },

  // ─── Unified Chat Actions ─────────────────────────────────────────────────

  setUnifiedChatEnabled: (enabled) => set({ unifiedChatEnabled: enabled }),

  setChannelColor: (channel, color) =>
    set((s) => ({
      channelColors: { ...s.channelColors, [channel]: color },
    })),

  assignChannelColor: (channel) =>
    set((s) => {
      if (s.channelColors[channel]) return s; // Already assigned
      const color = CHANNEL_COLOR_PALETTE[s._nextColorIndex % CHANNEL_COLOR_PALETTE.length];
      return {
        channelColors: { ...s.channelColors, [channel]: color },
        _nextColorIndex: s._nextColorIndex + 1,
      };
    }),

  getUnifiedMessages: () => {
    const { messagesByChannel, channelColors, globallyBlockedUsers, maxDomNodes, unifiedChannelFilter, unifiedMentionsOnly, unifiedUnreadOnly, unreadCounts } = get();
    const allMessages: Array<ChatMessage & { channelSlug: string; channelColor: string }> = [];

    for (const [channel, msgs] of Object.entries(messagesByChannel)) {
      // Apply channel filter
      if (unifiedChannelFilter && !unifiedChannelFilter.includes(channel)) continue;

      // Apply unread-only filter
      if (unifiedUnreadOnly && !(unreadCounts[channel] > 0)) continue;

      const color = channelColors[channel] || '#888888';
      for (const msg of msgs) {
        // Skip globally blocked users
        if (globallyBlockedUsers.some(
          (u) => u.toLowerCase() === msg.username.toLowerCase()
        )) continue;

        // Apply mentions-only filter
        if (unifiedMentionsOnly) {
          // Check if the message mentions any tracked username
          const mentionAlerts = get().mentionAlerts;
          const isMention = mentionAlerts.some(
            (alert) => msg.content.toLowerCase().includes(`@${alert.username.toLowerCase()}`)
          );
          if (!isMention) continue;
        }

        allMessages.push({ ...msg, channelSlug: channel, channelColor: color });
      }
    }

    // Sort by timestamp and return last maxDomNodes
    allMessages.sort((a, b) => a.timestamp - b.timestamp);
    return allMessages.slice(-maxDomNodes);
  },

  // ─── Alert Actions ────────────────────────────────────────────────────────

  addKeywordAlert: (keyword, caseSensitive = false) =>
    set((s) => ({
      keywordAlerts: [
        ...s.keywordAlerts,
        {
          id: `ka-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          keyword,
          enabled: true,
          caseSensitive,
        },
      ],
    })),

  removeKeywordAlert: (id) =>
    set((s) => ({
      keywordAlerts: s.keywordAlerts.filter((a) => a.id !== id),
    })),

  toggleKeywordAlert: (id) =>
    set((s) => ({
      keywordAlerts: s.keywordAlerts.map((a) =>
        a.id === id ? { ...a, enabled: !a.enabled } : a
      ),
    })),

  addMentionAlert: (username) =>
    set((s) => ({
      mentionAlerts: [
        ...s.mentionAlerts,
        {
          id: `ma-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          username,
          enabled: true,
        },
      ],
    })),

  removeMentionAlert: (id) =>
    set((s) => ({
      mentionAlerts: s.mentionAlerts.filter((a) => a.id !== id),
    })),

  toggleMentionAlert: (id) =>
    set((s) => ({
      mentionAlerts: s.mentionAlerts.map((a) =>
        a.id === id ? { ...a, enabled: !a.enabled } : a
      ),
    })),

  clearAlertFireCount: () => set({ alertFireCount: 0 }),

  // ─── Unified Chat Filter Actions ─────────────────────────────────────────

  setUnifiedChannelFilter: (channels) => set({ unifiedChannelFilter: channels }),
  setUnifiedMentionsOnly: (enabled) => set({ unifiedMentionsOnly: enabled }),
  setUnifiedUnreadOnly: (enabled) => set({ unifiedUnreadOnly: enabled }),

  // ─── Global Blocking Actions ──────────────────────────────────────────────

  addGloballyBlockedUser: (username) =>
    set((s) => {
      if (s.globallyBlockedUsers.some((u) => u.toLowerCase() === username.toLowerCase())) {
        return s;
      }
      return { globallyBlockedUsers: [...s.globallyBlockedUsers, username] };
    }),

  removeGloballyBlockedUser: (username) =>
    set((s) => ({
      globallyBlockedUsers: s.globallyBlockedUsers.filter(
        (u) => u.toLowerCase() !== username.toLowerCase()
      ),
    })),
}),
{
  name: 'liveforge-chat',
  // Only persist user preferences — not runtime messages or connection state
  partialize: (state) => ({
    filters: state.filters,
    keywordAlerts: state.keywordAlerts,
    mentionAlerts: state.mentionAlerts,
    globallyBlockedUsers: state.globallyBlockedUsers,
    unifiedChatEnabled: state.unifiedChatEnabled,
    channelColors: state.channelColors,
    unifiedChannelFilter: state.unifiedChannelFilter,
    unifiedMentionsOnly: state.unifiedMentionsOnly,
    unifiedUnreadOnly: state.unifiedUnreadOnly,
  }),
}
  )
);

// ─── Selector hooks ────────────────────────────────────────────────────────

/** Get virtualized messages for the active channel */
export function useActiveMessages(): ChatMessage[] {
  const messages = useChatStore((s) => s.messages);
  const maxDomNodes = useChatStore((s) => s.maxDomNodes);
  // Use useMemo to avoid creating a new array reference on every render
  // when messages and maxDomNodes haven't changed
  return useMemo(() => messages.slice(-maxDomNodes), [messages, maxDomNodes]);
}

/** Get connection status for the active channel */
export function useActiveConnectionStatus(): { status: ConnectionStatus; error: string | null } {
  const activeChatChannel = useChatStore((s) => s.activeChatChannel);
  const connectionByChannel = useChatStore((s) => s.connectionByChannel);
  const errorsByChannel = useChatStore((s) => s.errorsByChannel);
  const isConnected = useChatStore((s) => s.isConnected);

  if (!activeChatChannel) {
    return { status: 'disconnected', error: null };
  }

  const status = connectionByChannel[activeChatChannel] ||
    (isConnected ? 'connected' : 'disconnected');
  const error = errorsByChannel[activeChatChannel] || null;

  return { status, error };
}
