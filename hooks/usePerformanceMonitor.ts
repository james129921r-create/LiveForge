'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * usePerformanceMonitor — Monitors various performance metrics.
 *
 * - Memory usage (if available via performance.memory)
 * - Number of active HLS streams
 * - Number of active chat connections
 * - DOM node count
 * - FPS (using requestAnimationFrame)
 * - Network usage estimate
 * - Per-stream memory estimate
 * - Memory pressure alerts
 */

export interface PerformanceMetrics {
  jsHeapUsed: number;
  jsHeapTotal: number;
  jsHeapLimit: number;
  memoryUsagePercent: number;
  fps: number;
  domNodes: number;
  activeHlsStreams: number;
  activeChatConnections: number;
  networkDownlink: number;
  networkRTT: number;
  networkEffectiveType: string;
  networkSaveData: boolean;
  resourceCount: number;
  transferSize: number;
  /** Estimated memory per active stream (bytes) */
  perStreamMemoryEstimate: number;
  /** Whether total memory exceeds the alert threshold */
  memoryAlert: boolean;
  /** Human-readable memory alert message, if any */
  memoryAlertMessage: string | null;
}

export interface MemoryStats {
  jsHeapUsed: number;
  jsHeapTotal: number;
  jsHeapLimit: number;
  memoryUsagePercent: number;
  perStreamMemoryEstimate: number;
  memoryAlert: boolean;
  activeHlsStreams: number;
}

/** Memory alert threshold: 500MB */
const MEMORY_ALERT_THRESHOLD = 500 * 1024 * 1024;

// ─── Global Memory Stats Getter ────────────────────────────────────────────────

let latestMemoryStats: MemoryStats = {
  jsHeapUsed: 0,
  jsHeapTotal: 0,
  jsHeapLimit: 0,
  memoryUsagePercent: 0,
  perStreamMemoryEstimate: 0,
  memoryAlert: false,
  activeHlsStreams: 0,
};

/**
 * Get the latest memory statistics without needing a hook.
 * Useful for monitoring outside React components.
 */
export function getMemoryStats(): MemoryStats {
  return { ...latestMemoryStats };
}

export function usePerformanceMonitor(intervalMs = 2000): {
  metrics: PerformanceMetrics | null;
  refresh: () => void;
} {
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fpsRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0);
  const lastFpsTimeRef = useRef<number>(performance.now());

  // FPS measurement using requestAnimationFrame
  useEffect(() => {
    let rafId: number;
    const measureFps = (now: number) => {
      frameCountRef.current++;
      const elapsed = now - lastFpsTimeRef.current;
      if (elapsed >= 1000) {
        fpsRef.current = Math.round((frameCountRef.current / elapsed) * 1000);
        frameCountRef.current = 0;
        lastFpsTimeRef.current = now;
      }
      rafId = requestAnimationFrame(measureFps);
    };
    rafId = requestAnimationFrame(measureFps);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const collectMetrics = useCallback(() => {
    const perf = performance as Performance & {
      memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };
    };

    const nav = navigator as Navigator & {
      connection?: {
        downlink: number;
        rtt: number;
        effectiveType: string;
        saveData: boolean;
      };
      deviceMemory?: number;
    };

    const domNodes = document.querySelectorAll('*').length;

    // Count active HLS streams (video elements with src)
    const videoElements = document.querySelectorAll('video');
    const activeHlsStreams = Array.from(videoElements).filter(
      (v) => v.src || v.querySelector('source') || v.srcObject
    ).length;

    // Count active chat connections (approximate from chat store)
    let activeChatConnections = 0;
    try {
      const chatState = document.querySelector('[data-chat-connections]');
      activeChatConnections = chatState
        ? parseInt(chatState.getAttribute('data-chat-connections') || '0', 10)
        : 0;
    } catch {
      activeChatConnections = document.querySelectorAll('[data-connection-status="connected"]').length;
    }

    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    const transferSize = resources.reduce((acc, r) => acc + (r.transferSize || 0), 0);

    const jsHeapUsed = perf.memory?.usedJSHeapSize ?? 0;
    const jsHeapTotal = perf.memory?.totalJSHeapSize ?? 0;
    const jsHeapLimit = perf.memory?.jsHeapSizeLimit ?? 0;
    const memoryUsagePercent = perf.memory
      ? Math.round((perf.memory.usedJSHeapSize / perf.memory.jsHeapSizeLimit) * 100)
      : 0;

    // Per-stream memory estimate based on heap usage and active streams
    const perStreamMemoryEstimate = activeHlsStreams > 0
      ? Math.round(jsHeapUsed / activeHlsStreams)
      : 0;

    // Memory alert: when total JS heap exceeds 500MB
    const memoryAlert = jsHeapUsed > MEMORY_ALERT_THRESHOLD;
    let memoryAlertMessage: string | null = null;
    if (memoryAlert) {
      const usedMB = Math.round(jsHeapUsed / (1024 * 1024));
      memoryAlertMessage = `High memory usage: ${usedMB}MB. Consider closing some streams to free resources.`;
    }

    // Update global memory stats
    latestMemoryStats = {
      jsHeapUsed,
      jsHeapTotal,
      jsHeapLimit,
      memoryUsagePercent,
      perStreamMemoryEstimate,
      memoryAlert,
      activeHlsStreams,
    };

    setMetrics({
      jsHeapUsed,
      jsHeapTotal,
      jsHeapLimit,
      memoryUsagePercent,
      fps: fpsRef.current,
      domNodes,
      activeHlsStreams,
      activeChatConnections,
      networkDownlink: nav.connection?.downlink ?? 0,
      networkRTT: nav.connection?.rtt ?? 0,
      networkEffectiveType: nav.connection?.effectiveType ?? 'unknown',
      networkSaveData: nav.connection?.saveData ?? false,
      resourceCount: resources.length,
      transferSize,
      perStreamMemoryEstimate,
      memoryAlert,
      memoryAlertMessage,
    });
  }, []);

  useEffect(() => {
    collectMetrics();
    intervalRef.current = setInterval(collectMetrics, intervalMs);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [collectMetrics, intervalMs]);

  return {
    metrics,
    refresh: collectMetrics,
  };
}
