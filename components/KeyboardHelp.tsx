'use client';

import { useSettingsStore } from '@/stores/settingsStore';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Keyboard, Play, LayoutGrid, Compass, Volume2 } from 'lucide-react';

interface KeyboardHelpProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SHORTCUT_CATEGORIES = [
  {
    label: 'Playback',
    icon: Play,
    keys: ['playPause', 'toggleMute', 'volumeUp', 'volumeDown', 'toggleFullscreen', 'togglePiP', 'toggleAudioOnly'],
    labels: {
      playPause: 'Play / Pause',
      toggleMute: 'Toggle Mute',
      volumeUp: 'Volume Up',
      volumeDown: 'Volume Down',
      toggleFullscreen: 'Toggle Fullscreen',
      togglePiP: 'Toggle Picture-in-Picture',
      toggleAudioOnly: 'Toggle Audio Only',
    },
  },
  {
    label: 'Layout',
    icon: LayoutGrid,
    keys: ['layout1x1', 'layout2x2', 'layout3x3', 'toggleTheater', 'toggleSync', 'createClip'],
    labels: {
      layout1x1: 'Layout 1×1',
      layout2x2: 'Layout 2×2',
      layout3x3: 'Layout 3×3',
      toggleTheater: 'Toggle Theater Mode',
      toggleSync: 'Toggle Stream Sync',
      createClip: 'Create Clip',
    },
  },
  {
    label: 'Navigation',
    icon: Compass,
    keys: ['search', 'settings', 'toggleChat'],
    labels: {
      search: 'Open Search',
      settings: 'Open Settings',
      toggleChat: 'Toggle Chat',
    },
  },
];

function formatKey(key: string): string {
  if (key === ' ') return 'Space';
  if (key === 'ArrowUp') return '↑';
  if (key === 'ArrowDown') return '↓';
  if (key === 'ArrowLeft') return '←';
  if (key === 'ArrowRight') return '→';
  if (key.length === 1) return key.toUpperCase();
  return key;
}

export function KeyboardHelp({ open, onOpenChange }: KeyboardHelpProps) {
  const { keyboardShortcuts } = useSettingsStore();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-4 w-4" />
            Keyboard Shortcuts
          </DialogTitle>
          <DialogDescription>
            Use these shortcuts to control LiveForge without leaving your keyboard.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-1">
          {SHORTCUT_CATEGORIES.map((category) => {
            const Icon = category.icon;
            return (
              <div key={category.label}>
                <div className="flex items-center gap-2 mb-2.5">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {category.label}
                  </span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <div className="grid grid-cols-1 gap-1.5">
                  {category.keys.map((actionKey) => {
                    const binding = keyboardShortcuts[actionKey] || '';
                    const label = category.labels[actionKey as keyof typeof category.labels] || actionKey;
                    return (
                      <div
                        key={actionKey}
                        className="flex items-center justify-between py-1.5 px-2.5 rounded-md hover:bg-muted/50 transition-colors"
                      >
                        <span className="text-sm">{label}</span>
                        <kbd className="kbd-key">{formatKey(binding)}</kbd>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Global shortcuts not in settings store */}
          <div>
            <div className="flex items-center gap-2 mb-2.5">
              <Volume2 className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                General
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              <div className="flex items-center justify-between py-1.5 px-2.5 rounded-md hover:bg-muted/50 transition-colors">
                <span className="text-sm">Show Keyboard Shortcuts</span>
                <kbd className="kbd-key">?</kbd>
              </div>
              <div className="flex items-center justify-between py-1.5 px-2.5 rounded-md hover:bg-muted/50 transition-colors">
                <span className="text-sm">Open Diagnostics</span>
                <div className="flex gap-1">
                  <kbd className="kbd-key">Ctrl</kbd>
                  <kbd className="kbd-key">Shift</kbd>
                  <kbd className="kbd-key">D</kbd>
                </div>
              </div>
              <div className="flex items-center justify-between py-1.5 px-2.5 rounded-md hover:bg-muted/50 transition-colors">
                <span className="text-sm">Close Dialog</span>
                <kbd className="kbd-key">Esc</kbd>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
