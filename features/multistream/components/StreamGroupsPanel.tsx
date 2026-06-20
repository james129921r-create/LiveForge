'use client';

import { useState, useCallback } from 'react';
import { useWorkspaceStore, type StreamGroup } from '@/stores/workspaceStore';
import { useMultiStreamStore } from '@/stores/multiStreamStore';
import { fetchChannel } from '@/lib/kick-api';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  FolderOpen, Plus, Trash2, Edit2, Users, Check, X, Palette,
  Zap, ArrowDownToLine, GripVertical, Circle, UserMinus,
} from 'lucide-react';
import type { StreamChannel } from '@/types';

const GROUP_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6', '#f43f5e',
];

/**
 * StreamGroupsPanel — Manage stream groups.
 *
 * - List of groups with color indicators
 * - Create/edit/delete groups
 * - Add/remove channels from groups
 * - Quick Load — one-click loading of all group channels
 * - Add Current Streams — adds all loaded streams to the group
 * - Group color indicator dot next to each channel
 * - Channel count badge
 * - Drag-to-reorder channels within a group
 * - LIVE/OFFLINE status for each channel in the group
 * - Remove all offline action for a group
 */
export function StreamGroupsPanel() {
  const {
    groups,
    addGroup,
    removeGroup,
    updateGroup,
    addChannelToGroup,
    removeChannelFromGroup,
    getGroupsForChannel,
    loadGroupIntoWorkspace,
    reorderChannelsInGroup,
  } = useWorkspaceStore();
  const { slots, addChannelToSlot, setLayout } = useMultiStreamStore();

  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupColor, setNewGroupColor] = useState(GROUP_COLORS[0]);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [addChannelInput, setAddChannelInput] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [loadingGroupId, setLoadingGroupId] = useState<string | null>(null);
  // Track channel live status per group
  const [channelStatuses, setChannelStatuses] = useState<Record<string, { isLive: boolean; displayName?: string }>>({});

  const handleCreateGroup = () => {
    if (!newGroupName.trim()) return;
    addGroup(newGroupName.trim(), newGroupColor);
    setNewGroupName('');
    setNewGroupColor(GROUP_COLORS[Math.floor(Math.random() * GROUP_COLORS.length)]);
  };

  const handleStartEdit = (group: StreamGroup) => {
    setEditingGroupId(group.id);
    setEditName(group.name);
  };

  const handleSaveEdit = (groupId: string) => {
    if (editName.trim()) {
      updateGroup(groupId, { name: editName.trim() });
    }
    setEditingGroupId(null);
  };

  const handleAddChannelToGroup = async (groupId: string) => {
    const slug = addChannelInput[groupId]?.trim();
    if (!slug) return;

    setLoading(true);
    try {
      const channel = await fetchChannel(slug);
      if (channel) {
        addChannelToGroup(groupId, slug);
        setChannelStatuses((prev) => ({
          ...prev,
          [slug]: { isLive: channel.isLive, displayName: channel.displayName },
        }));
        setAddChannelInput((prev) => ({ ...prev, [groupId]: '' }));
      }
    } finally {
      setLoading(false);
    }
  };

  // Quick Load — one-click load all group channels
  const handleQuickLoad = useCallback(async (group: StreamGroup) => {
    const channelSlugs = group.channelSlugs;
    if (channelSlugs.length === 0) return;

    setLoadingGroupId(group.id);

    try {
      const result = loadGroupIntoWorkspace(group.id);
      if (result) {
        setLayout(result.layout);

        // Fetch channel data and add to slots
        for (let i = 0; i < result.slots.length; i++) {
          const slug = result.slots[i].channelSlug;
          if (!slug) continue;
          const slotId = `slot-${i}`;
          try {
            const channel = await fetchChannel(slug);
            if (channel) {
              addChannelToSlot(slotId, channel);
              setChannelStatuses((prev) => ({
                ...prev,
                [slug]: { isLive: channel.isLive, displayName: channel.displayName },
              }));
            }
          } catch {
            // Skip channels that fail to load
          }
        }
      }
    } finally {
      setLoadingGroupId(null);
    }
  }, [loadGroupIntoWorkspace, setLayout, addChannelToSlot]);

  // Add Current Streams — adds all currently loaded streams to the group
  const handleAddCurrentStreams = useCallback((groupId: string) => {
    const activeChannelSlugs = slots
      .filter((s) => s.channel)
      .map((s) => s.channel!.username);

    for (const slug of activeChannelSlugs) {
      addChannelToGroup(groupId, slug);
      const slot = slots.find(s => s.channel?.username === slug);
      if (slot?.channel) {
        setChannelStatuses((prev) => ({
          ...prev,
          [slug]: { isLive: slot.channel!.isLive, displayName: slot.channel!.displayName },
        }));
      }
    }
  }, [slots, addChannelToGroup]);

  // Remove all offline channels from a group
  const handleRemoveOffline = useCallback((groupId: string) => {
    const group = groups.find((g) => g.id === groupId);
    if (!group) return;

    for (const slug of group.channelSlugs) {
      const status = channelStatuses[slug];
      if (status && !status.isLive) {
        removeChannelFromGroup(groupId, slug);
      }
    }
  }, [groups, channelStatuses, removeChannelFromGroup]);

  // Drag reorder handlers
  const handleDragStart = (e: React.DragEvent, groupId: string, index: number) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ groupId, index }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, groupId: string, toIndex: number) => {
    e.preventDefault();
    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
      if (data.groupId === groupId && data.index !== toIndex) {
        reorderChannelsInGroup(groupId, data.index, toIndex);
      }
    } catch {
      // Invalid drag data
    }
  };

  // Get all channel slugs currently in slots
  const activeChannelSlugs = slots
    .filter((s) => s.channel)
    .map((s) => s.channel!.username);

  // Count live channels in a group
  const getGroupLiveCount = (group: StreamGroup): number => {
    return group.channelSlugs.filter((slug) => channelStatuses[slug]?.isLive).length;
  };

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {/* Create new group */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Input
                placeholder="Group name..."
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateGroup()}
                className="h-8 text-xs"
              />
              <Button
                size="sm"
                className="h-8 gap-1"
                onClick={handleCreateGroup}
                disabled={!newGroupName.trim()}
              >
                <Plus className="h-3 w-3" />
                Add
              </Button>
            </div>
            {/* Color picker */}
            <div className="flex items-center gap-1.5">
              <Palette className="h-3 w-3 text-muted-foreground" />
              {GROUP_COLORS.map((color) => (
                <button
                  key={color}
                  className={`w-5 h-5 rounded-full border-2 transition-transform ${
                    newGroupColor === color ? 'scale-125 border-foreground' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: color }}
                  onClick={() => setNewGroupColor(color)}
                />
              ))}
            </div>
          </div>

          <Separator />

          {/* Groups list */}
          {groups.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <FolderOpen className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No groups yet</p>
              <p className="text-xs text-muted-foreground/60">Create a group to organize your favorite channels</p>
            </div>
          ) : (
            groups.map((group) => {
              const liveCount = getGroupLiveCount(group);
              const isLoading = loadingGroupId === group.id;

              return (
                <div
                  key={group.id}
                  className="rounded-lg border border-border/50 overflow-hidden"
                >
                  {/* Group header */}
                  <div
                    className="flex items-center justify-between p-3"
                    style={{ borderLeft: `3px solid ${group.color}` }}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {editingGroupId === group.id ? (
                        <div className="flex items-center gap-1 flex-1">
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit(group.id)}
                            className="h-6 text-xs"
                            autoFocus
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => handleSaveEdit(group.id)}
                          >
                            <Check className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => setEditingGroupId(null)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          {/* Color dot */}
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: group.color }}
                          />
                          <span className="text-sm font-medium truncate">{group.name}</span>
                          {/* Channel count badge */}
                          <Badge variant="outline" className="text-[9px] shrink-0 gap-0.5">
                            {group.channelSlugs.length}
                            {liveCount > 0 && (
                              <span className="text-green-500">·{liveCount} live</span>
                            )}
                          </Badge>
                        </>
                      )}
                    </div>
                    {editingGroupId !== group.id && (
                      <div className="flex items-center gap-0.5 shrink-0">
                        {/* Quick Load button */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-primary"
                          onClick={() => handleQuickLoad(group)}
                          title="Quick Load — load all channels into workspace"
                          disabled={isLoading || group.channelSlugs.length === 0}
                        >
                          {isLoading ? (
                            <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                          ) : (
                            <Zap className="h-3 w-3" />
                          )}
                        </Button>
                        {/* Add Current Streams button */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleAddCurrentStreams(group.id)}
                          title="Add current streams to this group"
                          disabled={activeChannelSlugs.length === 0}
                        >
                          <ArrowDownToLine className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleStartEdit(group)}
                        >
                          <Edit2 className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-red-400 hover:text-red-500"
                          onClick={() => removeGroup(group.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Channel slugs — draggable list */}
                  {group.channelSlugs.length > 0 && (
                    <div className="px-3 pb-2 space-y-0.5">
                      {group.channelSlugs.map((slug, idx) => {
                        const status = channelStatuses[slug];
                        const isLive = status?.isLive ?? false;

                        return (
                          <div
                            key={slug}
                            className="flex items-center gap-1.5 py-1 px-1 rounded hover:bg-muted/50 group/channel"
                            draggable
                            onDragStart={(e) => handleDragStart(e, group.id, idx)}
                            onDragOver={handleDragOver}
                            onDrop={(e) => handleDrop(e, group.id, idx)}
                          >
                            {/* Drag handle */}
                            <GripVertical className="h-3 w-3 text-muted-foreground/40 cursor-grab shrink-0" />
                            {/* Color dot for group */}
                            <span
                              className="w-1.5 h-1.5 rounded-full shrink-0"
                              style={{ backgroundColor: group.color }}
                            />
                            {/* LIVE/OFFLINE status dot */}
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isLive ? 'bg-red-500 animate-pulse' : 'bg-muted-foreground/30'}`} />
                            {/* Channel name */}
                            <span className="text-[11px] truncate flex-1">
                              {status?.displayName || slug}
                            </span>
                            {/* Status label */}
                            <span className={`text-[9px] font-medium shrink-0 ${isLive ? 'text-red-500' : 'text-muted-foreground/50'}`}>
                              {isLive ? 'LIVE' : 'OFFLINE'}
                            </span>
                            {/* Remove button */}
                            <button
                              className="opacity-0 group-hover/channel:opacity-100 hover:text-red-400 transition-opacity shrink-0"
                              onClick={() => removeChannelFromGroup(group.id, slug)}
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        );
                      })}

                      {/* Remove all offline button */}
                      {group.channelSlugs.length > 1 && liveCount < group.channelSlugs.length && (
                        <button
                          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-red-400 transition-colors mt-1 px-1"
                          onClick={() => handleRemoveOffline(group.id)}
                        >
                          <UserMinus className="h-2.5 w-2.5" />
                          Remove all offline
                        </button>
                      )}
                    </div>
                  )}

                  {/* Add channel input */}
                  <div className="px-3 pb-3 flex items-center gap-1.5">
                    <Input
                      placeholder="Add channel slug..."
                      value={addChannelInput[group.id] || ''}
                      onChange={(e) =>
                        setAddChannelInput((prev) => ({
                          ...prev,
                          [group.id]: e.target.value,
                        }))
                      }
                      onKeyDown={(e) => e.key === 'Enter' && handleAddChannelToGroup(group.id)}
                      className="h-6 text-[10px]"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={() => handleAddChannelToGroup(group.id)}
                      disabled={loading}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}

          {/* Active channel groups */}
          {activeChannelSlugs.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Groups for active channels
                </span>
                {activeChannelSlugs.map((slug) => {
                  const channelGroups = getGroupsForChannel(slug);
                  if (channelGroups.length === 0) return null;
                  return (
                    <div key={slug} className="flex items-center gap-2">
                      <span className="text-xs truncate max-w-[100px]">{slug}</span>
                      <div className="flex flex-wrap gap-1">
                        {channelGroups.map((g) => (
                          <Badge
                            key={g.id}
                            className="text-[9px] gap-1"
                            style={{ backgroundColor: g.color + '20', color: g.color, borderColor: g.color + '40' }}
                            variant="outline"
                          >
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: g.color }} />
                            {g.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
