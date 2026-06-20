'use client';

import { useState } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Bell, BellRing, UserX, Plus, Trash2, Search, AtSign,
  Volume2,
} from 'lucide-react';

/**
 * ChatAlertsPanel — Panel for managing chat alerts.
 *
 * - Keyword alerts (notify when keywords appear)
 * - Mention tracking (notify when usernames are mentioned)
 * - Global user blocking
 * - Visual notification when alert triggers
 * - Sound notification option
 */
export function ChatAlertsPanel() {
  const {
    keywordAlerts,
    mentionAlerts,
    alertFireCount,
    lastAlertTimestamp,
    globallyBlockedUsers,
    addKeywordAlert,
    removeKeywordAlert,
    toggleKeywordAlert,
    addMentionAlert,
    removeMentionAlert,
    toggleMentionAlert,
    clearAlertFireCount,
    addGloballyBlockedUser,
    removeGloballyBlockedUser,
  } = useChatStore();

  const [newKeyword, setNewKeyword] = useState('');
  const [newCaseSensitive, setNewCaseSensitive] = useState(false);
  const [newMention, setNewMention] = useState('');
  const [newBlockedUser, setNewBlockedUser] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(false);

  const handleAddKeyword = () => {
    if (!newKeyword.trim()) return;
    addKeywordAlert(newKeyword.trim(), newCaseSensitive);
    setNewKeyword('');
    setNewCaseSensitive(false);
  };

  const handleAddMention = () => {
    if (!newMention.trim()) return;
    addMentionAlert(newMention.trim());
    setNewMention('');
  };

  const handleAddBlockedUser = () => {
    if (!newBlockedUser.trim()) return;
    addGloballyBlockedUser(newBlockedUser.trim());
    setNewBlockedUser('');
  };

  // Play a notification sound when alerts fire
  const handleTestSound = () => {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 800;
      gain.gain.value = 0.3;
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch {
      // Audio not available
    }
  };

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {/* Alert status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {alertFireCount > 0 ? (
                <BellRing className="h-4 w-4 text-yellow-500 animate-bounce" />
              ) : (
                <Bell className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="text-sm font-medium">Alerts</span>
              {alertFireCount > 0 && (
                <Badge variant="destructive" className="text-[9px]">
                  {alertFireCount}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[10px] gap-1"
                onClick={handleTestSound}
              >
                <Volume2 className="h-3 w-3" />
                Test
              </Button>
              {alertFireCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px] gap-1"
                  onClick={clearAlertFireCount}
                >
                  Clear
                </Button>
              )}
            </div>
          </div>

          {/* Last alert timestamp */}
          {lastAlertTimestamp && (
            <div className="text-[10px] text-muted-foreground">
              Last alert: {new Date(lastAlertTimestamp).toLocaleTimeString()}
            </div>
          )}

          <Separator />

          {/* Keyword Alerts */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium">Keyword Alerts</span>
              <Badge variant="outline" className="text-[9px]">
                {keywordAlerts.length}
              </Badge>
            </div>

            {/* Add keyword */}
            <div className="flex items-center gap-2">
              <Input
                placeholder="Add keyword..."
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddKeyword()}
                className="h-7 text-xs"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 shrink-0"
                onClick={handleAddKeyword}
                disabled={!newKeyword.trim()}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={newCaseSensitive}
                onCheckedChange={setNewCaseSensitive}
                className="scale-75"
              />
              <span className="text-[10px] text-muted-foreground">Case sensitive</span>
            </div>

            {/* Keyword list */}
            {keywordAlerts.length > 0 && (
              <div className="space-y-1">
                {keywordAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="flex items-center gap-2 py-1 px-2 rounded bg-muted/30"
                  >
                    <Switch
                      checked={alert.enabled}
                      onCheckedChange={() => toggleKeywordAlert(alert.id)}
                      className="scale-75"
                    />
                    <span className={`text-xs flex-1 truncate ${alert.enabled ? '' : 'text-muted-foreground line-through'}`}>
                      {alert.keyword}
                    </span>
                    {alert.caseSensitive && (
                      <Badge variant="outline" className="text-[8px] shrink-0">
                        CS
                      </Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 text-red-400 hover:text-red-500 shrink-0"
                      onClick={() => removeKeywordAlert(alert.id)}
                    >
                      <Trash2 className="h-2.5 w-2.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Separator />

          {/* Mention Alerts */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <AtSign className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium">Mention Alerts</span>
              <Badge variant="outline" className="text-[9px]">
                {mentionAlerts.length}
              </Badge>
            </div>

            {/* Add mention */}
            <div className="flex items-center gap-2">
              <Input
                placeholder="Add username..."
                value={newMention}
                onChange={(e) => setNewMention(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddMention()}
                className="h-7 text-xs"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 shrink-0"
                onClick={handleAddMention}
                disabled={!newMention.trim()}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>

            {/* Mention list */}
            {mentionAlerts.length > 0 && (
              <div className="space-y-1">
                {mentionAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="flex items-center gap-2 py-1 px-2 rounded bg-muted/30"
                  >
                    <Switch
                      checked={alert.enabled}
                      onCheckedChange={() => toggleMentionAlert(alert.id)}
                      className="scale-75"
                    />
                    <span className={`text-xs flex-1 truncate ${alert.enabled ? '' : 'text-muted-foreground line-through'}`}>
                      @{alert.username}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 text-red-400 hover:text-red-500 shrink-0"
                      onClick={() => removeMentionAlert(alert.id)}
                    >
                      <Trash2 className="h-2.5 w-2.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Separator />

          {/* Global Blocked Users */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <UserX className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium">Blocked Users</span>
              <Badge variant="outline" className="text-[9px]">
                {globallyBlockedUsers.length}
              </Badge>
            </div>

            {/* Add blocked user */}
            <div className="flex items-center gap-2">
              <Input
                placeholder="Block username..."
                value={newBlockedUser}
                onChange={(e) => setNewBlockedUser(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddBlockedUser()}
                className="h-7 text-xs"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 shrink-0"
                onClick={handleAddBlockedUser}
                disabled={!newBlockedUser.trim()}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>

            {/* Blocked users list */}
            {globallyBlockedUsers.length > 0 && (
              <div className="space-y-1">
                {globallyBlockedUsers.map((username) => (
                  <div
                    key={username}
                    className="flex items-center gap-2 py-1 px-2 rounded bg-muted/30"
                  >
                    <UserX className="h-3 w-3 text-red-400 shrink-0" />
                    <span className="text-xs flex-1 truncate">{username}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 text-red-400 hover:text-red-500 shrink-0"
                      onClick={() => removeGloballyBlockedUser(username)}
                    >
                      <Trash2 className="h-2.5 w-2.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Separator />

          {/* Sound notification */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Volume2 className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs">Sound on alert</span>
            </div>
            <Switch
              checked={soundEnabled}
              onCheckedChange={setSoundEnabled}
            />
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
