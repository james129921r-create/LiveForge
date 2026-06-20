import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { GridLayout, StreamChannel } from '@/types';

export interface StreamSlot {
  id: string;
  channel: StreamChannel | null;
  position: number;
}

interface MultiStreamState {
  layout: GridLayout;
  slots: StreamSlot[];
  activeSlotId: string | null;
  activeChannel: StreamChannel | null;

  // ─── Focus Mode ──────────────────────────────────────────────────────────
  /** The slot that is focused (takes ~80% height, others minimized) */
  focusedSlotId: string | null;

  // ─── Layout Locking ──────────────────────────────────────────────────────
  /** When locked, prevent accidental resizing, removal, and layout changes */
  layoutLocked: boolean;

  // Actions
  setLayout: (layout: GridLayout) => void;
  addChannelToSlot: (slotId: string, channel: StreamChannel) => void;
  removeChannelFromSlot: (slotId: string) => void;
  swapSlots: (slotId1: string, slotId2: string) => void;
  setActiveSlot: (slotId: string | null) => void;
  setActiveChannel: (channel: StreamChannel | null) => void;
  clearAll: () => void;

  // Focus mode actions
  setFocusedSlot: (slotId: string | null) => void;

  // Layout locking actions
  setLayoutLocked: (locked: boolean) => void;
}

const getSlotCount = (layout: GridLayout): number => {
  switch (layout) {
    case '1x1': return 1;
    case '1+2': return 3;
    case '2+1': return 3;
    case '2x2': return 4;
    case '1+3': return 4;
    case '1+1+2': return 4;
    case '3x3': return 9;
  }
};

const createSlots = (layout: GridLayout): StreamSlot[] => {
  const count = getSlotCount(layout);
  return Array.from({ length: count }, (_, i) => ({
    id: `slot-${i}`,
    channel: null,
    position: i,
  }));
};

export const useMultiStreamStore = create<MultiStreamState>()(
  persist(
    (set, get) => ({
      layout: '1x1',
      slots: createSlots('1x1'),
      activeSlotId: 'slot-0',
      activeChannel: null,
      focusedSlotId: null,
      layoutLocked: false,

      setLayout: (layout) =>
        set((s) => {
          // Prevent layout changes when locked
          if (s.layoutLocked) return s;

          const count = getSlotCount(layout);
          const newSlots: StreamSlot[] = Array.from({ length: count }, (_, i) => ({
            id: `slot-${i}`,
            channel: i < s.slots.length ? s.slots[i].channel : null,
            position: i,
          }));
          return {
            layout,
            slots: newSlots,
            activeSlotId: s.activeSlotId && newSlots.find((ns) => ns.id === s.activeSlotId)
              ? s.activeSlotId
              : 'slot-0',
            focusedSlotId: null, // Clear focus on layout change
          };
        }),

      addChannelToSlot: (slotId, channel) =>
        set((s) => {
          if (s.layoutLocked) return s;
          return {
            slots: s.slots.map((slot) =>
              slot.id === slotId ? { ...slot, channel } : slot
            ),
            activeChannel: channel,
          };
        }),

      removeChannelFromSlot: (slotId) =>
        set((s) => {
          if (s.layoutLocked) return s;
          return {
            slots: s.slots.map((slot) =>
              slot.id === slotId ? { ...slot, channel: null } : slot
            ),
            focusedSlotId: s.focusedSlotId === slotId ? null : s.focusedSlotId,
            activeChannel: s.activeChannel?.username === s.slots.find(sl => sl.id === slotId)?.channel?.username ? null : s.activeChannel,
          };
        }),

      swapSlots: (slotId1, slotId2) =>
        set((s) => {
          if (s.layoutLocked) return s;
          const slot1 = s.slots.find((sl) => sl.id === slotId1);
          const slot2 = s.slots.find((sl) => sl.id === slotId2);
          if (!slot1 || !slot2) return s;
          return {
            slots: s.slots.map((sl) => {
              if (sl.id === slotId1) return { ...sl, channel: slot2.channel };
              if (sl.id === slotId2) return { ...sl, channel: slot1.channel };
              return sl;
            }),
          };
        }),

      setActiveSlot: (slotId) => {
        const state = get();
        const slot = state.slots.find(s => s.id === slotId);
        set({ activeSlotId: slotId, activeChannel: slot?.channel ?? state.activeChannel });
      },
      setActiveChannel: (channel) => set({ activeChannel: channel }),
      clearAll: () =>
        set({
          slots: createSlots(get().layout),
          activeSlotId: 'slot-0',
          activeChannel: null,
          focusedSlotId: null,
        }),

      // ─── Focus Mode ───────────────────────────────────────────────────────

      setFocusedSlot: (slotId) => set({ focusedSlotId: slotId }),

      // ─── Layout Locking ───────────────────────────────────────────────────

      setLayoutLocked: (locked) => set({ layoutLocked: locked }),
    }),
    {
      name: 'liveforge-streams',
      // Only persist layout, slots, and activeSlotId
      partialize: (state) => ({
        layout: state.layout,
        slots: state.slots.map(s => ({
          ...s,
          channel: s.channel ? {
            id: s.channel.id,
            username: s.channel.username,
            displayName: s.channel.displayName,
            avatarUrl: s.channel.avatarUrl,
            isLive: s.channel.isLive,
            category: s.channel.category,
            title: s.channel.title,
            viewerCount: s.channel.viewerCount,
            startedAt: s.channel.startedAt,
            hlsUrl: s.channel.hlsUrl,
            thumbnail: s.channel.thumbnail,
            followersCount: s.channel.followersCount,
            verified: s.channel.verified,
            chatroomId: s.channel.chatroomId,
            isMature: s.channel.isMature,
            matureTags: s.channel.matureTags,
            subCategories: s.channel.subCategories,
            contentSection: s.channel.contentSection,
            asmrType: s.channel.asmrType,
            bio: s.channel.bio,
            uptimeMinutes: s.channel.uptimeMinutes,
            liveStreak: s.channel.liveStreak,
          } : null,
        })),
        activeSlotId: state.activeSlotId,
        layoutLocked: state.layoutLocked,
      }),
    }
  )
);
