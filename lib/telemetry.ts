/**
 * LiveForge Error Telemetry
 *
 * Provides structured error reporting and performance monitoring.
 * Supports Sentry for crash/error reporting and custom telemetry
 * for player diagnostics, HLS failures, and memory monitoring.
 *
 * In production, set NEXT_PUBLIC_SENTRY_DSN to enable Sentry.
 * Without it, telemetry falls back to console logging.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TelemetryEvent {
  type: 'error' | 'performance' | 'player' | 'cast' | 'hls' | 'memory' | 'chat';
  action: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
  severity?: 'info' | 'warning' | 'error' | 'critical';
}

export interface PlayerCrashReport {
  hlsUrl?: string;
  errorType: 'network' | 'media' | 'manifest' | 'key' | 'mux' | 'unknown';
  errorMessage: string;
  latencyMode: string;
  audioMode: string;
  bitrate?: number;
  resolution?: string;
  bufferLength?: number;
  liveLatency?: number;
  droppedFrames?: number;
}

export interface MemorySnapshot {
  jsHeapUsed?: number;
  jsHeapTotal?: number;
  domNodes?: number;
  timestamp: number;
}

// ─── Telemetry Provider ───────────────────────────────────────────────────────

type TelemetryListener = (event: TelemetryEvent) => void;

const listeners: TelemetryListener[] = [];
const eventBuffer: TelemetryEvent[] = [];
const MAX_BUFFER = 200;

// ─── Telemetry Deduplication ──────────────────────────────────────────────────

// Track recently emitted events to avoid spamming the console with identical errors
const recentEventKeys = new Map<string, number>(); // key -> timestamp
const DEDUP_WINDOW_MS = 10_000; // 10 seconds — don't emit the same event twice within this window
const MAX_DEDUP_KEYS = 50; // Prevent memory leaks

/**
 * Check if Sentry DSN is configured
 */
function isSentryConfigured(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(process.env.NEXT_PUBLIC_SENTRY_DSN);
}

/**
 * Generate a deduplication key for an event.
 * Events with the same type + action + key metadata are considered duplicates.
 */
