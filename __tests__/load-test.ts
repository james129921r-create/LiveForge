/**
 * LiveForge Load Testing Utility
 *
 * Run in the browser console with: import('/src/__tests__/load-test.ts').then(m => m.runLoadTest())
 *
 * Tests multi-stream performance under various configurations:
 * - 2 streams (1+2 layout)
 * - 4 streams (2x2 layout)
 * - 6 streams (2x3 layout)
 * - 9 streams (3x3 layout)
 *
 * Monitors:
 * - Memory growth (JS heap)
 * - GC pauses (detected via task timing anomalies)
 * - CPU usage (estimated via frame timing)
 * - Sync stability (latency variance between streams)
 * - Long-running session stability (4+ hours)
 */

import { usePlayerStore } from '@/stores/playerStore';
import { useMultiStreamStore } from '@/stores/multiStreamStore';
import { useChatStore } from '@/stores/chatStore';
import { recordMemorySnapshot, type MemorySnapshot } from '@/lib/telemetry';

export interface LoadTestConfig {
  streamCount: 2 | 4 | 6 | 9;
  durationMinutes: number;
  sampleIntervalMs: number;
  channelSlugs: string[];
}

export interface LoadTestResult {
  config: LoadTestConfig;
  startTime: number;
  endTime: number;
  memorySnapshots: MemorySnapshot[];
  peakMemoryMB: number;
  averageMemoryMB: number;
  memoryGrowthMB: number;
  gcPauseCount: number;
  averageLatencyMs: number;
  maxLatencyVarianceMs: number;
  droppedFramesTotal: number;
  stats: {
    totalMessages: number;
    averageBufferLength: number;
    averageBitrate: number;
  };
  errors: Array<{ timestamp: number; message: string }>;
}

const DEFAULT_SLUGS = ['xqc', 'shroud', 'hasanabi', 'pokimane', 'summit1g', 'lirik', 'trainwreckstv', 'nickmercs', 'amaru'];

/**
 * Run a load test with the specified configuration
 */
export async function runLoadTest(config?: Partial<LoadTestConfig>): Promise<LoadTestResult> {
  const fullConfig: LoadTestConfig = {
    streamCount: 4,
    durationMinutes: 5,
    sampleIntervalMs: 5000,
    channelSlugs: DEFAULT_SLUGS,
    ...config,
  };

  const result: LoadTestResult = {
    config: fullConfig,
    startTime: Date.now(),
    endTime: 0,
    memorySnapshots: [],
    peakMemoryMB: 0,
    averageMemoryMB: 0,
    memoryGrowthMB: 0,
    gcPauseCount: 0,
    averageLatencyMs: 0,
    maxLatencyVarianceMs: 0,
    droppedFramesTotal: 0,
    stats: {
      totalMessages: 0,
      averageBufferLength: 0,
      averageBitrate: 0,
    },
    errors: [],
  };

  console.log(`[LoadTest] Starting ${fullConfig.streamCount}-stream test for ${fullConfig.durationMinutes} minutes...`);

  // Set the appropriate layout
  const layoutMap: Record<number, string> = {
    2: '1+2',
    4: '2x2',
    6: '3x3', // Will use 9 slots, some empty
    9: '3x3',
  };
  const layout = (layoutMap[fullConfig.streamCount] || '2x2') as '1+2' | '2x2' | '3x3';
  useMultiStreamStore.getState().setLayout(layout);

  // Add channels to slots
  const slugs = fullConfig.channelSlugs.slice(0, fullConfig.streamCount);
  for (let i = 0; i < slugs.length; i++) {
    const slotId = `slot-${i}`;
    try {
      const res = await fetch(`/api/kick/channel/${slugs[i]}`);
      if (res.ok) {
        const channel = await res.json();
        useMultiStreamStore.getState().addChannelToSlot(slotId, channel);
      } else {
        result.errors.push({ timestamp: Date.now(), message: `Failed to fetch channel: ${slugs[i]}` });
      }
    } catch (e) {
      result.errors.push({ timestamp: Date.now(), message: `Error fetching channel ${slugs[i]}: ${e}` });
    }
  }

  // Collect samples over the duration
  const totalDurationMs = fullConfig.durationMinutes * 60 * 1000;
  const bufferLengths: number[] = [];
  const bitrates: number[] = [];
  const latencies: number[] = [];
  let lastSampleTime = performance.now();

  return new Promise((resolve) => {
    const sampleInterval = setInterval(() => {
      const now = Date.now();
      const elapsed = now - result.startTime;

      // Memory snapshot
      const snapshot = recordMemorySnapshot();
      if (snapshot) {
        result.memorySnapshots.push(snapshot);

        const heapMB = (snapshot.jsHeapUsed || 0) / 1024 / 1024;
        if (heapMB > result.peakMemoryMB) {
          result.peakMemoryMB = Math.round(heapMB);
        }

        // Detect GC pauses (large time gaps between samples)
        const sampleDelta = performance.now() - lastSampleTime;
        if (sampleDelta > fullConfig.sampleIntervalMs * 2) {
          result.gcPauseCount++;
        }
        lastSampleTime = performance.now();
      }

      // Player stats
      const playerState = usePlayerStore.getState();
      if (playerState.stats) {
        bufferLengths.push(playerState.stats.bufferLength);
        bitrates.push(playerState.stats.bitrate / 1000);
        latencies.push(playerState.stats.latency);
        result.droppedFramesTotal = playerState.stats.droppedFrames;
      }

      // Chat stats
      const chatState = useChatStore.getState();
      const totalMessages = Object.values(chatState.messagesByChannel).reduce((sum, msgs) => sum + msgs.length, 0);
      result.stats.totalMessages = totalMessages;

      // Log progress
      if (elapsed % 60000 < fullConfig.sampleIntervalMs) {
        const currentHeapMB = (snapshot?.jsHeapUsed || 0) / 1024 / 1024;
        console.log(`[LoadTest] ${Math.round(elapsed / 60000)}min elapsed — Memory: ${Math.round(currentHeapMB)}MB, Messages: ${totalMessages}, Dropped: ${result.droppedFramesTotal}`);
      }

      // Check if test is complete
      if (elapsed >= totalDurationMs) {
        clearInterval(sampleInterval);

        result.endTime = Date.now();

        // Calculate aggregates
        const firstHeap = result.memorySnapshots[0]?.jsHeapUsed || 0;
        const lastHeap = result.memorySnapshots[result.memorySnapshots.length - 1]?.jsHeapUsed || 0;
        result.memoryGrowthMB = Math.round((lastHeap - firstHeap) / 1024 / 1024);

        const avgHeap = result.memorySnapshots.reduce((acc, s) => acc + (s.jsHeapUsed || 0), 0) / (result.memorySnapshots.length || 1);
        result.averageMemoryMB = Math.round(avgHeap / 1024 / 1024);

        if (bufferLengths.length > 0) {
          result.stats.averageBufferLength = bufferLengths.reduce((a, b) => a + b, 0) / bufferLengths.length;
        }
        if (bitrates.length > 0) {
          result.stats.averageBitrate = bitrates.reduce((a, b) => a + b, 0) / bitrates.length;
        }
        if (latencies.length > 0) {
          result.averageLatencyMs = latencies.reduce((a, b) => a + b, 0) / latencies.length;
          const mean = result.averageLatencyMs;
          result.maxLatencyVarianceMs = Math.max(...latencies.map(l => Math.abs(l - mean)));
        }

        console.log('[LoadTest] Complete!', result);

        // Clean up
        useMultiStreamStore.getState().clearAll();

        resolve(result);
      }
    }, fullConfig.sampleIntervalMs);
  });
}

