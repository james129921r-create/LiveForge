'use client';

import { useNotificationStore } from '@/stores/notificationStore';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bell, BellOff, Check, Trash2, X } from 'lucide-react';

export function NotificationPanel() {
  const { notifications, isEnabled, markAsRead, markAllRead, removeNotification, clearAll, setEnabled } =
    useNotificationStore();
  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4" />
          <span className="text-sm font-medium">Notifications</span>
          {unreadCount > 0 && (
            <Badge variant="destructive" className="text-[10px] h-4 px-1">
              {unreadCount}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={markAllRead}
          >
            <Check className="h-3 w-3 mr-1" />
            Mark all read
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setEnabled(!isEnabled)}
          >
            {isEnabled ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8">
            <Bell className="h-12 w-12 mb-4 opacity-30" />
            <p className="text-sm">No notifications yet</p>
            <p className="text-xs mt-1">You&apos;ll see alerts when followed channels go live</p>
          </div>
        ) : (
          <div className="divide-y">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={`p-3 flex items-start gap-3 hover:bg-muted/50 transition-colors ${
                  !notification.read ? 'bg-primary/5' : ''
                }`}
              >
                <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${notification.read ? 'bg-transparent' : 'bg-red-500'}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{notification.channelName} is live!</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{notification.message}</div>
                  <div className="text-[10px] text-muted-foreground/70 mt-1">
                    {new Date(notification.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  {!notification.read && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => markAsRead(notification.id)}
                    >
                      <Check className="h-3 w-3" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => removeNotification(notification.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {notifications.length > 0 && (
        <div className="p-2 border-t">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs text-muted-foreground"
            onClick={clearAll}
          >
            <Trash2 className="h-3 w-3 mr-1" />
            Clear All
          </Button>
        </div>
      )}
    </div>
  );
}
