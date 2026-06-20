import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppSettings, ThemeMode, GridLayout, AudioMode, AccentColor, UIDensity, DefaultQuality } from '@/types';

export type ColorblindMode = 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia';

interface SettingsState extends AppSettings {
  // ─── Accessibility ────────────────────────────────────────────────────────
  highContrastMode: boolean;
  largeChatFonts: boolean;
  screenReaderMode: boolean;
  colorblindMode: ColorblindMode;
  focusIndicators: boolean;

  // Actions
  setTheme: (theme: ThemeMode) => void;
  setAccentColor: (color: AccentColor) => void;
  setUIDensity: (density: UIDensity) => void;
  setTheaterMode: (theater: boolean) => void;
  setChatVisible: (visible: boolean) => void;
  setChatPosition: (position: 'right' | 'left') => void;
  setChatFontSize: (size: number) => void;
  setChatEmoteSize: (size: 'small' | 'medium' | 'large') => void;
  setChatShowTimestamps: (show: boolean) => void;
  setDefaultLayout: (layout: GridLayout) => void;
  setDefaultQuality: (quality: DefaultQuality) => void;
  setAutoPlayOnAdd: (auto: boolean) => void;
  setAutoFullscreenOnSingle: (auto: boolean) => void;
  setPipOnMinimize: (pip: boolean) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setNotificationSound: (sound: boolean) => void;
  setAutoTheater: (auto: boolean) => void;
  setMinLatencyMode: (min: boolean) => void;
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
  setAudioMode: (mode: AudioMode) => void;
  setStreamSyncEnabled: (enabled: boolean) => void;
  setShowMatureContent: (show: boolean) => void;
  setShowViewerDeltas: (show: boolean) => void;
  setReducedMotion: (reduced: boolean) => void;
  setShowUptimeBadges: (show: boolean) => void;
  setCompactCards: (compact: boolean) => void;
  setKeyboardShortcut: (action: string, key: string) => void;
  resetToDefaults: () => void;

  // Accessibility actions
  setHighContrastMode: (enabled: boolean) => void;
  setLargeChatFonts: (enabled: boolean) => void;
  setScreenReaderMode: (enabled: boolean) => void;
  setColorblindMode: (mode: ColorblindMode) => void;
  setFocusIndicators: (enabled: boolean) => void;
}

const DEFAULT_SHORTCUTS: Record<string, string> = {
  playPause: 'Space',
  toggleMute: 'M',
  toggleTheater: 'T',
  toggleFullscreen: 'F',
  togglePiP: 'P',
  toggleAudioOnly: 'A',
  volumeUp: 'ArrowUp',
  volumeDown: 'ArrowDown',
  toggleChat: 'C',
  layout1x1: '1',
  layout2x2: '2',
  layout3x3: '3',
  search: '/',
  settings: 'S',
  createClip: 'X',
  toggleSync: 'Y',
};

const DEFAULT_SETTINGS: AppSettings & {
  highContrastMode: boolean;
  largeChatFonts: boolean;
  screenReaderMode: boolean;
  colorblindMode: ColorblindMode;
  focusIndicators: boolean;
} = {
  theme: 'dark',
  accentColor: 'default',
  uiDensity: 'comfortable',
  theaterMode: false,
  chatVisible: true,
  chatPosition: 'right',
  chatFontSize: 13,
  chatEmoteSize: 'medium',
  chatShowTimestamps: true,
  chatFilters: [],
  keyboardShortcuts: DEFAULT_SHORTCUTS,
  notificationsEnabled: true,
  notificationSound: true,
  autoTheater: false,
  minLatencyMode: false,
  defaultLayout: '1x1',
  defaultQuality: 'auto',
  autoPlayOnAdd: true,
  autoFullscreenOnSingle: false,
  pipOnMinimize: false,
  volume: 0.75,
  muted: false,
  audioMode: 'normal',
  streamSyncEnabled: false,
  showMatureContent: false,
  showViewerDeltas: true,
  reducedMotion: false,
  showUptimeBadges: true,
  compactCards: false,

  // Accessibility defaults
  highContrastMode: false,
  largeChatFonts: false,
  screenReaderMode: false,
  colorblindMode: 'none' as ColorblindMode,
  focusIndicators: false,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,

      setTheme: (theme) => set({ theme }),
      setAccentColor: (accentColor) => set({ accentColor }),
      setUIDensity: (uiDensity) => set({ uiDensity }),
      setTheaterMode: (theater) => set({ theaterMode: theater }),
      setChatVisible: (visible) => set({ chatVisible: visible }),
      setChatPosition: (position) => set({ chatPosition: position }),
      setChatFontSize: (chatFontSize) => set({ chatFontSize }),
      setChatEmoteSize: (chatEmoteSize) => set({ chatEmoteSize }),
      setChatShowTimestamps: (chatShowTimestamps) => set({ chatShowTimestamps }),
      setDefaultLayout: (layout) => set({ defaultLayout: layout }),
      setDefaultQuality: (defaultQuality) => set({ defaultQuality }),
      setAutoPlayOnAdd: (autoPlayOnAdd) => set({ autoPlayOnAdd }),
      setAutoFullscreenOnSingle: (autoFullscreenOnSingle) => set({ autoFullscreenOnSingle }),
      setPipOnMinimize: (pipOnMinimize) => set({ pipOnMinimize }),
      setNotificationsEnabled: (enabled) => set({ notificationsEnabled: enabled }),
      setNotificationSound: (notificationSound) => set({ notificationSound }),
      setAutoTheater: (auto) => set({ autoTheater: auto }),
      setMinLatencyMode: (min) => set({ minLatencyMode: min }),
      setVolume: (volume) => set({ volume }),
      setMuted: (muted) => set({ muted }),
      setAudioMode: (mode) => set({ audioMode: mode }),
      setStreamSyncEnabled: (enabled) => set({ streamSyncEnabled: enabled }),
      setShowMatureContent: (show) => set({ showMatureContent: show }),
      setShowViewerDeltas: (show) => set({ showViewerDeltas: show }),
      setReducedMotion: (reduced) => set({ reducedMotion: reduced }),
      setShowUptimeBadges: (show) => set({ showUptimeBadges: show }),
      setCompactCards: (compact) => set({ compactCards: compact }),
      setKeyboardShortcut: (action, key) =>
        set((s) => ({
          keyboardShortcuts: { ...s.keyboardShortcuts, [action]: key },
        })),
      resetToDefaults: () => set(DEFAULT_SETTINGS),

      // Accessibility actions
      setHighContrastMode: (enabled) => set({ highContrastMode: enabled }),
      setLargeChatFonts: (enabled) => set({ largeChatFonts: enabled }),
      setScreenReaderMode: (enabled) => set({ screenReaderMode: enabled }),
      setColorblindMode: (mode) => set({ colorblindMode: mode }),
      setFocusIndicators: (enabled) => set({ focusIndicators: enabled }),
    }),
    {
      name: 'liveforge-settings',
    }
  )
);