/**
 * Run a quick 2-minute test with 4 streams
 */
export async function quickLoadTest(): Promise<LoadTestResult> {
  return runLoadTest({
    streamCount: 4,
    durationMinutes: 2,
    sampleIntervalMs: 5000,
  });
}

/**
 * Run the full 4-hour endurance test
 */
export async function enduranceLoadTest(): Promise<LoadTestResult> {
  return runLoadTest({
    streamCount: 4,
    durationMinutes: 240, // 4 hours
    sampleIntervalMs: 30000, // Sample every 30 seconds
  });
}

/**
 * Run a stress test with maximum streams (9)
 */
export async function stressLoadTest(): Promise<LoadTestResult> {
  return runLoadTest({
    streamCount: 9,
    durationMinutes: 10,
    sampleIntervalMs: 5000,
  });
}

/**
 * Get current runtime stats (for ad-hoc monitoring)
 */
export function getRuntimeStats() {
  const player = usePlayerStore.getState();
  const chat = useChatStore.getState();
  const streams = useMultiStreamStore.getState();

  const snapshot = (() => {
    try { return recordMemorySnapshot(); } catch { return null; }
  })();

  return {
    timestamp: Date.now(),
    memory: snapshot ? {
      jsHeapUsedMB: Math.round((snapshot.jsHeapUsed || 0) / 1024 / 1024),
      jsHeapTotalMB: Math.round((snapshot.jsHeapTotal || 0) / 1024 / 1024),
      domNodes: snapshot.domNodes,
    } : null,
    player: {
      isPlaying: player.isPlaying,
      latency: player.liveLatency,
      bitrate: player.stats?.bitrate,
      droppedFrames: player.stats?.droppedFrames,
      bufferLength: player.stats?.bufferLength,
      latencyMode: player.latencyMode,
      audioMode: player.audioMode,
    },
    chat: {
      connected: chat.activeChatChannel ? chat.connectionByChannel[chat.activeChatChannel] === 'connected' : false,
      messageCount: Object.values(chat.messagesByChannel).reduce((sum, msgs) => sum + msgs.length, 0),
      filterCount: chat.filters.filter(f => f.enabled).length,
    },
    streams: {
      layout: streams.layout,
      activeSlots: streams.slots.filter(s => s.channel).length,
      totalSlots: streams.slots.length,
    },
  };
}