function getEventDedupKey(event: Omit<TelemetryEvent, 'timestamp'>): string {
  // For error/critical events, include the action and a subset of metadata for dedup
  const metaKeys = event.metadata
    ? Object.entries(event.metadata)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${v}`)
        .join('&')
    : '';
  return `${event.type}:${event.action}:${metaKeys}`;
}

/**
 * Prune old dedup keys to prevent memory leaks.
 */
function pruneDedupKeys(): void {
  const now = Date.now();
  for (const [key, timestamp] of recentEventKeys) {
    if (now - timestamp > DEDUP_WINDOW_MS) {
      recentEventKeys.delete(key);
    }
  }
  // If still too many keys, remove the oldest
  if (recentEventKeys.size > MAX_DEDUP_KEYS) {
    const entries = [...recentEventKeys.entries()].sort(([, a], [, b]) => a - b);
    const toRemove = entries.slice(0, entries.length - MAX_DEDUP_KEYS);
    for (const [key] of toRemove) {
      recentEventKeys.delete(key);
    }
  }
}

/**
 * Record a telemetry event
 */
export function recordEvent(event: Omit<TelemetryEvent, 'timestamp'>): void {
  const fullEvent: TelemetryEvent = {
    ...event,
    timestamp: Date.now(),
    severity: event.severity || 'info',
  };

  // Buffer the event (always, for diagnostics panel)
  eventBuffer.push(fullEvent);
  if (eventBuffer.length > MAX_BUFFER) {
    eventBuffer.shift();
  }

  // Deduplicate console output for error/critical events to avoid spam
  const isHighSeverity = fullEvent.severity === 'error' || fullEvent.severity === 'critical';
  const dedupKey = getEventDedupKey(event);
  const now = Date.now();
  const lastSeen = recentEventKeys.get(dedupKey);
  const isDuplicate = isHighSeverity && lastSeen !== undefined && (now - lastSeen) < DEDUP_WINDOW_MS;

  if (isHighSeverity) {
    recentEventKeys.set(dedupKey, now);
    pruneDedupKeys();
  }

  // Notify listeners (always, even for deduplicated events — listeners may need all events)
  for (const listener of listeners) {
    try {
      listener(fullEvent);
    } catch {
      // Listener errors should not crash the app
    }
  }

  // Console logging in development (skip if duplicate)
  // HLS/player errors are very frequent during normal operation (stream offline,
  // reconnecting, etc.) — only log them at debug level to avoid console spam.
  if (process.env.NODE_ENV === 'development' && !isDuplicate) {
    const prefix = `[Telemetry:${fullEvent.type}]`;
    const isPlayerNoise = (fullEvent.type === 'hls' || fullEvent.type === 'player') &&
      (fullEvent.action === 'error' || fullEvent.action === 'fatal_error' || fullEvent.action === 'crash');

    if (isPlayerNoise) {
      // Log player/HLS errors at debug level — they're expected during normal operation
      // (stream offline, reconnecting, etc.) and shouldn't fill the console.
      console.info(prefix, fullEvent.action, fullEvent.metadata);
    } else {
      switch (fullEvent.severity) {
        case 'critical':
          console.error(prefix, fullEvent.action, fullEvent.metadata);
          break;
        case 'error':
          console.error(prefix, fullEvent.action, fullEvent.metadata);
          break;
        case 'warning':
          console.warn(prefix, fullEvent.action, fullEvent.metadata);
          break;
        default:
          console.log(prefix, fullEvent.action, fullEvent.metadata);
      }
    }
  }
}

/**
 * Record a player crash
 */
export function recordPlayerCrash(report: PlayerCrashReport): void {
  recordEvent({
    type: 'player',
    action: 'crash',
    severity: 'critical',
    metadata: {
      errorType: report.errorType,
      errorMessage: report.errorMessage,
      latencyMode: report.latencyMode,
      audioMode: report.audioMode,
      bitrate: report.bitrate,
      resolution: report.resolution,
      bufferLength: report.bufferLength,
      liveLatency: report.liveLatency,
      droppedFrames: report.droppedFrames,
      hasSentry: isSentryConfigured(),
    },
  });

  // If Sentry is configured, send the crash report
  if (isSentryConfigured() && typeof window !== 'undefined') {
    try {
      import('@sentry/browser').then((Sentry) => {
        Sentry.captureException(new Error(`Player Crash: ${report.errorType}`), {
          tags: {
            section: 'player',
            errorType: report.errorType,
            latencyMode: report.latencyMode,
          },
          extra: {
            ...report,
          } as Record<string, unknown>,
        });
      });
    } catch {
      // Sentry import failed
    }
  }
}

/**
 * Record an HLS error
 */
export function recordHLSError(error: {
  type: string;
  details: string;
  fatal: boolean;
  url?: string;
  latencyMode?: string;
}): void {
  recordEvent({
    type: 'hls',
    action: error.fatal ? 'fatal_error' : 'error',
    severity: error.fatal ? 'critical' : 'warning',
    metadata: {
      hlsErrorType: error.type,
      hlsErrorDetails: error.details,
      fatal: error.fatal,
      url: error.url ? '[redacted]' : undefined,
      latencyMode: error.latencyMode,
    },
  });
}

/**
 * Record a cast failure
 */
export function recordCastFailure(error: {
  action: string;
  errorMessage: string;
  deviceName?: string;
}): void {
  recordEvent({
    type: 'cast',
    action: `failure_${error.action}`,
    severity: 'error',
    metadata: {
      errorMessage: error.errorMessage,
      deviceName: error.deviceName,
    },
  });
}

/**
 * Record a memory snapshot
 */
export function recordMemorySnapshot(): MemorySnapshot | null {
  if (typeof window === 'undefined') return null;

  const perf = performance as unknown as {
    memory?: {
      usedJSHeapSize: number;
      totalJSHeapSize: number;
    };
  };

  const snapshot: MemorySnapshot = {
    jsHeapUsed: perf.memory?.usedJSHeapSize,
    jsHeapTotal: perf.memory?.totalJSHeapSize,
    domNodes: document.querySelectorAll('*').length,
    timestamp: Date.now(),
  };

  // Check for memory pressure
  if (snapshot.jsHeapUsed && snapshot.jsHeapTotal) {
    const usageRatio = snapshot.jsHeapUsed / snapshot.jsHeapTotal;
    if (usageRatio > 0.9) {
      recordEvent({
        type: 'memory',
        action: 'pressure',
        severity: 'warning',
        metadata: {
          usageRatio: (usageRatio * 100).toFixed(1) + '%',
          jsHeapUsed: Math.round(snapshot.jsHeapUsed / 1024 / 1024) + 'MB',
          jsHeapTotal: Math.round(snapshot.jsHeapTotal / 1024 / 1024) + 'MB',
        },
      });
    }
  }

  return snapshot;
}

/**
 * Record chat connection events
 */
export function recordChatEvent(action: 'connect' | 'disconnect' | 'error' | 'reconnect', metadata?: Record<string, unknown>): void {
  recordEvent({
    type: 'chat',
    action,
    // Chat connection errors (Pusher failures) are expected when the WebSocket
    // service is unreachable (sandbox, network restrictions, etc.) — log as
    // warning to avoid noisy console.error output.
    severity: action === 'error' ? 'warning' : 'info',
    metadata,
  });
}

/**
 * Subscribe to telemetry events
 */
export function subscribeToTelemetry(listener: TelemetryListener): () => void {
  listeners.push(listener);
  return () => {
    const index = listeners.indexOf(listener);
    if (index !== -1) listeners.splice(index, 1);
  };
}

/**
 * Get the telemetry event buffer (for diagnostics panel)
 */
export function getTelemetryBuffer(): TelemetryEvent[] {
  return [...eventBuffer];
}

/**
 * Clear the telemetry buffer
 */
export function clearTelemetryBuffer(): void {
  eventBuffer.length = 0;
}

// ─── Memory Monitoring ────────────────────────────────────────────────────────

let memoryMonitorInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start periodic memory monitoring
 */
export function startMemoryMonitoring(intervalMs = 30000): void {
  if (memoryMonitorInterval) return;
  memoryMonitorInterval = setInterval(() => {
    recordMemorySnapshot();
  }, intervalMs);
}

/**
 * Stop periodic memory monitoring
 */
export function stopMemoryMonitoring(): void {
  if (memoryMonitorInterval) {
    clearInterval(memoryMonitorInterval);
    memoryMonitorInterval = null;
  }
}

// ─── Performance Metrics ──────────────────────────────────────────────────────

/**
 * Measure a performance span
 */
export function measurePerformance<T>(
  label: string,
  fn: () => T,
  metadata?: Record<string, unknown>,
): T {
  const start = performance.now();
  try {
    const result = fn();
    const duration = performance.now() - start;
    recordEvent({
      type: 'performance',
      action: label,
      severity: duration > 1000 ? 'warning' : 'info',
      metadata: {
        durationMs: Math.round(duration),
        ...metadata,
      },
    });
    return result;
  } catch (error) {
    const duration = performance.now() - start;
    recordEvent({
      type: 'performance',
      action: `${label}_error`,
      severity: 'error',
      metadata: {
        durationMs: Math.round(duration),
        error: error instanceof Error ? error.message : String(error),
        ...metadata,
      },
    });
    throw error;
  }
}
