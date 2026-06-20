'use client';

import { useSettingsStore } from '@/stores/settingsStore';
import { useChatStore } from '@/stores/chatStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sun, Moon, Monitor, Volume2, Keyboard, Bell, Layout, MessageSquare,
  RotateCcw, Palette, AlertTriangle, Dice5, Eye, Maximize, PictureInPicture2,
  Play, Zap, Timer, Activity, Shield, Trash2, Info, Sparkles, Gamepad2,
  Type, Gauge, Move, Heart, Waves, Accessibility,
} from 'lucide-react';
import type { ThemeMode, GridLayout, AccentColor, UIDensity, DefaultQuality } from '@/types';

// Accent color options with their display colors
const ACCENT_OPTIONS: { value: AccentColor; label: string; color: string; gradient: string }[] = [
  { value: 'default', label: 'Flame', color: 'bg-gradient-to-r from-red-500 to-orange-500', gradient: 'from-red-500 to-orange-500' },
  { value: 'red', label: 'Red', color: 'bg-red-500', gradient: 'from-red-600 to-red-400' },
  { value: 'orange', label: 'Orange', color: 'bg-orange-500', gradient: 'from-orange-600 to-orange-400' },
  { value: 'purple', label: 'Purple', color: 'bg-purple-500', gradient: 'from-purple-600 to-purple-400' },
  { value: 'blue', label: 'Blue', color: 'bg-blue-500', gradient: 'from-blue-600 to-blue-400' },
  { value: 'green', label: 'Green', color: 'bg-green-500', gradient: 'from-green-600 to-green-400' },
  { value: 'cyan', label: 'Cyan', color: 'bg-cyan-500', gradient: 'from-cyan-600 to-cyan-400' },
  { value: 'pink', label: 'Pink', color: 'bg-pink-500', gradient: 'from-pink-600 to-pink-400' },
];

