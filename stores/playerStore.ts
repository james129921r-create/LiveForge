import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { StreamStats, AudioMode, LatencyMode, ClipData, DVRWindow, RecordingFormat, ClipDurationOption } from '@/types';

interface PlayerState {
  isPlaying: boolean;
  isMuted: boolean;
  volume: number;
  isTheaterMode: boolean;
  isPiP: boolean;
  isFullscreen: boolean;
  latencyMode: LatencyMode;
  audioMode: AudioMode;
  liveLatency: number;
  stats: StreamStats | null;
  statsHistory: StreamStats[];
  dvrPosition: number;
  dvrDuration: number;
  isDvrAvailable: boolean;
  dvrWindow: DVRWindow | null;

  // Clips buffer — stores the last N seconds of stats/timestamps for clip creation
  clipBuffer: ClipData[];
  isRecording: boolean;
  isRecordingPaused: boolean;
  recordingId: string | null;
  recordingDuration: number; // seconds
  recordingFormat: RecordingFormat;
  recordingBlob: Blob | null;
  recordingUrl: string | null;
  clipDuration: ClipDurationOption;

  // Stream sync
  streamSyncEnabled: boolean;
  streamLatencies: Record<string, number>; // slotId -> latency in ms

  // ─── Per-stream Audio Mixer ─────────────────────────────────────────────
  perStreamVolume: Record<string, number>; // slotId -> volume (0-1)
  perStreamMuted: Record<string, boolean>; // slotId -> muted
  audioPrioritySlot: string | null; // slot that gets priority
  soloSlotId: string | null; // only this slot has audio

  // ─── Audio Ducking & Persistence ─────────────────────────────────────────
  audioDuckingEnabled: boolean; // when enabled, duck non-priority streams
  persistMixerState: boolean; // whether to persist mixer state to workspace

  // ─── Auto-Record ─────────────────────────────────────────────────────────
  autoRecord: boolean; // auto-start recording when a stream goes live
  recordingQueue: string[]; // queue of channel slugs to auto-record
  perChannelAutoRecord: Record<string, boolean>; // per-channel auto-record toggle

  // ─── Clip Library ────────────────────────────────────────────────────────
  clipLibrary: ClipData[]; // persistent clip library (persisted to localStorage)

  // Actions
  setPlaying: (playing: boolean) => void;
  setMuted: (muted: boolean) => void;
  setVolume: (volume: number) => void;
  toggleTheaterMode: () => void;
  setPiP: (pip: boolean) => void;
  setFullscreen: (fs: boolean) => void;
  setLatencyMode: (mode: LatencyMode) => void;
  setAudioMode: (mode: AudioMode) => void;
  setLiveLatency: (latency: number) => void;
  updateStats: (stats: StreamStats) => void;
  setDvrPosition: (position: number) => void;
  setDvrDuration: (duration: number) => void;
  setDvrAvailable: (available: boolean) => void;
  setDvrWindow: (window: DVRWindow | null) => void;
  addClip: (clip: ClipData) => void;
  removeClip: (clipId: string) => void;
  setRecording: (recording: boolean, id?: string | null) => void;
  setRecordingPaused: (paused: boolean) => void;
  setRecordingDuration: (duration: number) => void;
  setRecordingFormat: (format: RecordingFormat) => void;
  setRecordingBlob: (blob: Blob | null) => void;
  setRecordingUrl: (url: string | null) => void;
  setClipDuration: (duration: ClipDurationOption) => void;
  setStreamSyncEnabled: (enabled: boolean) => void;
  updateStreamLatency: (slotId: string, latency: number) => void;

  // ─── Per-stream Audio Mixer Actions ──────────────────────────────────────
  setStreamVolume: (slotId: string, volume: number) => void;
  setStreamMuted: (slotId: string, muted: boolean) => void;
  setAudioPrioritySlot: (slotId: string | null) => void;
  setSoloSlot: (slotId: string | null) => void;

