import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { GridLayout } from '@/types';
// ─── Types ──────────────────────────────────────────────────────────────────

export interface StreamGroup {
  id: string;
  name: string;
  color: string;
  channelSlugs: string[];
  icon?: string;
  createdAt: number;
  updatedAt: number;
}

export interface WorkspaceSlot {
  position: number;
  channelSlug: string | null;
}

export interface AudioSettings {
  perStreamVolume: Record<string, number>;
  perStreamMuted: Record<string, boolean>;
  audioPrioritySlot: string | null;
}

export interface ChatState {
  activeChatChannel: string | null;
  unifiedChatEnabled: boolean;
}

export interface SyncMode {
  enabled: boolean;
  maxLatencyDiff: number;
}

export interface WorkspaceLayout {
  id: string;
  name: string;
  folderId: string | null;
  layout: GridLayout;
  slots: WorkspaceSlot[];
  createdAt: number;
  updatedAt: number;
  lastLoadedAt: number | null;
  audioSettings: AudioSettings;
  chatState: ChatState;
  syncMode: SyncMode;
}

export interface WorkspaceFolder {
  id: string;
  name: string;
  parentFolderId: string | null;
  createdAt: number;
}

// ─── State Interface ────────────────────────────────────────────────────────

interface WorkspaceState {
  groups: StreamGroup[];
  workspaces: WorkspaceLayout[];
  folders: WorkspaceFolder[];

  // ─── Group Actions ──────────────────────────────────────────────────────
  addGroup: (name: string, color: string, channelSlugs?: string[]) => void;
  removeGroup: (id: string) => void;
  updateGroup: (id: string, updates: Partial<Pick<StreamGroup, 'name' | 'color' | 'icon'>>) => void;
  addChannelToGroup: (groupId: string, channelSlug: string) => void;
  removeChannelFromGroup: (groupId: string, channelSlug: string) => void;

  // ─── Workspace Actions ──────────────────────────────────────────────────
  saveWorkspace: (
    name: string,
    layout: GridLayout,
    slots: WorkspaceSlot[],
    folderId?: string | null,
    audioSettings?: AudioSettings,
    chatState?: ChatState,
    syncMode?: SyncMode,
  ) => void;
  loadWorkspace: (id: string) => {
    layout: GridLayout;
    slots: WorkspaceSlot[];
    audioSettings: AudioSettings;
    chatState: ChatState;
    syncMode: SyncMode;
  } | null;
  removeWorkspace: (id: string) => void;
  updateWorkspace: (id: string, updates: Partial<Pick<WorkspaceLayout, 'name' | 'folderId' | 'layout' | 'slots' | 'audioSettings' | 'chatState' | 'syncMode'>>) => void;
  duplicateWorkspace: (id: string) => void;
  updateWorkspaceLastLoaded: (id: string) => void;

  // ─── Folder Actions ─────────────────────────────────────────────────────
  addFolder: (name: string, parentFolderId?: string | null) => void;
  removeFolder: (id: string) => void;
  updateFolder: (id: string, updates: Partial<Pick<WorkspaceFolder, 'name' | 'parentFolderId'>>) => void;

  // ─── Import/Export ──────────────────────────────────────────────────────
  exportWorkspaces: () => string;
  importWorkspaces: (json: string) => boolean;

  // ─── Utility ────────────────────────────────────────────────────────────
  getGroupsForChannel: (channelSlug: string) => StreamGroup[];

  // ─── Group Load ────────────────────────────────────────────────────────
  loadGroupIntoWorkspace: (groupId: string) => { layout: GridLayout; slots: WorkspaceSlot[] } | null;

  // ─── Channel Reorder ────────────────────────────────────────────────────
  reorderChannelsInGroup: (groupId: string, fromIndex: number, toIndex: number) => void;
}

// ─── Helper ─────────────────────────────────────────────────────────────────

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const defaultAudioSettings: AudioSettings = {
  perStreamVolume: {},
  perStreamMuted: {},
  audioPrioritySlot: null,
};

const defaultChatState: ChatState = {
  activeChatChannel: null,
  unifiedChatEnabled: false,
};

const defaultSyncMode: SyncMode = {
  enabled: false,
  maxLatencyDiff: 2000,
};

