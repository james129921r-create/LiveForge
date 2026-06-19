'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';
import { usePlayerStore } from '@/stores/playerStore';
import { useMultiStreamStore } from '@/stores/multiStreamStore';


import { useIsMobile } from '@/hooks/use-mobile';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Search, Settings, BarChart3, Download, Cast, Bell, MessageSquare,
  Flame, Moon, Sun, Monitor, Activity, AlertTriangle,
  Headphones, FolderOpen, Users, Lock, Unlock,
} from 'lucide-react';
import { KeyboardHelp } from '@/components/KeyboardHelp';

// Feature panels
import { SearchPanel } from '@/features/search/components';
import { SettingsPanel } from '@/features/settings/components';
import { StatsPanel } from '@/features/stats/components';
import { DownloadPanel } from '@/features/downloads/components';
import { CastingPanel } from '@/features/casting/components';
import { NotificationPanel } from '@/features/notifications/components';
import { DiagnosticsPanel } from '@/features/diagnostics/components';
import { AudioMixerPanel } from '@/features/player/components/AudioMixerPanel';
import { StreamGroupsPanel } from '@/features/multistream/components/StreamGroupsPanel';
import { WorkspacePanel } from '@/features/multistream/components/WorkspacePanel';
import { ChatAlertsPanel } from '@/features/chat/components/ChatAlertsPanel';

// ─── Types ──────────────────────────────────────────────────────────────────

export type SidebarTab = 'discover' | 'chat' | 'settings';
type SidePanel = 'stats' | 'downloads' | 'casting' | 'notifications' | 'diagnostics' | 'audioMixer' | 'streamGroups' | 'workspaces' | 'chatAlerts' | null;

interface AppShellProps {
  children: React.ReactNode;
  chatPanel: React.ReactNode;
  activeSidebarTab: SidebarTab;
  onSidebarTabChange: (tab: SidebarTab) => void;
  activeSidePanel: SidePanel;
  onSidePanelChange: (panel: SidePanel) => void;
}

// ─── Panel registry (for Sheet-based side panels) ──────────────────────────

const PANEL_META: Record<string, { title: string; icon: React.ReactNode }> = {
  settings: { title: 'Settings', icon: <Settings className="h-4 w-4" /> },
  stats: { title: 'Stream Stats', icon: <BarChart3 className="h-4 w-4" /> },
  downloads: { title: 'Downloads', icon: <Download className="h-4 w-4" /> },
  casting: { title: 'Casting', icon: <Cast className="h-4 w-4" /> },
  notifications: { title: 'Notifications', icon: <Bell className="h-4 w-4" /> },
  diagnostics: { title: 'Diagnostics', icon: <Activity className="h-4 w-4" /> },
  audioMixer: { title: 'Audio Mixer', icon: <Headphones className="h-4 w-4" /> },
  streamGroups: { title: 'Stream Groups', icon: <Users className="h-4 w-4" /> },
  workspaces: { title: 'Workspaces', icon: <FolderOpen className="h-4 w-4" /> },
  chatAlerts: { title: 'Chat Alerts', icon: <Bell className="h-4 w-4" /> },
};