  // ─── Audio Ducking & Persistence Actions ──────────────────────────────────
  setAudioDuckingEnabled: (enabled: boolean) => void;
  setPersistMixerState: (enabled: boolean) => void;
  resetMixer: () => void;

  // ─── Auto-Record Actions ──────────────────────────────────────────────────
  setAutoRecord: (enabled: boolean) => void;
  addToRecordingQueue: (slug: string) => void;
  removeFromRecordingQueue: (slug: string) => void;
  setPerChannelAutoRecord: (slug: string, enabled: boolean) => void;

  // ─── Clip Library Actions ─────────────────────────────────────────────────
  addToClipLibrary: (clip: ClipData) => void;
  removeFromClipLibrary: (clipId: string) => void;

  reset: () => void;
}

const initialState = {
  isPlaying: false,
  isMuted: false,
  volume: 0.75,
  isTheaterMode: false,
  isPiP: false,
  isFullscreen: false,
  latencyMode: 'normal' as const,
  audioMode: 'normal' as const,
  liveLatency: 0,
  stats: null,
  statsHistory: [],
  dvrPosition: 0,
  dvrDuration: 0,
  isDvrAvailable: false,
  dvrWindow: null,
  clipBuffer: [],
  isRecording: false,
  isRecordingPaused: false,
  recordingId: null,
  recordingDuration: 0,
  recordingFormat: 'webm' as RecordingFormat,
  recordingBlob: null,
  recordingUrl: null,
  clipDuration: 30 as ClipDurationOption,
  streamSyncEnabled: false,
  streamLatencies: {},

  // Per-stream audio mixer defaults
  perStreamVolume: {},
  perStreamMuted: {},
  audioPrioritySlot: null,
  soloSlotId: null,

  // Audio ducking & persistence defaults
  audioDuckingEnabled: false,
  persistMixerState: true,

  // Auto-record defaults
  autoRecord: false,
  recordingQueue: [],
  perChannelAutoRecord: {},

  // Clip library
  clipLibrary: [],
};

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set) => ({
      ...initialState,

      setPlaying: (playing) => set({ isPlaying: playing }),
      setMuted: (muted) => set({ isMuted: muted }),
      setVolume: (volume) => set({ volume }),
      toggleTheaterMode: () => set((s) => ({ isTheaterMode: !s.isTheaterMode })),
      setPiP: (pip) => set({ isPiP: pip }),
      setFullscreen: (fs) => set({ isFullscreen: fs }),
      setLatencyMode: (mode) => set({ latencyMode: mode }),
      setAudioMode: (mode) => set({ audioMode: mode }),
      setLiveLatency: (latency) => set({ liveLatency: latency }),
      updateStats: (stats) =>
        set((s) => ({
          stats,
          statsHistory: [...s.statsHistory.slice(-59), stats],
        })),
      setDvrPosition: (position) => set({ dvrPosition: position }),
      setDvrDuration: (duration) => set({ dvrDuration: duration }),
      setDvrAvailable: (available) => set({ isDvrAvailable: available }),
      setDvrWindow: (window) => set({ dvrWindow: window }),
      addClip: (clip) => set((s) => ({ clipBuffer: [...s.clipBuffer, clip].slice(-10) })),
      removeClip: (clipId) => set((s) => ({ clipBuffer: s.clipBuffer.filter((c) => c.id !== clipId) })),
      setRecording: (recording, id) => set({ isRecording: recording, recordingId: id ?? null }),
      setRecordingPaused: (paused) => set({ isRecordingPaused: paused }),
      setRecordingDuration: (duration) => set({ recordingDuration: duration }),
      setRecordingFormat: (format) => set({ recordingFormat: format }),
      setRecordingBlob: (blob) => set({ recordingBlob: blob }),
      setRecordingUrl: (url) => {
        // Revoke the previous Blob URL to prevent memory leaks
        const prev = get().recordingUrl;
        if (prev && prev.startsWith('blob:')) {
          try { URL.revokeObjectURL(prev); } catch { /* ignore */ }
        }
        set({ recordingUrl: url });
      },
      setClipDuration: (duration) => set({ clipDuration: duration }),
      setStreamSyncEnabled: (enabled) => set({ streamSyncEnabled: enabled }),
      updateStreamLatency: (slotId, latency) =>
        set((s) => ({
          streamLatencies: { ...s.streamLatencies, [slotId]: latency },
        })),

      // ─── Per-stream Audio Mixer Actions ──────────────────────────────────────

      setStreamVolume: (slotId, volume) =>
        set((s) => ({
          perStreamVolume: { ...s.perStreamVolume, [slotId]: Math.max(0, Math.min(1, volume)) },
        })),

      setStreamMuted: (slotId, muted) =>
        set((s) => ({
          perStreamMuted: { ...s.perStreamMuted, [slotId]: muted },
        })),

      setAudioPrioritySlot: (slotId) =>
        set({ audioPrioritySlot: slotId }),

      setSoloSlot: (slotId) =>
        set({ soloSlotId: slotId }),

      // ─── Audio Ducking & Persistence Actions ──────────────────────────────────

      setAudioDuckingEnabled: (enabled) =>
        set({ audioDuckingEnabled: enabled }),

      setPersistMixerState: (enabled) =>
        set({ persistMixerState: enabled }),

      resetMixer: () =>
        set({
          perStreamVolume: {},
          perStreamMuted: {},
          audioPrioritySlot: null,
          soloSlotId: null,
        }),

      // ─── Auto-Record Actions ──────────────────────────────────────────────────

      setAutoRecord: (enabled) => set({ autoRecord: enabled }),

      addToRecordingQueue: (slug) =>
        set((s) => ({
          recordingQueue: s.recordingQueue.includes(slug)
            ? s.recordingQueue
            : [...s.recordingQueue, slug],
        })),

      removeFromRecordingQueue: (slug) =>
        set((s) => ({
          recordingQueue: s.recordingQueue.filter((item) => item !== slug),
        })),

      setPerChannelAutoRecord: (slug, enabled) =>
        set((s) => ({
          perChannelAutoRecord: { ...s.perChannelAutoRecord, [slug]: enabled },
        })),

      // ─── Clip Library Actions ─────────────────────────────────────────────────

      addToClipLibrary: (clip) =>
        set((s) => ({
          clipLibrary: [...s.clipLibrary, clip].slice(-100), // Keep last 100 clips
        })),

      removeFromClipLibrary: (clipId) =>
        set((s) => ({
          clipLibrary: s.clipLibrary.filter((c) => c.id !== clipId),
        })),

      reset: () => {
        // Revoke Blob URL to prevent memory leak
        const current = get();
        if (current.recordingUrl && current.recordingUrl.startsWith('blob:')) {
          try { URL.revokeObjectURL(current.recordingUrl); } catch { /* ignore */ }
        }
        set(initialState);
      },
    }),
    {
      name: 'liveforge-player',
      // Only persist specific fields (not Blob objects or runtime state)
      partialize: (state) => ({
        autoRecord: state.autoRecord,
        recordingQueue: state.recordingQueue,
        perChannelAutoRecord: state.perChannelAutoRecord,
        clipLibrary: state.clipLibrary.map(c => ({
          id: c.id,
          channelName: c.channelName,
          startTime: c.startTime,
          endTime: c.endTime,
          duration: c.duration,
          thumbnailUrl: c.thumbnailUrl,
          mimeType: c.mimeType,
          format: c.format,
          createdAt: c.createdAt,
          // Don't persist blob or blobUrl — they're runtime-only
        })),
        volume: state.volume,
        isMuted: state.isMuted,
        latencyMode: state.latencyMode,
        audioMode: state.audioMode,
        streamSyncEnabled: state.streamSyncEnabled,
        perStreamVolume: state.perStreamVolume,
        perStreamMuted: state.perStreamMuted,
        audioPrioritySlot: state.audioPrioritySlot,
        audioDuckingEnabled: state.audioDuckingEnabled,
        persistMixerState: state.persistMixerState,
        clipDuration: state.clipDuration,
      }),
    }
  )
);