// ─── Store ──────────────────────────────────────────────────────────────────

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      groups: [],
      workspaces: [],
      folders: [],

      // ─── Group Actions ───────────────────────────────────────────────────

      addGroup: (name, color, channelSlugs = []) =>
        set((s) => ({
          groups: [
            ...s.groups,
            {
              id: generateId(),
              name,
              color,
              channelSlugs,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          ],
        })),

      removeGroup: (id) =>
        set((s) => ({
          groups: s.groups.filter((g) => g.id !== id),
        })),

      updateGroup: (id, updates) =>
        set((s) => ({
          groups: s.groups.map((g) =>
            g.id === id ? { ...g, ...updates, updatedAt: Date.now() } : g
          ),
        })),

      addChannelToGroup: (groupId, channelSlug) =>
        set((s) => ({
          groups: s.groups.map((g) =>
            g.id === groupId && !g.channelSlugs.includes(channelSlug)
              ? { ...g, channelSlugs: [...g.channelSlugs, channelSlug], updatedAt: Date.now() }
              : g
          ),
        })),

      removeChannelFromGroup: (groupId, channelSlug) =>
        set((s) => ({
          groups: s.groups.map((g) =>
            g.id === groupId
              ? { ...g, channelSlugs: g.channelSlugs.filter((s) => s !== channelSlug), updatedAt: Date.now() }
              : g
          ),
        })),

      // ─── Workspace Actions ───────────────────────────────────────────────

      saveWorkspace: (name, layout, slots, folderId = null, audioSettings, chatState, syncMode) =>
        set((s) => ({
          workspaces: [
            ...s.workspaces,
            {
              id: generateId(),
              name,
              folderId,
              layout,
              slots,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              lastLoadedAt: null,
              audioSettings: audioSettings ?? { ...defaultAudioSettings },
              chatState: chatState ?? { ...defaultChatState },
              syncMode: syncMode ?? { ...defaultSyncMode },
            },
          ],
        })),

      loadWorkspace: (id) => {
        const ws = get().workspaces.find((w) => w.id === id);
        if (!ws) return null;
        return {
          layout: ws.layout,
          slots: ws.slots,
          audioSettings: ws.audioSettings,
          chatState: ws.chatState,
          syncMode: ws.syncMode,
        };
      },

      removeWorkspace: (id) =>
        set((s) => ({
          workspaces: s.workspaces.filter((w) => w.id !== id),
        })),

      updateWorkspace: (id, updates) =>
        set((s) => ({
          workspaces: s.workspaces.map((w) =>
            w.id === id ? { ...w, ...updates, updatedAt: Date.now() } : w
          ),
        })),

      duplicateWorkspace: (id) => {
        const ws = get().workspaces.find((w) => w.id === id);
        if (!ws) return;
        set((s) => ({
          workspaces: [
            ...s.workspaces,
            {
              ...ws,
              id: generateId(),
              name: `${ws.name} (Copy)`,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              lastLoadedAt: null,
            },
          ],
        }));
      },

      updateWorkspaceLastLoaded: (id) =>
        set((s) => ({
          workspaces: s.workspaces.map((w) =>
            w.id === id ? { ...w, lastLoadedAt: Date.now() } : w
          ),
        })),

      // ─── Folder Actions ─────────────────────────────────────────────────

      addFolder: (name, parentFolderId = null) =>
        set((s) => ({
          folders: [
            ...s.folders,
            {
              id: generateId(),
              name,
              parentFolderId,
              createdAt: Date.now(),
            },
          ],
        })),

      removeFolder: (id) =>
        set((s) => {
          // Also remove child folders and workspaces in this folder
          const childFolderIds = new Set<string>();
          const collectChildren = (parentId: string) => {
            for (const f of s.folders) {
              if (f.parentFolderId === parentId) {
                childFolderIds.add(f.id);
                collectChildren(f.id);
              }
            }
          };
          collectChildren(id);
          childFolderIds.add(id);

          return {
            folders: s.folders.filter((f) => !childFolderIds.has(f.id)),
            workspaces: s.workspaces.filter(
              (w) => w.folderId !== id && !childFolderIds.has(w.folderId ?? '')
            ),
          };
        }),

      updateFolder: (id, updates) =>
        set((s) => ({
          folders: s.folders.map((f) =>
            f.id === id ? { ...f, ...updates } : f
          ),
        })),

      // ─── Import/Export ──────────────────────────────────────────────────

      exportWorkspaces: () => {
        const { groups, workspaces, folders } = get();
        return JSON.stringify({ groups, workspaces, folders }, null, 2);
      },

      importWorkspaces: (json) => {
        try {
          const data = JSON.parse(json);
          if (!data.groups || !data.workspaces) return false;

          set((s) => ({
            groups: [...s.groups, ...data.groups],
            workspaces: [...s.workspaces, ...data.workspaces.map((w: WorkspaceLayout) => ({
              ...w,
              lastLoadedAt: w.lastLoadedAt ?? null,
              audioSettings: w.audioSettings ?? { ...defaultAudioSettings },
              chatState: w.chatState ?? { ...defaultChatState },
              syncMode: w.syncMode ?? { ...defaultSyncMode },
            }))],
            folders: [...s.folders, ...(data.folders || [])],
          }));
          return true;
        } catch {
          return false;
        }
      },

      // ─── Utility ────────────────────────────────────────────────────────

      getGroupsForChannel: (channelSlug) => {
        return get().groups.filter((g) =>
          g.channelSlugs.includes(channelSlug)
        );
      },

      // ─── Group Load ──────────────────────────────────────────────────────

      loadGroupIntoWorkspace: (groupId) => {
        const group = get().groups.find((g) => g.id === groupId);
        if (!group || group.channelSlugs.length === 0) return null;

        const channelSlugs = group.channelSlugs;
        let targetLayout: GridLayout = '1x1';
        if (channelSlugs.length <= 1) targetLayout = '1x1';
        else if (channelSlugs.length <= 3) targetLayout = '1+2';
        else if (channelSlugs.length <= 4) targetLayout = '2x2';
        else targetLayout = '3x3';

        const slotCount = targetLayout === '1x1' ? 1
          : targetLayout === '1+2' ? 3
          : targetLayout === '2x2' ? 4
          : 9;

        const slots: WorkspaceSlot[] = Array.from({ length: slotCount }, (_, i) => ({
          position: i,
          channelSlug: i < channelSlugs.length ? channelSlugs[i] : null,
        }));

        return { layout: targetLayout, slots };
      },

      // ─── Channel Reorder ─────────────────────────────────────────────────

      reorderChannelsInGroup: (groupId, fromIndex, toIndex) => {
        set((s) => ({
          groups: s.groups.map((g) => {
            if (g.id !== groupId) return g;
            const slugs = [...g.channelSlugs];
            const [moved] = slugs.splice(fromIndex, 1);
            slugs.splice(toIndex, 0, moved);
            return { ...g, channelSlugs: slugs, updatedAt: Date.now() };
          }),
        }));
      },
    }),
    {
      name: 'liveforge-workspaces',
    }
  )
);
