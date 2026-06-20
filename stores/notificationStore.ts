import { create } from 'zustand';
import type { LiveNotification } from '@/types';

interface NotificationState {
  notifications: LiveNotification[];
  isEnabled: boolean;

  addNotification: (notification: LiveNotification) => void;
  markAsRead: (id: string) => void;
  markAllRead: () => void;
  removeNotification: (id: string) => void;
  clearAll: () => void;
  setEnabled: (enabled: boolean) => void;
  unreadCount: () => number;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  isEnabled: true,

  addNotification: (notification) =>
    set((s) => ({
      notifications: [notification, ...s.notifications].slice(0, 50),
    })),

  markAsRead: (id) =>
    set((s) => ({
      notifications: s.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      ),
    })),

  markAllRead: () =>
    set((s) => ({
      notifications: s.notifications.map((n) => ({ ...n, read: true })),
    })),

  removeNotification: (id) =>
    set((s) => ({
      notifications: s.notifications.filter((n) => n.id !== id),
    })),

  clearAll: () => set({ notifications: [] }),
  setEnabled: (enabled) => set({ isEnabled: enabled }),
  unreadCount: () => get().notifications.filter((n) => !n.read).length,
}));
