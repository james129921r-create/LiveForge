// LiveForge Shared Types

export interface StreamChannel {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  isLive: boolean;
  category?: string | null;
  /** Category slug (e.g., 'irl', 'just-chatting') for precise matching */
  categorySlug?: string | null;
  title?: string | null;
  viewerCount?: number;
  startedAt?: string | null;
  hlsUrl?: string | null;
  thumbnail?: string | null;
  followersCount?: number;
  verified?: boolean;
  bio?: string | null;
  chatroomId?: number;
  isMature?: boolean;
  matureTags?: string[];
  /** Sub-categories for mature content routing (pool-hot-tub, sensual-asmr, etc.) */
  subCategories?: string[];
  /** Which content section this belongs to: 'general' or 'mature' */
  contentSection?: 'general' | 'mature';
  /** If ASMR detected, whether 'general' or 'sensual'; null if not ASMR */
  asmrType?: 'general' | 'sensual' | null;
  /** Consecutive days the streamer has been live */
  liveStreak?: number;
  /** Minutes since stream started (computed from startedAt) */
  uptimeMinutes?: number;
  /** Tags from the stream/livestream data */
  tags?: string[];
  /** Language code (e.g., 'en', 'es', 'fr') from livestream data */
  language?: string;
  /** Whether this stream is classified as gambling content (for UI warnings/blurred thumbnails) */
  isGambling?: boolean;
}

export interface ChatMessage {
  id: string;
  username: string;
  displayName: string;
  content: string;
  color: string;
  badges?: string[];
  emotes?: Emote[];
  timestamp: number;
  isAction?: boolean;
}

export interface Emote {
  id: string;
  name: string;
  url: string;
  provider: '7tv' | 'bttv' | 'ffz' | 'kick';
  width?: number;
  height?: number;
}

export interface StreamStats {
  bitrate: number;
  resolution: { width: number; height: number };
  fps: number;
  bufferLength: number;
  latency: number;
  droppedFrames: number;
  bandwidth: number;
  timestamp: number;
}

export type GridLayout = '1x1' | '1+2' | '2+1' | '2x2' | '1+3' | '1+1+2' | '3x3';

export type ThemeMode = 'dark' | 'light' | 'system';

export type AccentColor = 'red' | 'orange' | 'purple' | 'blue' | 'green' | 'cyan' | 'pink' | 'default';

export type UIDensity = 'compact' | 'comfortable' | 'spacious';

export type LatencyMode = 'low' | 'normal' | 'dvr';

export type AudioMode = 'normal' | 'audioOnly';

export type DefaultQuality = 'auto' | '1080p' | '720p' | '480p' | '360p' | '160p';

export interface AppSettings {
  theme: ThemeMode;
  accentColor: AccentColor;
  uiDensity: UIDensity;
  theaterMode: boolean;
  chatVisible: boolean;
  chatPosition: 'right' | 'left';
  chatFontSize: number;
  chatEmoteSize: 'small' | 'medium' | 'large';
  chatShowTimestamps: boolean;
  chatFilters: ChatFilter[];
  keyboardShortcuts: Record<string, string>;
  notificationsEnabled: boolean;
  notificationSound: boolean;
  autoTheater: boolean;
  minLatencyMode: boolean;
  defaultLayout: GridLayout;
  defaultQuality: DefaultQuality;
  autoPlayOnAdd: boolean;
  autoFullscreenOnSingle: boolean;
  pipOnMinimize: boolean;
  volume: number;
  muted: boolean;
  audioMode: AudioMode;
  streamSyncEnabled: boolean;
  showMatureContent: boolean;
  showViewerDeltas: boolean;
  reducedMotion: boolean;
  showUptimeBadges: boolean;
  compactCards: boolean;
  // Accessibility
  highContrastMode: boolean;
  largeChatFonts: boolean;
  screenReaderMode: boolean;
  colorblindMode: 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia';
  focusIndicators: boolean;
}

export interface ChatFilter {
  id: string;
  type: 'word' | 'user' | 'regex';
  value: string;
  enabled: boolean;
}

export interface LiveNotification {
  id: string;
  channelId: string;
  channelName: string;
  message: string;
  timestamp: number;
  read: boolean;
}

export interface DownloadItem {
  id: string;
  channelName: string;
  hlsUrl: string;
  format: 'm3u8' | 'metadata' | 'mp4' | 'clip';
  status: 'pending' | 'downloading' | 'recording' | 'completed' | 'failed';
  progress?: number;
  createdAt: number;
  duration?: number;
}

export interface CategoryItem {
  id: string;
  name: string;
  slug: string;
  imageUrl?: string | null;
  viewerCount?: number;
  channels?: number;
  tags?: string[];
  isMature?: boolean;
  parentCategory?: string | null;
  parentIcon?: string | null;
  bannerUrl?: string | null;
  /** Sub-categories for mature content routing */
  subCategories?: string[];
  /** Which content section this belongs to: 'general' or 'mature' */
  contentSection?: 'general' | 'mature';
  /** If ASMR detected, whether 'general' or 'sensual'; null if not ASMR */
  asmrType?: 'general' | 'sensual' | null;
}

// ─── New Feature Types ──────────────────────────────────────────────────────

export type ClipDurationOption = 15 | 30 | 60;

export type RecordingFormat = 'webm' | 'mp4';

export interface ClipData {
  id: string;
  channelName: string;
  startTime: number;
  endTime: number;
  duration: number;
  thumbnailUrl?: string;
  blobUrl?: string;
  blob?: Blob;
  mimeType?: string;
  format?: RecordingFormat;
  createdAt: number;
}

export interface RecordingSession {
  id: string;
  channelName: string;
  channelSlug: string;
  hlsUrl: string;
  startedAt: number;
  segments: RecordingSegment[];
  status: 'recording' | 'paused' | 'stopped' | 'processing' | 'completed' | 'failed';
  totalSize: number;
  outputUrl?: string;
  format?: RecordingFormat;
  mimeType?: string;
}

export interface RecordingSegment {
  index: number;
  url: string;
  duration: number;
  size: number;
  timestamp: number;
  blob?: Blob;
}

export interface RecordingProgress {
  segmentCount: number;
  estimatedSize: number; // bytes
  duration: number; // seconds
  format: RecordingFormat;
  mimeType: string;
}

export interface StreamSyncState {
  enabled: boolean;
  referenceStreamId: string | null;
  maxLatencyDiff: number; // ms
  syncedStreamIds: string[];
}

export interface DVRSegment {
  index: number;
  startTime: number;
  duration: number;
  url: string;
  loaded: boolean;
}

export interface DVRWindow {
  startTime: number;
  endTime: number;
  duration: number;
  liveEdge: number;
  segments: DVRSegment[];
}