export function SettingsPanel() {
  const settings = useSettingsStore();

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Palette className="h-5 w-5" />
          Settings
        </h2>
      </div>

      <Tabs defaultValue="appearance" className="flex-1 flex flex-col">
        <TabsList className="mx-3 mt-2 grid grid-cols-6">
          <TabsTrigger value="appearance" className="text-xs px-1">
            <Sun className="h-3 w-3 mr-0.5" />
            <span className="hidden sm:inline">Look</span>
          </TabsTrigger>
          <TabsTrigger value="player" className="text-xs px-1">
            <Volume2 className="h-3 w-3 mr-0.5" />
            <span className="hidden sm:inline">Player</span>
          </TabsTrigger>
          <TabsTrigger value="chat" className="text-xs px-1">
            <MessageSquare className="h-3 w-3 mr-0.5" />
            <span className="hidden sm:inline">Chat</span>
          </TabsTrigger>
          <TabsTrigger value="accessibility" className="text-xs px-1">
            <Accessibility className="h-3 w-3 mr-0.5" />
            <span className="hidden sm:inline">A11y</span>
          </TabsTrigger>
          <TabsTrigger value="shortcuts" className="text-xs px-1">
            <Keyboard className="h-3 w-3 mr-0.5" />
            <span className="hidden sm:inline">Keys</span>
          </TabsTrigger>
          <TabsTrigger value="about" className="text-xs px-1">
            <Info className="h-3 w-3 mr-0.5" />
            <span className="hidden sm:inline">More</span>
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-y-auto p-3">
          {/* ═══════════════════════════════════════════════════════════════════
              APPEARANCE TAB
              ═══════════════════════════════════════════════════════════════════ */}
          <TabsContent value="appearance" className="space-y-5 mt-0">
            {/* Theme */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Theme</Label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { value: 'light' as ThemeMode, icon: Sun, label: 'Light' },
                  { value: 'dark' as ThemeMode, icon: Moon, label: 'Dark' },
                  { value: 'system' as ThemeMode, icon: Monitor, label: 'System' },
                ]).map(({ value, icon: Icon, label }) => (
                  <Button
                    key={value}
                    variant={settings.theme === value ? 'default' : 'outline'}
                    size="sm"
                    className="w-full"
                    onClick={() => settings.setTheme(value)}
                  >
                    <Icon className="h-3.5 w-3.5 mr-1.5" />
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            <Separator />

            {/* Accent Color */}
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                Accent Color
              </Label>
              <div className="grid grid-cols-4 gap-2">
                {ACCENT_OPTIONS.map(({ value, label, color }) => (
                  <button
                    key={value}
                    onClick={() => settings.setAccentColor(value)}
                    className={`flex flex-col items-center gap-1.5 p-2 rounded-lg border-2 transition-all ${
                      settings.accentColor === value
                        ? 'border-primary bg-primary/10 scale-105'
                        : 'border-transparent hover:border-muted-foreground/30 bg-muted/50'
                    }`}
                  >
                    <div className={`w-6 h-6 rounded-full ${color} ${value === 'default' ? '' : ''}`} />
                    <span className="text-[10px] leading-tight text-center">{label}</span>
                  </button>
                ))}
              </div>
            </div>

            <Separator />

            {/* UI Density */}
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Gauge className="h-3.5 w-3.5" />
                UI Density
              </Label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { value: 'compact' as UIDensity, label: 'Compact', desc: 'More content' },
                  { value: 'comfortable' as UIDensity, label: 'Default', desc: 'Balanced' },
                  { value: 'spacious' as UIDensity, label: 'Spacious', desc: 'More room' },
                ]).map(({ value, label, desc }) => (
                  <Button
                    key={value}
                    variant={settings.uiDensity === value ? 'default' : 'outline'}
                    size="sm"
                    className="w-full flex-col h-auto py-2"
                    onClick={() => settings.setUIDensity(value)}
                  >
                    <span className="text-xs">{label}</span>
                    <span className="text-[10px] opacity-60">{desc}</span>
                  </Button>
                ))}
              </div>
            </div>

            <Separator />

            {/* Layout */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Default Layout</Label>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {(['1x1', '1+2', '2+1', '2x2', '1+3', '1+1+2', '3x3'] as GridLayout[]).map((layout) => (
                  <Button
                    key={layout}
                    variant={settings.defaultLayout === layout ? 'default' : 'outline'}
                    size="sm"
                    className="w-full"
                    onClick={() => settings.setDefaultLayout(layout)}
                  >
                    <Layout className="h-3.5 w-3.5 mr-1.5" />
                    {layout}
                  </Button>
                ))}
              </div>
            </div>

            <Separator />

            {/* Display toggles */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Display</Label>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm">Compact Cards</Label>
                  <p className="text-xs text-muted-foreground">Smaller stream cards in search</p>
                </div>
                <Switch
                  checked={settings.compactCards}
                  onCheckedChange={settings.setCompactCards}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm flex items-center gap-1">
                    <Activity className="h-3 w-3" />
                    Viewer Trend
                  </Label>
                  <p className="text-xs text-muted-foreground">Show rising/falling viewer arrows</p>
                </div>
                <Switch
                  checked={settings.showViewerDeltas}
                  onCheckedChange={settings.setShowViewerDeltas}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm flex items-center gap-1">
                    <Timer className="h-3 w-3" />
                    Uptime Badges
                  </Label>
                  <p className="text-xs text-muted-foreground">Show stream duration on cards</p>
                </div>
                <Switch
                  checked={settings.showUptimeBadges}
                  onCheckedChange={settings.setShowUptimeBadges}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm">Reduced Motion</Label>
                  <p className="text-xs text-muted-foreground">Minimize animations</p>
                </div>
                <Switch
                  checked={settings.reducedMotion}
                  onCheckedChange={settings.setReducedMotion}
                />
              </div>
            </div>

            <Separator />

            {/* 18+ Content */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />
                    Show 18+ Content
                  </Label>
                  <p className="text-xs text-muted-foreground">Show gambling, pool, and age-gated streams</p>
                </div>
                <Switch
                  checked={settings.showMatureContent}
                  onCheckedChange={settings.setShowMatureContent}
                />
              </div>
              {settings.showMatureContent && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                  <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0" />
                  <div className="text-xs">
                    <p className="text-yellow-500 font-medium">18+ Mode Enabled</p>
                    <p className="text-yellow-500/70 mt-0.5">
                      Gambling <Dice5 className="h-2.5 w-2.5 inline" />, pool/hot tub <Waves className="h-2.5 w-2.5 inline" />, and suggestive content will appear in search.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ═══════════════════════════════════════════════════════════════════
              PLAYER TAB
              ═══════════════════════════════════════════════════════════════════ */}
          <TabsContent value="player" className="space-y-5 mt-0">
            {/* Volume */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Volume</Label>
                <span className="text-xs text-muted-foreground">{Math.round(settings.volume * 100)}%</span>
              </div>
              <Slider
                value={[settings.volume * 100]}
                max={100}
                step={1}
                onValueChange={([v]) => settings.setVolume(v / 100)}
              />
            </div>

            <Separator />

            {/* Default Quality */}
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Eye className="h-3.5 w-3.5" />
                Default Quality
              </Label>
              <Select
                value={settings.defaultQuality}
                onValueChange={(v) => settings.setDefaultQuality(v as DefaultQuality)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto (Adaptive)</SelectItem>
                  <SelectItem value="1080p">1080p (Full HD)</SelectItem>
                  <SelectItem value="720p">720p (HD)</SelectItem>
                  <SelectItem value="480p">480p (SD)</SelectItem>
                  <SelectItem value="360p">360p (Low)</SelectItem>
                  <SelectItem value="160p">160p (Audio-only friendly)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {/* Playback toggles */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Playback</Label>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm flex items-center gap-1">
                    <Play className="h-3 w-3" />
                    Auto-Play on Add
                  </Label>
                  <p className="text-xs text-muted-foreground">Start playback when adding a stream</p>
                </div>
                <Switch
                  checked={settings.autoPlayOnAdd}
                  onCheckedChange={settings.setAutoPlayOnAdd}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm flex items-center gap-1">
                    <Maximize className="h-3 w-3" />
                    Auto-Fullscreen (Single)
                  </Label>
                  <p className="text-xs text-muted-foreground">Fullscreen when only one stream</p>
                </div>
                <Switch
                  checked={settings.autoFullscreenOnSingle}
                  onCheckedChange={settings.setAutoFullscreenOnSingle}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm flex items-center gap-1">
                    <PictureInPicture2 className="h-3 w-3" />
                    PiP on Minimize
                  </Label>
                  <p className="text-xs text-muted-foreground">Picture-in-Picture when minimizing</p>
                </div>
                <Switch
                  checked={settings.pipOnMinimize}
                  onCheckedChange={settings.setPipOnMinimize}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm">Auto Theater Mode</Label>
                  <p className="text-xs text-muted-foreground">Enter theater mode on stream start</p>
                </div>
                <Switch
                  checked={settings.autoTheater}
                  onCheckedChange={settings.setAutoTheater}
                />
              </div>
            </div>

            <Separator />

            {/* Latency */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Latency</Label>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm flex items-center gap-1">
                    <Zap className="h-3 w-3" />
                    Minimize Latency
                  </Label>
                  <p className="text-xs text-muted-foreground">Prioritize live latency over buffer</p>
                </div>
                <Switch
                  checked={settings.minLatencyMode}
                  onCheckedChange={settings.setMinLatencyMode}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm">Stream Sync</Label>
                  <p className="text-xs text-muted-foreground">Sync multiple streams to same timestamp</p>
                </div>
                <Switch
                  checked={settings.streamSyncEnabled}
                  onCheckedChange={settings.setStreamSyncEnabled}
                />
              </div>
            </div>
          </TabsContent>

          {/* ═══════════════════════════════════════════════════════════════════
              CHAT TAB
              ═══════════════════════════════════════════════════════════════════ */}
          <TabsContent value="chat" className="space-y-5 mt-0">
            {/* Chat Visibility */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm">Show Chat</Label>
                <p className="text-xs text-muted-foreground">Display chat alongside the player</p>
              </div>
              <Switch
                checked={settings.chatVisible}
                onCheckedChange={settings.setChatVisible}
              />
            </div>

            <Separator />

            {/* Chat Position */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Chat Position</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={settings.chatPosition === 'right' ? 'default' : 'outline'}
                  size="sm"
                  className="w-full"
                  onClick={() => settings.setChatPosition('right')}
                >
                  Right
                </Button>
                <Button
                  variant={settings.chatPosition === 'left' ? 'default' : 'outline'}
                  size="sm"
                  className="w-full"
                  onClick={() => settings.setChatPosition('left')}
                >
                  Left
                </Button>
              </div>
            </div>

            <Separator />

            {/* Font Size */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <Type className="h-3.5 w-3.5" />
                  Font Size
                </Label>
                <span className="text-xs text-muted-foreground">{settings.chatFontSize}px</span>
              </div>
              <Slider
                value={[settings.chatFontSize]}
                min={10}
                max={18}
                step={1}
                onValueChange={([v]) => settings.setChatFontSize(v)}
              />
            </div>

            <Separator />

            {/* Emote Size */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Emote Size</Label>
              <div className="grid grid-cols-3 gap-2">
                {(['small', 'medium', 'large'] as const).map((size) => (
                  <Button
                    key={size}
                    variant={settings.chatEmoteSize === size ? 'default' : 'outline'}
                    size="sm"
                    className="w-full capitalize"
                    onClick={() => settings.setChatEmoteSize(size)}
                  >
                    {size}
                  </Button>
                ))}
              </div>
            </div>

            <Separator />

            {/* Timestamps */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm">Show Timestamps</Label>
                <p className="text-xs text-muted-foreground">Display time on each message</p>
              </div>
              <Switch
                checked={settings.chatShowTimestamps}
                onCheckedChange={settings.setChatShowTimestamps}
              />
            </div>
          </TabsContent>

          {/* ═══════════════════════════════════════════════════════════════════
              ACCESSIBILITY TAB
              ═══════════════════════════════════════════════════════════════════ */}
          <TabsContent value="accessibility" className="space-y-5 mt-0">
            <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
              <Accessibility className="h-3 w-3" />
              Accessibility settings for better usability
            </div>

            {/* High Contrast Mode */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm">High Contrast Mode</Label>
                <p className="text-xs text-muted-foreground">Increase contrast for better visibility</p>
              </div>
              <Switch
                checked={settings.highContrastMode}
                onCheckedChange={settings.setHighContrastMode}
              />
            </div>

            <Separator />

            {/* Large Chat Fonts */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm">Large Chat Fonts</Label>
                <p className="text-xs text-muted-foreground">Increase chat text size for readability</p>
              </div>
              <Switch
                checked={settings.largeChatFonts}
                onCheckedChange={settings.setLargeChatFonts}
              />
            </div>

            <Separator />

            {/* Screen Reader Mode */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm">Screen Reader Mode</Label>
                <p className="text-xs text-muted-foreground">Optimize layout for screen readers</p>
              </div>
              <Switch
                checked={settings.screenReaderMode}
                onCheckedChange={settings.setScreenReaderMode}
              />
            </div>

            <Separator />

            {/* Focus Indicators */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm">Focus Indicators</Label>
                <p className="text-xs text-muted-foreground">Show visible focus rings on interactive elements</p>
              </div>
              <Switch
                checked={settings.focusIndicators}
                onCheckedChange={settings.setFocusIndicators}
              />
            </div>

            <Separator />

            {/* Colorblind Mode */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Colorblind Mode</Label>
              <p className="text-xs text-muted-foreground">Adjust colors for color vision deficiency</p>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { value: 'none' as const, label: 'None' },
                  { value: 'protanopia' as const, label: 'Protanopia' },
                  { value: 'deuteranopia' as const, label: 'Deuteranopia' },
                  { value: 'tritanopia' as const, label: 'Tritanopia' },
                ]).map(({ value, label }) => (
                  <Button
                    key={value}
                    variant={settings.colorblindMode === value ? 'default' : 'outline'}
                    size="sm"
                    className="w-full"
                    onClick={() => settings.setColorblindMode(value)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            <Separator />

            {/* Reduced Motion (already exists but show here too) */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm">Reduced Motion</Label>
                <p className="text-xs text-muted-foreground">Minimize animations and transitions</p>
              </div>
              <Switch
                checked={settings.reducedMotion}
                onCheckedChange={settings.setReducedMotion}
              />
            </div>
          </TabsContent>

          {/* ═══════════════════════════════════════════════════════════════════
              SHORTCUTS TAB
              ═══════════════════════════════════════════════════════════════════ */}
          <TabsContent value="shortcuts" className="space-y-3 mt-0">
            <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
              <Keyboard className="h-3 w-3" />
              Keyboard shortcuts for quick player actions
            </div>
            {Object.entries(settings.keyboardShortcuts).map(([action, key]) => (
              <div key={action} className="flex items-center justify-between">
                <span className="text-sm capitalize">{action.replace(/([A-Z])/g, ' $1').trim()}</span>
                <kbd className="px-2 py-0.5 text-xs bg-muted rounded border font-mono">
                  {key}
                </kbd>
              </div>
            ))}

            <Separator />

            <div className="text-xs text-muted-foreground">
              Press <kbd className="px-1 py-0.5 text-xs bg-muted rounded border font-mono">?</kbd> anywhere to see all shortcuts
            </div>
          </TabsContent>

          {/* ═══════════════════════════════════════════════════════════════════
              ABOUT / MORE TAB
              ═══════════════════════════════════════════════════════════════════ */}
          <TabsContent value="about" className="space-y-5 mt-0">
            {/* Notifications */}
            <div className="space-y-3">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Bell className="h-3.5 w-3.5" />
                Notifications
              </Label>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm">Enable Notifications</Label>
                  <p className="text-xs text-muted-foreground">Get alerts when channels go live</p>
                </div>
                <Switch
                  checked={settings.notificationsEnabled}
                  onCheckedChange={settings.setNotificationsEnabled}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm">Notification Sound</Label>
                  <p className="text-xs text-muted-foreground">Play a sound for live alerts</p>
                </div>
                <Switch
                  checked={settings.notificationSound}
                  onCheckedChange={settings.setNotificationSound}
                />
              </div>
            </div>

            <Separator />

            {/* Data & Privacy */}
            <div className="space-y-3">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5" />
                Data & Privacy
              </Label>

              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={() => {
                  if (typeof window !== 'undefined' && 'caches' in window) {
                    caches.keys().then(names => {
                      for (const name of names) caches.delete(name);
                    });
                  }
                  localStorage.removeItem('liveforge-streams');
                  window.location.reload();
                }}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Clear Cache & Reload
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={() => {
                  const data = {
                    settings: JSON.parse(localStorage.getItem('liveforge-settings') || '{}'),
                    streams: JSON.parse(localStorage.getItem('liveforge-streams') || '{}'),
                    exportedAt: new Date().toISOString(),
                  };
                  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `liveforge-settings-${new Date().toISOString().slice(0, 10)}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                <Move className="h-3.5 w-3.5 mr-1.5" />
                Export Settings
              </Button>
            </div>

            <Separator />

            {/* About */}
            <div className="space-y-3">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5" />
                About LiveForge
              </Label>

              <div className="space-y-2 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Version</span>
                  <span className="font-mono">0.2.0</span>
                </div>
                <div className="flex justify-between">
                  <span>Build</span>
                  <span className="font-mono">2024.12</span>
                </div>
                <div className="flex justify-between">
                  <span>Engine</span>
                  <span className="font-mono">Next.js 16 + hls.js</span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground">
                <p className="font-medium text-foreground mb-1">LiveForge</p>
                <p>Multi-stream live viewer for Kick.com. Watch multiple streams simultaneously with advanced player controls, real-time chat, and powerful multi-stream layouts.</p>
              </div>
            </div>
          </TabsContent>
        </div>
      </Tabs>

      {/* Reset */}
      <div className="p-3 border-t">
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => {
            settings.resetToDefaults();
            // Also clear persisted data
            localStorage.removeItem('liveforge-streams');
          }}
        >
          <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
          Reset to Defaults
        </Button>
      </div>
    </div>
  );
}