function PanelContent({ panel }: { panel: string }) {
  switch (panel) {
    case 'settings': return <SettingsPanel />;
    case 'stats': return <StatsPanel />;
    case 'downloads': return <DownloadPanel />;
    case 'casting': return <CastingPanel />;
    case 'notifications': return <NotificationPanel />;
    case 'diagnostics': return <DiagnosticsPanel />;
    case 'audioMixer': return <AudioMixerPanel />;
    case 'streamGroups': return <StreamGroupsPanel />;
    case 'workspaces': return <WorkspacePanel />;
    case 'chatAlerts': return <ChatAlertsPanel />;
    default: return null;
  }
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function AppShell({ children, chatPanel, activeSidebarTab, onSidebarTabChange, activeSidePanel, onSidePanelChange }: AppShellProps) {
  const isMobile = useIsMobile();

  // Register service worker
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Service worker registration failed — non-critical
      });
    }
  }, []);

  // Keyboard shortcuts
  const [keyboardHelpOpen, setKeyboardHelpOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

      // Ctrl+Shift+D — diagnostics
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        onSidePanelChange(activeSidePanel === 'diagnostics' ? null : 'diagnostics');
        return;
      }

      // Ctrl+Shift+A — audio mixer
      if (e.ctrlKey && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        onSidePanelChange(activeSidePanel === 'audioMixer' ? null : 'audioMixer');
        return;
      }

      // Ctrl+Shift+W — workspaces
      if (e.ctrlKey && e.shiftKey && e.key === 'W') {
        e.preventDefault();
        onSidePanelChange(activeSidePanel === 'workspaces' ? null : 'workspaces');
        return;
      }

      // Ctrl+Shift+G — stream groups
      if (e.ctrlKey && e.shiftKey && e.key === 'G') {
        e.preventDefault();
        onSidePanelChange(activeSidePanel === 'streamGroups' ? null : 'streamGroups');
        return;
      }

      // Ctrl+Shift+C — chat alerts
      if (e.ctrlKey && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        onSidePanelChange(activeSidePanel === 'chatAlerts' ? null : 'chatAlerts');
        return;
      }

      // ? — keyboard help
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setKeyboardHelpOpen(true);
        return;
      }

      // / — switch to Discover tab
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        onSidebarTabChange('discover');
        return;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeSidePanel, onSidePanelChange, onSidebarTabChange]);

  if (isMobile) {
    return (
      <>
        <MobileShell
          chatPanel={chatPanel}
          activeSidebarTab={activeSidebarTab}
          onSidebarTabChange={onSidebarTabChange}
          activeSidePanel={activeSidePanel}
          onSidePanelChange={onSidePanelChange}
        >
          {children}
        </MobileShell>
        <KeyboardHelp open={keyboardHelpOpen} onOpenChange={setKeyboardHelpOpen} />
      </>
    );
  }

  return (
    <>
      <DesktopShell
        chatPanel={chatPanel}
        activeSidebarTab={activeSidebarTab}
        onSidebarTabChange={onSidebarTabChange}
        activeSidePanel={activeSidePanel}
        onSidePanelChange={onSidePanelChange}
      >
        {children}
      </DesktopShell>
      <KeyboardHelp open={keyboardHelpOpen} onOpenChange={setKeyboardHelpOpen} />
    </>
  );
}

// ─── Desktop Shell ───────────────────────────────────────────────────────────

