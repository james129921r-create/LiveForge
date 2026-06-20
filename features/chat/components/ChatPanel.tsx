'use client';

import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { useChatStore, useActiveMessages, useActiveConnectionStatus } from '@/stores/chatStore';
import { useMultiStreamStore } from '@/stores/multiStreamStore';
import { useMultiChannelChat } from '../hooks/useKickChat';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { ChatFilterPanel } from './ChatFilterPanel';
import { ChatTabBar } from './ChatTabBar';
import { ConnectionStatus } from './ConnectionStatus';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Filter, MessageSquare, ChevronDown, Minimize2, Maximize2, Clock, RefreshCw, Eye, BellRing, Layers, AtSign, Inbox, X } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

interface ChatPanelProps {
  /** @deprecated Channel name is now derived from multiStreamStore */
  channelName?: string;
  /** @deprecated ChatroomId is now derived from multiStreamStore */
  chatroomId?: number | null;
}

export function ChatPanel(_props?: ChatPanelProps) {
  const visibleMessages = useActiveMessages();
  const { status: connectionStatus, error: connectionError } = useActiveConnectionStatus();
  const {
    autoScroll, setAutoScroll, activeChatChannel, setActiveChatChannel,
    unifiedChatEnabled, setUnifiedChatEnabled,
    alertFireCount, clearAlertFireCount,
    getUnifiedMessages,
    unifiedChannelFilter, setUnifiedChannelFilter,
    unifiedMentionsOnly, setUnifiedMentionsOnly,
    unifiedUnreadOnly, setUnifiedUnreadOnly,
    unreadCounts, channelColors,
  } = useChatStore();
  const totalMessages = useChatStore((s) => s.messages);
  const maxDomNodes = useChatStore((s) => s.maxDomNodes);
  const { slots, activeChannel } = useMultiStreamStore();

  // Calculate hidden message count for virtualization indicator
  const hiddenCount = useMemo(() => {
    return Math.max(0, totalMessages.length - maxDomNodes);
  }, [totalMessages.length, maxDomNodes]);

  // Get all active channels with chatroom IDs for multi-channel chat
  const activeChannels = useMemo(
    () =>
      slots
        .filter((s) => s.channel && s.channel.chatroomId)
        .map((s) => ({
          username: s.channel!.username,
          chatroomId: s.channel!.chatroomId!,
        })),
    [slots]
  );

  // Initialize multi-channel chat connections
  const chatManager = useMultiChannelChat(activeChannels);

  // Sync activeChatChannel with activeChannel from multiStreamStore
  useEffect(() => {
    if (activeChannel?.username && activeChannel.username !== activeChatChannel) {
      setActiveChatChannel(activeChannel.username);
    }
  }, [activeChannel?.username, activeChatChannel, setActiveChatChannel]);

  // Set activeChatChannel on first channel load
  useEffect(() => {
    if (!activeChatChannel && activeChannels.length > 0) {
      setActiveChatChannel(activeChannels[0].username);
    }
  }, [activeChatChannel, activeChannels, setActiveChatChannel]);

  const [showFilters, setShowFilters] = useState(false);
  const [compactMode, setCompactMode] = useState(false);
  const [slowMode] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  // Get unified messages when enabled
  // NOTE: We add totalMessageCount as a dependency so new messages trigger recompute.
  // getUnifiedMessages alone is a stable store method reference and won't change.
  const totalMessageCount = useChatStore((s) => Object.values(s.channelMessages || {}).reduce((sum, msgs) => sum + (msgs?.length || 0), 0));
  const unifiedMessages = useMemo(() => {
    if (!unifiedChatEnabled) return [];
    return getUnifiedMessages();
  }, [unifiedChatEnabled, getUnifiedMessages, totalMessageCount]);

  // Auto-scroll when new messages arrive
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [visibleMessages.length, unifiedMessages.length, autoScroll]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    if (isAtBottom !== autoScroll) {
      setAutoScroll(isAtBottom);
    }
  }, [autoScroll, setAutoScroll]);

  const handleRetry = useCallback(() => {
    if (activeChatChannel) {
      const channel = activeChannels.find((c) => c.username === activeChatChannel);
      if (channel) {
        chatManager.disconnectChannel(activeChatChannel);
        chatManager.connectChannel(activeChatChannel, channel.chatroomId);
      }
    }
  }, [activeChatChannel, activeChannels, chatManager]);

  // Channel filter chip toggle
  const toggleChannelFilter = useCallback((channel: string) => {
    if (!unifiedChannelFilter) {
      // Currently showing all — switch to only this channel
      setUnifiedChannelFilter([channel]);
    } else if (unifiedChannelFilter.includes(channel)) {
      if (unifiedChannelFilter.length === 1) {
        // Only one channel selected, deselect it = show all
        setUnifiedChannelFilter(null);
      } else {
        setUnifiedChannelFilter(unifiedChannelFilter.filter((c) => c !== channel));
      }
    } else {
      setUnifiedChannelFilter([...unifiedChannelFilter, channel]);
    }
  }, [unifiedChannelFilter, setUnifiedChannelFilter]);

  // Determine the display state
  const hasChannel = !!activeChatChannel;
  const isConnected = connectionStatus === 'connected';
  const showConnecting = hasChannel && connectionStatus === 'connecting';
  const showError = hasChannel && connectionStatus === 'error';
  const showNoChatroom = activeChannels.length === 0 && slots.some((s) => s.channel && !s.channel.chatroomId);
  const showWaiting = hasChannel && isConnected && visibleMessages.length === 0 && !unifiedChatEnabled;

  return (
    <div className="flex flex-col h-full bg-card border rounded-lg overflow-hidden">
      {/* Chat Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <MessageSquare className="h-4 w-4 shrink-0" />
          <span className="text-sm font-medium shrink-0">Chat</span>
          {activeChatChannel && !unifiedChatEnabled && (
            <div className="flex items-center gap-1.5">
              <ConnectionStatus status={connectionStatus} size="sm" />
              <Badge variant="outline" className="text-xs truncate max-w-[120px]">
                kick.com/{activeChatChannel}
              </Badge>
            </div>
          )}
          {unifiedChatEnabled && (
            <Badge variant="outline" className="text-xs gap-1">
              <Layers className="h-2.5 w-2.5" />
              Unified · {activeChannels.length} channels
            </Badge>
          )}
          {/* Slow Mode Indicator */}
          {slowMode && (
            <Badge variant="outline" className="text-[10px] text-yellow-500 border-yellow-500/30 flex items-center gap-1 shrink-0">
              <Clock className="h-2.5 w-2.5" />
              Slow
            </Badge>
          )}
          {/* Alert indicator */}
          {alertFireCount > 0 && (
            <Badge
              variant="destructive"
              className="text-[9px] gap-1 cursor-pointer animate-pulse"
              onClick={clearAlertFireCount}
            >
              <BellRing className="h-2.5 w-2.5" />
              {alertFireCount}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {/* Tabbed/Unified toggle button group */}
          {activeChannels.length > 1 && (
            <div className="flex items-center border rounded-md overflow-hidden">
              <Button
                variant={unifiedChatEnabled ? 'default' : 'ghost'}
                size="icon"
                className="h-6 w-6 rounded-none"
                onClick={() => setUnifiedChatEnabled(true)}
                title="Unified chat (merge all channels)"
              >
                <Layers className="h-3 w-3" />
              </Button>
              <Button
                variant={!unifiedChatEnabled ? 'default' : 'ghost'}
                size="icon"
                className="h-6 w-6 rounded-none"
                onClick={() => setUnifiedChatEnabled(false)}
                title="Tabbed chat (one channel at a time)"
              >
                <MessageSquare className="h-3 w-3" />
              </Button>
            </div>
          )}
          {/* Compact Mode Toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setCompactMode(!compactMode)}
            title={compactMode ? 'Normal mode' : 'Compact mode'}
          >
            {compactMode ? <Maximize2 className="h-3.5 w-3.5" /> : <Minimize2 className="h-3.5 w-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Channel Tabs (hidden in unified mode) */}
      {!unifiedChatEnabled && <ChatTabBar />}

      {/* Unified chat filter bar */}
      {unifiedChatEnabled && activeChannels.length > 1 && (
        <div className="border-b bg-muted/20 px-2 py-1.5 space-y-1.5 shrink-0">
          {/* Channel filter chips */}
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
            {activeChannels.map((ch) => {
              const color = channelColors[ch.username] || '#888888';
              const isFiltered = unifiedChannelFilter?.includes(ch.username) ?? false;
              const isAll = !unifiedChannelFilter;
              const unread = unreadCounts[ch.username] || 0;

              return (
                <button
                  key={ch.username}
                  onClick={() => toggleChannelFilter(ch.username)}
                  className={`
                    flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium
                    border transition-colors shrink-0
                    ${isFiltered || isAll
                      ? 'border-primary/30 bg-primary/10'
                      : 'border-border/50 bg-muted/30 opacity-60 hover:opacity-100'
                    }
                  `}
                  style={{ borderColor: isFiltered || isAll ? color : undefined }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span className="max-w-[60px] truncate">{ch.username}</span>
                  {unread > 0 && (
                    <span className="text-[8px] font-bold text-primary">
                      {unread > 99 ? '99+' : unread}
                    </span>
                  )}
                </button>
              );
            })}
            {unifiedChannelFilter && (
              <button
                onClick={() => setUnifiedChannelFilter(null)}
                className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] text-muted-foreground hover:text-foreground border border-border/50 shrink-0"
              >
                <X className="h-2.5 w-2.5" />
                Clear
              </button>
            )}
          </div>
          {/* Filter buttons */}
          <div className="flex items-center gap-1">
            <Button
              variant={unifiedMentionsOnly ? 'secondary' : 'ghost'}
              size="sm"
              className="h-5 px-2 text-[9px] gap-0.5"
              onClick={() => setUnifiedMentionsOnly(!unifiedMentionsOnly)}
              title="Show mentions only"
            >
              <AtSign className="h-2.5 w-2.5" />
              Mentions
            </Button>
            <Button
              variant={unifiedUnreadOnly ? 'secondary' : 'ghost'}
              size="sm"
              className="h-5 px-2 text-[9px] gap-0.5"
              onClick={() => setUnifiedUnreadOnly(!unifiedUnreadOnly)}
              title="Show unread channels only"
            >
              <Inbox className="h-2.5 w-2.5" />
              Unread
            </Button>
          </div>
        </div>
      )}

      {/* Filter Panel */}
      {showFilters && <ChatFilterPanel />}

      {/* Messages */}
      <div
        ref={scrollRef}
        className={`flex-1 overflow-y-auto p-2 space-y-0.5 chat-scroll ${isMobile ? 'leading-relaxed' : ''}`}
        onScroll={handleScroll}
      >
        {!hasChannel && !unifiedChatEnabled ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            <div className="text-center px-4">
              <MessageSquare className="h-8 w-8 mx-auto mb-3 opacity-30" />
              <p className="font-medium mb-1">No Channel Selected</p>
              <p className="text-xs">Search for a Kick channel and add it to start watching and chatting</p>
            </div>
          </div>
        ) : showNoChatroom ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            <div className="text-center px-4">
              <ConnectionStatus status="disconnected" size="md" />
              <p className="font-medium mb-1 mt-2">Chat Unavailable</p>
              <p className="text-xs">Could not load chatroom for this channel.</p>
            </div>
          </div>
        ) : showError ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            <div className="text-center px-4">
              <ConnectionStatus status="error" size="md" />
              <p className="font-medium mb-1 mt-2 text-red-500">Connection Error</p>
              <p className="text-xs mb-3">{connectionError}</p>
              <Button
                variant="outline"
                size="sm"
                className="text-xs gap-1.5"
                onClick={handleRetry}
              >
                <RefreshCw className="h-3 w-3" />
                Retry Connection
              </Button>
            </div>
          </div>
        ) : showConnecting ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            <div className="text-center">
              <div className="animate-spin w-5 h-5 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2" />
              <p>Connecting to chat...</p>
              <p className="text-xs mt-1 text-muted-foreground/60">Joining kick.com/{activeChatChannel}</p>
            </div>
          </div>
        ) : showWaiting ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            <div className="text-center">
              <ConnectionStatus status="connected" size="md" />
              <p className="mt-2">Connected — waiting for messages</p>
              <p className="text-xs mt-1 text-muted-foreground/60">Chat messages will appear here in real-time</p>
            </div>
          </div>
        ) : unifiedChatEnabled ? (
          <>
            {/* Unified chat mode — messages from all channels with color coding */}
            {unifiedMessages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                <div className="text-center">
                  <Layers className="h-8 w-8 mx-auto mb-3 opacity-30" />
                  <p className="font-medium mb-1">Unified Chat</p>
                  <p className="text-xs">Messages from all channels will appear here</p>
                </div>
              </div>
            ) : (
              <>
                {hiddenCount > 0 && (
                  <div className="flex items-center justify-center gap-1 py-1 px-2 text-[10px] text-muted-foreground/60">
                    <Eye className="h-3 w-3" />
                    {hiddenCount} older messages hidden
                  </div>
                )}
                {unifiedMessages.map((msg) => (
                  <div
                    key={`${msg.channelSlug}-${msg.id}`}
                    className={`text-sm leading-relaxed group hover:bg-muted/30 rounded transition-colors ${
                      compactMode ? 'px-1 py-px' : 'px-1 py-0.5'
                    }`}
                    style={{ borderLeft: `2px solid ${msg.channelColor}` }}
                  >
                    <span
                      className="inline-flex items-center gap-0.5 px-1.5 py-0 rounded-sm text-[9px] font-bold mr-1"
                      style={{
                        backgroundColor: `${msg.channelColor}20`,
                        color: msg.channelColor,
                      }}
                    >
                      {msg.channelSlug}
                    </span>
                    <span className="font-semibold ml-0.5" style={{ color: msg.color }}>
                      {msg.displayName}
                    </span>
                    <span className="text-muted-foreground mx-1">:</span>
                    <span className="text-foreground/90">{msg.content}</span>
                  </div>
                ))}
              </>
            )}
          </>
        ) : (
          <>
            {/* Virtualization indicator */}
            {hiddenCount > 0 && (
              <div className="flex items-center justify-center gap-1 py-1 px-2 text-[10px] text-muted-foreground/60">
                <Eye className="h-3 w-3" />
                {hiddenCount} older message{hiddenCount !== 1 ? 's' : ''} hidden (virtualized)
              </div>
            )}
            {visibleMessages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} compact={compactMode} />
            ))}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Scroll-to-bottom */}
      {!autoScroll && (visibleMessages.length > 0 || unifiedMessages.length > 0) && (
        <div className="relative">
          <Button
            variant="secondary"
            size="sm"
            className="absolute -top-10 left-1/2 -translate-x-1/2 shadow-lg text-xs"
            onClick={() => {
              setAutoScroll(true);
              bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
            }}
          >
            <ChevronDown className="h-3 w-3 mr-1" />
            Latest
          </Button>
        </div>
      )}

      {/* Chat Input */}
      {activeChatChannel && !unifiedChatEnabled && <ChatInput channelName={activeChatChannel} />}
    </div>
  );
}
