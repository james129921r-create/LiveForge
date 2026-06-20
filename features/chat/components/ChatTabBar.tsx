'use client';

import { useChatStore, type ConnectionStatus as ConnectionStatusType } from '@/stores/chatStore';
import { useMultiStreamStore } from '@/stores/multiStreamStore';
import { ConnectionStatus } from './ConnectionStatus';
import { Badge } from '@/components/ui/badge';

export function ChatTabBar() {
  const { slots } = useMultiStreamStore();
  const { setActiveSlot, setActiveChannel } = useMultiStreamStore();
  const { unreadCounts, connectionByChannel, activeChatChannel, setActiveChatChannel } = useChatStore();

  // Get channels that have an active stream
  const activeChannels = slots.filter((slot) => slot.channel !== null);

  if (activeChannels.length <= 1) return null;

  const handleTabClick = (channelSlug: string, slotId: string) => {
    setActiveChatChannel(channelSlug);
    setActiveSlot(slotId);
    // Also update the active channel in multiStreamStore
    const slot = slots.find((s) => s.id === slotId);
    if (slot?.channel) {
      setActiveChannel(slot.channel);
    }

  };

  return (
    <div className="flex items-center border-b bg-muted/20 overflow-x-auto scrollbar-none">
      {activeChannels.map((slot) => {
        const slug = slot.channel!.username;
        const isActive = activeChatChannel === slug;
        const unread = unreadCounts[slug] || 0;
        const connStatus: ConnectionStatusType = connectionByChannel[slug] || 'disconnected';

        return (
          <button
            key={slot.id}
            onClick={() => handleTabClick(slug, slot.id)}
            className={`
              relative flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
              border-b-2 transition-colors shrink-0 whitespace-nowrap
              ${isActive
                ? 'border-primary text-foreground bg-background'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30'
              }
            `}
          >
            {/* Connection status dot */}
            <span className="flex items-center">
              <ConnectionStatus status={connStatus} size="sm" />
            </span>

            {/* Channel name */}
            <span className="max-w-[80px] truncate">{slot.channel!.displayName || slug}</span>

            {/* Unread indicator */}
            {unread > 0 && !isActive && (
              <span className="flex items-center">
                {unread > 10 ? (
                  <Badge
                    variant="destructive"
                    className="h-4 min-w-[1rem] px-1 text-[9px] leading-none flex items-center justify-center"
                  >
                    {unread > 99 ? '99+' : unread}
                  </Badge>
                ) : (
                  <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                )}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
