'use client';

import { useState, useCallback } from 'react';
import { useWorkspaceStore, type WorkspaceLayout, type WorkspaceFolder } from '@/stores/workspaceStore';
import { useMultiStreamStore } from '@/stores/multiStreamStore';
import { usePlayerStore } from '@/stores/playerStore';
import { useChatStore } from '@/stores/chatStore';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  FolderOpen, Plus, Trash2, Save, Download, Upload, Folder,
  ChevronRight, ChevronDown, LayoutGrid, Copy, Share2,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { generateShareUrl } from '@/lib/layout-share';

/**
 * Helper: format relative time string
 */
function formatRelativeTime(timestamp: number | null): string | null {
  if (!timestamp) return null;
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * WorkspacePanel — Manage workspaces.
 *
 * - List of saved workspaces
 * - Save current layout as workspace
 * - Load workspace (restores layout + channels)
 * - Import/Export workspaces as JSON
 * - Organize in folders
 * - Duplicate workspaces
 * - Share layout via URL
 * - Persist audio/chat/sync settings
 */
export function WorkspacePanel() {
  const {
    workspaces,
    folders,
    saveWorkspace,
    loadWorkspace,
    removeWorkspace,
    updateWorkspace,
    duplicateWorkspace,
    updateWorkspaceLastLoaded,
    addFolder,
    removeFolder,
    exportWorkspaces,
    importWorkspaces,
  } = useWorkspaceStore();
  const { layout, slots, setLayout, addChannelToSlot, clearAll } = useMultiStreamStore();
  const {
    perStreamVolume,
    perStreamMuted,
    audioPrioritySlot,
    streamSyncEnabled,
  } = usePlayerStore();
  const {
    activeChatChannel,
    unifiedChatEnabled,
  } = useChatStore();

  const { toast } = useToast();

  const [workspaceName, setWorkspaceName] = useState('');
  const [selectedFolderId] = useState<string | null>(null);
  const [folderName, setFolderName] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [editingWorkspaceId, setEditingWorkspaceId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const handleSaveCurrentLayout = useCallback(() => {
    if (!workspaceName.trim()) return;
    const workspaceSlots = slots.map((s, i) => ({
      position: i,
      channelSlug: s.channel?.username ?? null,
    }));

    // Build audio settings from playerStore
    const audioSettings = {
      perStreamVolume: { ...perStreamVolume },
      perStreamMuted: { ...perStreamMuted },
      audioPrioritySlot,
    };

    // Build chat state from chatStore
    const chatState = {
      activeChatChannel,
      unifiedChatEnabled,
    };

    // Build sync mode from playerStore
    const syncMode = {
      enabled: streamSyncEnabled,
      maxLatencyDiff: 2000,
    };

    saveWorkspace(
      workspaceName.trim(),
      layout,
      workspaceSlots,
      selectedFolderId,
      audioSettings,
      chatState,
      syncMode,
    );
    setWorkspaceName('');
  }, [workspaceName, layout, slots, saveWorkspace, selectedFolderId, perStreamVolume, perStreamMuted, audioPrioritySlot, activeChatChannel, unifiedChatEnabled, streamSyncEnabled]);

  const handleLoadWorkspace = useCallback(async (id: string) => {
    const result = loadWorkspace(id);
    if (!result) return;

    // Update last loaded timestamp
    updateWorkspaceLastLoaded(id);

    // Clear current layout first
    clearAll();
    setLayout(result.layout);

    // Load channels into slots
    for (const slot of result.slots) {
      if (slot.channelSlug) {
        try {
          const { fetchChannel } = await import('@/lib/kick-api');
          const channel = await fetchChannel(slot.channelSlug);
          if (channel) {
            addChannelToSlot(`slot-${slot.position}`, channel);
          }
        } catch {
          // Skip channels that fail to load
        }
      }
    }

    // Restore audio settings
    const { setStreamVolume, setStreamMuted, setAudioPrioritySlot: setPriority } = usePlayerStore.getState();
    for (const slot of result.slots) {
      const slotId = `slot-${slot.position}`;
      if (result.audioSettings.perStreamVolume[slotId] !== undefined) {
        setStreamVolume(slotId, result.audioSettings.perStreamVolume[slotId]);
      }
      if (result.audioSettings.perStreamMuted[slotId] !== undefined) {
        setStreamMuted(slotId, result.audioSettings.perStreamMuted[slotId]);
      }
    }
    if (result.audioSettings.audioPrioritySlot) {
      setPriority(result.audioSettings.audioPrioritySlot);
    }

    // Restore chat state
    const { setActiveChatChannel, setUnifiedChatEnabled } = useChatStore.getState();
    if (result.chatState.activeChatChannel) {
      setActiveChatChannel(result.chatState.activeChatChannel);
    }
    setUnifiedChatEnabled(result.chatState.unifiedChatEnabled);

    // Restore sync mode
    const { setStreamSyncEnabled } = usePlayerStore.getState();
    setStreamSyncEnabled(result.syncMode.enabled);
  }, [loadWorkspace, updateWorkspaceLastLoaded, clearAll, setLayout, addChannelToSlot]);

  const handleExport = useCallback(() => {
    const json = exportWorkspaces();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `liveforge-workspaces-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [exportWorkspaces]);

  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      const success = importWorkspaces(text);
      if (!success) {
        alert('Failed to import workspaces. Invalid JSON format.');
      }
    };
    input.click();
  }, [importWorkspaces]);

  const handleShare = useCallback((ws: WorkspaceLayout) => {
    const shareData = {
      v: 1 as const,
      n: ws.name,
      l: ws.layout,
      s: ws.slots
        .filter((s) => s.channelSlug)
        .map((s) => ({ p: s.position, c: s.channelSlug! })),
      a: ws.audioSettings.perStreamVolume,
      m: ws.audioSettings.perStreamMuted,
    };

    const url = generateShareUrl(shareData);
    if (!url) {
      toast({ title: 'Failed to generate share link', variant: 'destructive' });
      return;
    }

    navigator.clipboard.writeText(url).then(() => {
      toast({ title: 'Share link copied!', description: 'Anyone with this link can load this layout' });
    }).catch(() => {
      // Fallback: select text approach
      toast({ title: 'Share link', description: url });
    });
  }, [toast]);

  const toggleFolder = (folderId: string) => {
    setExpandedFolders((prev) => ({ ...prev, [folderId]: !prev[folderId] }));
  };

  const handleCreateFolder = () => {
    if (!folderName.trim()) return;
    addFolder(folderName.trim(), selectedFolderId);
    setFolderName('');
  };

  // Root-level workspaces (no folder)
  const rootWorkspaces = workspaces.filter((w) => !w.folderId);
  // Root-level folders
  const rootFolders = folders.filter((f) => !f.parentFolderId);

  /**
   * Build badge info for workspace cards
   */
  const getWorkspaceBadges = (ws: WorkspaceLayout) => {
    const badges: string[] = [];
    const filledSlots = ws.slots.filter((s) => s.channelSlug).length;

    // Audio badge
    if (filledSlots > 0) {
      const volumeKeys = Object.keys(ws.audioSettings.perStreamVolume);
      if (volumeKeys.length > 0) {
        badges.push(`🎵 ${filledSlots}ch`);
      } else {
        badges.push(`🎵 ${filledSlots}ch`);
      }
    }

    // Chat badge
    if (ws.chatState.unifiedChatEnabled) {
      badges.push('💬 unified');
    }

    // Sync badge
    if (ws.syncMode.enabled) {
      badges.push('🔄 sync');
    }

    return badges;
  };

  const renderFolder = (folder: WorkspaceFolder, depth = 0) => {
    const childFolders = folders.filter((f) => f.parentFolderId === folder.id);
    const childWorkspaces = workspaces.filter((w) => w.folderId === folder.id);
    const isExpanded = expandedFolders[folder.id] ?? true;

    return (
      <div key={folder.id}>
        <div
          className="flex items-center gap-1.5 py-1.5 px-2 hover:bg-muted/30 rounded cursor-pointer"
          style={{ paddingLeft: `${12 + depth * 16}px` }}
          onClick={() => toggleFolder(folder.id)}
        >
          {isExpanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
          )}
          <Folder className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
          <span className="text-xs font-medium truncate flex-1">{folder.name}</span>
          <Badge variant="outline" className="text-[8px] shrink-0">
            {childWorkspaces.length}
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-red-400 hover:text-red-500 shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              removeFolder(folder.id);
            }}
          >
            <Trash2 className="h-2.5 w-2.5" />
          </Button>
        </div>
        {isExpanded && (
          <div>
            {childFolders.map((f) => renderFolder(f, depth + 1))}
            {childWorkspaces.map((w) => renderWorkspace(w, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const renderWorkspace = (ws: WorkspaceLayout, depth = 0) => {
    const isEditing = editingWorkspaceId === ws.id;
    const filledSlots = ws.slots.filter((s) => s.channelSlug).length;
    const badges = getWorkspaceBadges(ws);
    const lastLoadedStr = formatRelativeTime(ws.lastLoadedAt);

    return (
      <div
        key={ws.id}
        className="py-1.5 px-2 hover:bg-muted/30 rounded group"
        style={{ paddingLeft: `${28 + depth * 16}px` }}
      >
        <div className="flex items-center gap-2">
          <LayoutGrid className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          {isEditing ? (
            <div className="flex items-center gap-1 flex-1">
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    updateWorkspace(ws.id, { name: editName.trim() });
                    setEditingWorkspaceId(null);
                  }
                }}
                className="h-5 text-[10px]"
                autoFocus
              />
            </div>
          ) : (
            <span className="text-xs truncate flex-1">{ws.name}</span>
          )}
          <Badge variant="outline" className="text-[8px] shrink-0">
            {ws.layout} · {filledSlots}ch
          </Badge>
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={() => handleLoadWorkspace(ws.id)}
              title="Load workspace"
            >
              <LayoutGrid className="h-2.5 w-2.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={() => {
                setEditingWorkspaceId(ws.id);
                setEditName(ws.name);
              }}
              title="Rename"
            >
              <span className="text-[9px]">✏️</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={() => duplicateWorkspace(ws.id)}
              title="Duplicate workspace"
            >
              <Copy className="h-2.5 w-2.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={() => handleShare(ws)}
              title="Share layout link"
            >
              <Share2 className="h-2.5 w-2.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-red-400 hover:text-red-500"
              onClick={() => removeWorkspace(ws.id)}
              title="Delete workspace"
            >
              <Trash2 className="h-2.5 w-2.5" />
            </Button>
          </div>
        </div>
        {/* Badges row */}
        {badges.length > 0 && (
          <div className="flex items-center gap-1 mt-0.5" style={{ paddingLeft: '20px' }}>
            {badges.map((badge, i) => (
              <span key={i} className="text-[9px] text-muted-foreground">
                {i > 0 && ' · '}
                {badge}
              </span>
            ))}
          </div>
        )}
        {/* Last loaded time */}
        {lastLoadedStr && (
          <div className="mt-0.5" style={{ paddingLeft: '20px' }}>
            <span className="text-[9px] text-muted-foreground/60">
              Loaded {lastLoadedStr}
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {/* Save current workspace */}
          <div className="space-y-2">
            <span className="text-xs font-medium">Save Current Layout</span>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Workspace name..."
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveCurrentLayout()}
                className="h-8 text-xs"
              />
              <Button
                size="sm"
                className="h-8 gap-1 shrink-0"
                onClick={handleSaveCurrentLayout}
                disabled={!workspaceName.trim()}
              >
                <Save className="h-3 w-3" />
                Save
              </Button>
            </div>
            <div className="text-[10px] text-muted-foreground">
              Current: {layout} · {slots.filter((s) => s.channel).length} streams
              {Object.keys(perStreamVolume).length > 0 && ' · 🎵 audio'}
              {unifiedChatEnabled && ' · 💬 unified'}
              {streamSyncEnabled && ' · 🔄 sync'}
            </div>
          </div>

          <Separator />

          {/* Create folder */}
          <div className="space-y-2">
            <span className="text-xs font-medium">Folders</span>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Folder name..."
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                className="h-8 text-xs"
              />
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1 shrink-0"
                onClick={handleCreateFolder}
                disabled={!folderName.trim()}
              >
                <Plus className="h-3 w-3" />
                Folder
              </Button>
            </div>
          </div>

          <Separator />

          {/* Workspaces tree */}
          <div className="space-y-1">
            <span className="text-xs font-medium">Saved Workspaces</span>
            {workspaces.length === 0 && folders.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-8">
                <FolderOpen className="h-8 w-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">No workspaces yet</p>
                <p className="text-xs text-muted-foreground/60">Save your current layout to quickly restore it later</p>
              </div>
            ) : (
              <>
                {rootWorkspaces.map((w) => renderWorkspace(w))}
                {rootFolders.map((f) => renderFolder(f))}
              </>
            )}
          </div>

          <Separator />

          {/* Import/Export */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1 text-xs flex-1"
              onClick={handleExport}
              disabled={workspaces.length === 0 && folders.length === 0}
            >
              <Download className="h-3 w-3" />
              Export
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1 text-xs flex-1"
              onClick={handleImport}
            >
              <Upload className="h-3 w-3" />
              Import
            </Button>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