function DesktopShell({ children, chatPanel, activeSidebarTab, onSidebarTabChange, activeSidePanel, onSidePanelChange }: AppShellProps) {
  const { theme, setTheme, showMatureContent, setShowMatureContent } = useSettingsStore();
  const { isTheaterMode } = usePlayerStore();
  const { slots, layoutLocked, setLayoutLocked } = useMultiStreamStore();
  const { toast } = useToast();

  // Toast notifications for stream events
  const prevSlotChannelsRef = useRef<Record<string, string>>({});
  const prevMatureRef = useRef<boolean>(showMatureContent);
  const prevThemeRef = useRef<string>(theme);

  // Track slot changes for toasts
  useEffect(() => {
    const currentMap: Record<string, string> = {};
    slots.forEach((s) => {
      if (s.channel) currentMap[s.id] = s.channel.username;
    });
    const prev = prevSlotChannelsRef.current;

    // Detect additions
    for (const [slotId, username] of Object.entries(currentMap)) {
      if (!prev[slotId]) {
        toast({ title: `Stream added: ${username}`, duration: 2500 });
      }
    }

    // Detect removals
    for (const [slotId] of Object.entries(prev)) {
      if (!currentMap[slotId]) {
        toast({ title: 'Stream removed', duration: 2500 });
      }
    }

    prevSlotChannelsRef.current = currentMap;
  }, [slots, toast]);

  // Toast for mature content toggle
  useEffect(() => {
    if (prevMatureRef.current !== showMatureContent) {
      toast({ title: showMatureContent ? '18+ mode enabled' : '18+ mode disabled', duration: 2500 });
      prevMatureRef.current = showMatureContent;
    }
  }, [showMatureContent, toast]);

  // Toast for theme change
  useEffect(() => {
    if (prevThemeRef.current !== theme && prevThemeRef.current !== '') {
      toast({ title: `Theme changed to ${theme}`, duration: 2500 });
    }
    prevThemeRef.current = theme;
  }, [theme, toast]);

  // Handle channel select from SearchPanel — auto-switch to chat tab
  const handleChannelAdded = useCallback(() => {
    onSidebarTabChange('chat');
  }, [onSidebarTabChange]);

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* Top Navigation */}
      <header className="h-12 border-b flex items-center justify-between px-3 shrink-0 bg-card">
        <div className="flex items-center gap-3">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center transition-transform duration-200 hover:scale-110 cursor-default">
              <Flame className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-sm tracking-tight">LiveForge</span>
          </div>

          <Separator orientation="vertical" className="h-6" />

          {/* Nav Actions */}
          <NavButton
            icon={<Cast className="h-4 w-4" />}
            label="Cast"
            active={activeSidePanel === 'casting'}
            onClick={() => onSidePanelChange(activeSidePanel === 'casting' ? null : 'casting')}
          />
          <NavButton
            icon={<Download className="h-4 w-4" />}
            label="Export"
            active={activeSidePanel === 'downloads'}
            onClick={() => onSidePanelChange(activeSidePanel === 'downloads' ? null : 'downloads')}
          />
          {/* Layout Lock */}
          <NavButton
            icon={layoutLocked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
            label={layoutLocked ? 'Locked' : 'Lock'}
            active={layoutLocked}
            onClick={() => {
              setLayoutLocked(!layoutLocked);
              toast({ title: layoutLocked ? 'Layout unlocked' : 'Layout locked', duration: 2000 });
            }}
          />
        </div>

        <div className="flex items-center gap-2">
          <NavButton
            icon={<Headphones className="h-4 w-4" />}
            label="Audio"
            active={activeSidePanel === 'audioMixer'}
            onClick={() => onSidePanelChange(activeSidePanel === 'audioMixer' ? null : 'audioMixer')}
          />
          <NavButton
            icon={<FolderOpen className="h-4 w-4" />}
            label="Spaces"
            active={activeSidePanel === 'workspaces'}
            onClick={() => onSidePanelChange(activeSidePanel === 'workspaces' ? null : 'workspaces')}
          />
          <NavButton
            icon={<Users className="h-4 w-4" />}
            label="Groups"
            active={activeSidePanel === 'streamGroups'}
            onClick={() => onSidePanelChange(activeSidePanel === 'streamGroups' ? null : 'streamGroups')}
          />
          <Separator orientation="vertical" className="h-6" />
          <NavButton
            icon={<AlertTriangle className={`h-4 w-4 ${showMatureContent ? 'text-yellow-500' : ''}`} />}
            label="18+"
            active={showMatureContent}
            onClick={() => setShowMatureContent(!showMatureContent)}
          />
          <NavButton
            icon={<BarChart3 className="h-4 w-4" />}
            label="Stats"
            active={activeSidePanel === 'stats'}
            onClick={() => onSidePanelChange(activeSidePanel === 'stats' ? null : 'stats')}
          />
          <NavButton
            icon={<Bell className="h-4 w-4" />}
            label="Alerts"
            active={activeSidePanel === 'notifications'}
            onClick={() => onSidePanelChange(activeSidePanel === 'notifications' ? null : 'notifications')}
          />
          <Separator orientation="vertical" className="h-6" />
          <NavButton
            icon={theme === 'dark' ? <Moon className="h-4 w-4" /> : theme === 'light' ? <Sun className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
            label="Theme"
            onClick={() => setTheme(theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark')}
          />
        </div>
      </header>

      {/* Main Content — resizable panels with always-visible tabbed sidebar */}
      <div className="flex-1 flex overflow-hidden">
        <ResizablePanelGroup direction="horizontal" className="flex-1">
          {/* Player Area */}
          <ResizablePanel
            defaultSize={70}
            minSize={40}
            className={`flex flex-col overflow-hidden ${isTheaterMode ? '' : 'p-2'}`}
          >
            {children}
          </ResizablePanel>

          {/* Tabbed Sidebar — always visible */}
          <ResizableHandle withHandle />
          <ResizablePanel
            defaultSize={30}
            minSize={20}
            maxSize={40}
            className="flex flex-col bg-card"
          >
            <TabbedSidebar
              activeTab={activeSidebarTab}
              onTabChange={onSidebarTabChange}
              chatPanel={chatPanel}
              onChannelAdded={handleChannelAdded}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {/* Side Panels as Sheet overlays */}
      {activeSidePanel && (
        <Sheet
          open={!!activeSidePanel}
          onOpenChange={(open) => { if (!open) onSidePanelChange(null); }}
        >
          <SheetContent side="right" className="w-[400px] sm:max-w-md p-0 flex flex-col">
            <SheetHeader className="px-4 pt-4 pb-2 border-b shrink-0">
              <SheetTitle className="flex items-center gap-2">
                {PANEL_META[activeSidePanel]?.icon}
                {PANEL_META[activeSidePanel]?.title}
              </SheetTitle>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto">
              <PanelContent panel={activeSidePanel} />
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}

// ─── Mobile Shell ────────────────────────────────────────────────────────────

type MobileMenuKey = 'chat' | 'discover' | 'settings' | SidePanel;

function MobileShell({ children, chatPanel, onSidebarTabChange, activeSidePanel, onSidePanelChange }: AppShellProps) {
  const { theme, setTheme, showMatureContent, setShowMatureContent } = useSettingsStore();
  const { isTheaterMode } = usePlayerStore();
  const { layoutLocked, setLayoutLocked } = useMultiStreamStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState<MobileMenuKey | null>(null);

  const handleBottomNavTap = (key: MobileMenuKey) => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(10);
    }

    if (mobileMenuOpen === key) {
      setMobileMenuOpen(null);
      if (key === 'discover' || key === 'settings') onSidePanelChange(null);
    } else {
      setMobileMenuOpen(key);
      if (key === 'chat') {
        onSidebarTabChange('chat');
      } else if (key === 'discover') {
        onSidebarTabChange('discover');
      } else if (key === 'settings') {
        onSidebarTabChange('settings');
      } else {
        onSidePanelChange(key);
      }
    }
  };

  const closeMobileMenu = () => {
    setMobileMenuOpen(null);
  };

  // Bottom nav items
  const bottomNavItems: { key: MobileMenuKey; icon: React.ReactNode; label: string }[] = [
    { key: 'discover', icon: <Search className="h-5 w-5" />, label: 'Discover' },
    { key: 'chat', icon: <MessageSquare className="h-5 w-5" />, label: 'Chat' },
    { key: 'audioMixer', icon: <Headphones className="h-5 w-5" />, label: 'Audio' },
    { key: 'stats', icon: <BarChart3 className="h-5 w-5" />, label: 'Stats' },
    { key: 'settings', icon: <Settings className="h-5 w-5" />, label: 'Settings' },
  ];

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* Compact Header */}
      <header className="h-12 border-b flex items-center justify-between px-3 shrink-0 bg-card">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center transition-transform duration-200 hover:scale-110 cursor-default">
            <Flame className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-bold text-sm tracking-tight">LiveForge</span>
          {layoutLocked && <Lock className="h-3 w-3 text-yellow-500" />}
        </div>

        {/* Header actions — 18+ toggle, lock, and theme */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setLayoutLocked(!layoutLocked)}
            title={layoutLocked ? 'Unlock layout' : 'Lock layout'}
          >
            {layoutLocked ? <Lock className="h-4 w-4 text-yellow-500" /> : <Unlock className="h-4 w-4" />}
          </Button>
          <Button
            variant={showMatureContent ? 'secondary' : 'ghost'}
            size="icon"
            className="h-8 w-8"
            onClick={() => setShowMatureContent(!showMatureContent)}
            title={showMatureContent ? 'Hide 18+ content' : 'Show 18+ content'}
          >
            <AlertTriangle className={`h-4 w-4 ${showMatureContent ? 'text-yellow-500' : ''}`} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setTheme(theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark')}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </header>

      {/* Main Content — full width, padded for bottom nav */}
      <div className={`flex-1 flex flex-col overflow-hidden pb-14 ${isTheaterMode ? '' : 'p-2'}`}>
        {children}
      </div>

      {/* ── Chat Sheet (slides from bottom) ── */}
      <Sheet open={mobileMenuOpen === 'chat'} onOpenChange={(open) => { if (!open) closeMobileMenu(); }}>
        <SheetContent side="bottom" className="h-[85vh] rounded-t-xl p-0 flex flex-col">
          <div className="flex justify-center pt-2 pb-1">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>
          <SheetHeader className="px-4 pt-1 pb-2 border-b shrink-0">
            <SheetTitle className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Chat
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-hidden">
            {chatPanel}
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Discover Sheet (slides from right) ── */}
      <Sheet open={mobileMenuOpen === 'discover'} onOpenChange={(open) => { if (!open) closeMobileMenu(); }}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
          <SheetHeader className="px-4 pt-4 pb-2 border-b shrink-0">
            <SheetTitle className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              Discover
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-hidden">
            <SearchPanel onChannelAdded={() => { closeMobileMenu(); onSidebarTabChange('chat'); }} />
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Settings Sheet (slides from right) ── */}
      <Sheet open={mobileMenuOpen === 'settings'} onOpenChange={(open) => { if (!open) closeMobileMenu(); }}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
          <SheetHeader className="px-4 pt-4 pb-2 border-b shrink-0">
            <SheetTitle className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Settings
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto">
            <SettingsPanel />
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Side Panel Sheet (slides from right) ── */}
      {activeSidePanel && (
        <Sheet
          open={mobileMenuOpen === activeSidePanel}
          onOpenChange={(open) => {
            if (!open) {
              closeMobileMenu();
              onSidePanelChange(null);
            }
          }}
        >
          <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
            <SheetHeader className="px-4 pt-4 pb-2 border-b shrink-0">
              <SheetTitle className="flex items-center gap-2">
                {PANEL_META[activeSidePanel]?.icon}
                {PANEL_META[activeSidePanel]?.title}
              </SheetTitle>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto">
              <PanelContent panel={activeSidePanel} />
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* ── Bottom Navigation Bar ── */}
      <div className="fixed bottom-0 left-0 right-0 h-14 bg-card border-t flex items-center justify-around px-1 z-40 safe-bottom">
        {bottomNavItems.map((item) => {
          const isActive =
            item.key === 'chat'
              ? mobileMenuOpen === 'chat'
              : item.key === 'discover'
                ? mobileMenuOpen === 'discover'
                : item.key === 'settings'
                  ? mobileMenuOpen === 'settings'
                  : mobileMenuOpen === item.key;

          return (
            <button
              key={item.key}
              onClick={() => handleBottomNavTap(item.key)}
              className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full rounded-lg transition-colors active:bg-muted/50 ${
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              aria-label={item.label}
            >
              {item.icon}
              <span className="text-[10px] leading-tight">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Tabbed Sidebar (Desktop) ────────────────────────────────────────────────

function TabbedSidebar({ activeTab, onTabChange, chatPanel, onChannelAdded }: {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  chatPanel: React.ReactNode;
  onChannelAdded?: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex items-center border-b px-1 shrink-0">
        <SidebarTabButton
          active={activeTab === 'discover'}
          onClick={() => onTabChange('discover')}
          icon={<Search className="h-3.5 w-3.5" />}
          label="Discover"
        />
        <SidebarTabButton
          active={activeTab === 'chat'}
          onClick={() => onTabChange('chat')}
          icon={<MessageSquare className="h-3.5 w-3.5" />}
          label="Chat"
        />
        <SidebarTabButton
          active={activeTab === 'settings'}
          onClick={() => onTabChange('settings')}
          icon={<Settings className="h-3.5 w-3.5" />}
          label="Settings"
        />
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden relative">
        {/* Use visibility-based rendering to keep ChatPanel connected */}
        <div className={`absolute inset-0 overflow-hidden ${activeTab === 'discover' ? '' : 'invisible pointer-events-none'}`}>
          <SearchPanel onChannelAdded={onChannelAdded} />
        </div>
        <div className={`absolute inset-0 overflow-hidden ${activeTab === 'chat' ? '' : 'invisible pointer-events-none'}`}>
          {chatPanel}
        </div>
        <div className={`absolute inset-0 overflow-y-auto ${activeTab === 'settings' ? '' : 'invisible pointer-events-none'}`}>
          <SettingsPanel />
        </div>
      </div>
    </div>
  );
}

// ─── Shared sub-components ───────────────────────────────────────────────────

function NavButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant={active ? 'secondary' : 'ghost'}
      size="sm"
      className="h-8 gap-1.5 text-xs"
      onClick={onClick}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </Button>
  );
}

function SidebarTabButton({ active, onClick, icon, label }: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors border-b-2 ${
        active
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
