'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { usePlayerStore } from '@/stores/playerStore';
import { useMultiStreamStore } from '@/stores/multiStreamStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useChatStore } from '@/stores/chatStore';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Activity, Cpu, HardDrive, Wifi, Monitor, Clock,
  AlertTriangle, CheckCircle, XCircle, RefreshCw,
  ChevronDown, ChevronUp, Copy,
} from 'lucide-react';

interface PerformanceMetrics {
  jsHeapUsed: number;
  jsHeapTotal: number;
  jsHeapLimit: number;
  memoryUsagePercent: number;
  fps: number;
  networkDownlink: number;
  networkRTT: number;
  networkEffectiveType: string;
  networkSaveData: boolean;
  resourceCount: number;
  transferSize: number;
  domNodes: number;
  layoutShifts: number;
  longTasks: number;
}

interface CastStatus {
  available: boolean;
  connected: boolean;
  deviceName: string | null;
  protocol: string | null;
}

interface StreamUptime {
  slotId: string;
  channelName: string;
  uptime: number;
  startedAt: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatLatency(ms: number): string {
  if (ms <= 0) return '--';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function HealthIndicator({ value, thresholds }: { value: number; thresholds: { good: number; warn: number } }) {
  if (value <= thresholds.good) {
    return <span className="text-green-400"><CheckCircle className="h-3 w-3 inline mr-1" />Good</span>;
  }
  if (value <= thresholds.warn) {
    return <span className="text-yellow-400"><AlertTriangle className="h-3 w-3 inline mr-1" />Fair</span>;
  }
  return <span className="text-red-400"><XCircle className="h-3 w-3 inline mr-1" />Poor</span>;
}

export function DiagnosticsPanel() {
  const { stats, statsHistory, liveLatency, latencyMode, isDvrAvailable, dvrDuration, dvrPosition, streamSyncEnabled, streamLatencies, isRecording, isPiP, audioMode } = usePlayerStore();
  const { slots, layout, activeSlotId } = useMultiStreamStore();
  const { theme, chatVisible, chatPosition } = useSettingsStore();
  const { connectionByChannel, messagesByChannel, activeChatChannel, emoteSets } = useChatStore();
  // Derive backward-compatible values
  const chatConnected = activeChatChannel ? connectionByChannel[activeChatChannel] === 'connected' : false;
  const chatMessages = activeChatChannel ? (messagesByChannel[activeChatChannel] || []) : [];

  const [perfMetrics, setPerfMetrics] = useState<PerformanceMetrics | null>(null);
  const [castStatus, setCastStatus] = useState<CastStatus>({ available: false, connected: false, deviceName: null, protocol: null });
  const [streamUptimes, setStreamUptimes] = useState<StreamUptime[]>([]);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    playback: true,
    network: true,
    performance: true,
    cast: true,
    streams: true,
    app: true,
    graph: false,
  });
  const [autoRefresh, setAutoRefresh] = useState(true);
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

    let layoutShifts = 0;
    try {
      const clsEntries = performance.getEntriesByType('layout-shift') as PerformanceEntry[];
      layoutShifts = clsEntries.filter((e: PerformanceEntry & { hadRecentInput?: boolean }) => !(e as PerformanceEntry & { hadRecentInput?: boolean }).hadRecentInput).length;
    } catch { /* Not supported */ }

    let longTasks = 0;
    try {
      const ltEntries = performance.getEntriesByType('longtask');
      longTasks = ltEntries.length;
    } catch { /* Not supported */ }

    let fps = 0;
    try {
      const navEntries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
      if (navEntries.length > 0) {
        const loadTime = navEntries[0].loadEventEnd - navEntries[0].startTime;
        fps = loadTime > 0 ? Math.round(1000 / (loadTime / 60)) : 0;
      }
    } catch { /* ignore */ }

    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    const transferSize = resources.reduce((acc, r) => acc + (r.transferSize || 0), 0);

    setPerfMetrics({
      jsHeapUsed: perf.memory?.usedJSHeapSize ?? 0,
      jsHeapTotal: perf.memory?.totalJSHeapSize ?? 0,
      jsHeapLimit: perf.memory?.jsHeapSizeLimit ?? 0,
      memoryUsagePercent: perf.memory
        ? Math.round((perf.memory.usedJSHeapSize / perf.memory.jsHeapSizeLimit) * 100)
        : 0,
      fps: stats?.fps ?? fps,
      networkDownlink: nav.connection?.downlink ?? 0,
      networkRTT: nav.connection?.rtt ?? 0,
      networkEffectiveType: nav.connection?.effectiveType ?? 'unknown',
      networkSaveData: nav.connection?.saveData ?? false,
      resourceCount: resources.length,
      transferSize,
      domNodes,
      layoutShifts,
      longTasks,
    });
  }, [stats?.fps]);

  const checkCastStatus = useCallback(() => {
    try {
      const castApi = window.cast as unknown as {
        framework?: {
          CastContext?: {
            getInstance?: () => {
              getCastState?: () => string;
              getCurrentSession?: () => {
                getCastDevice?: () => string;
              };
            };
          };
        };
      };

      const context = castApi?.framework?.CastContext?.getInstance?.();
      const state = context?.getCastState?.();
      const session = context?.getCurrentSession?.();

      setCastStatus({
        available: state !== 'NO_DEVICES_AVAILABLE',
        connected: state === 'CONNECTED',
        deviceName: session?.getCastDevice?.() ?? null,
        protocol: session ? 'Chromecast' : null,
      });
    } catch {
      setCastStatus({ available: false, connected: false, deviceName: null, protocol: null });
    }
  }, []);

  useEffect(() => {
    const uptimes: StreamUptime[] = slots
      .filter(s => s.channel?.isLive && s.channel?.startedAt)
      .map(s => ({
        slotId: s.id,
        channelName: s.channel!.displayName,
        uptime: Math.floor((Date.now() - new Date(s.channel!.startedAt!).getTime()) / 1000),
        startedAt: new Date(s.channel!.startedAt!).getTime(),
      }));
    setStreamUptimes(uptimes);
  }, [slots]);

  useEffect(() => {
    if (autoRefresh) {
      collectMetrics();
      checkCastStatus();
      refreshRef.current = setInterval(() => {
        collectMetrics();
        checkCastStatus();
      }, 2000);
    }
    return () => {
      if (refreshRef.current) clearInterval(refreshRef.current);
    };
  }, [autoRefresh, collectMetrics, checkCastStatus]);

  const toggleSection = (key: string) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const copyDiagnostics = useCallback(() => {
    const diag = {
      timestamp: new Date().toISOString(),
      playback: {
        latency: liveLatency,
        latencyMode,
        dvrAvailable: isDvrAvailable,
        dvrDuration,
        dvrPosition,
        stats: stats ? {
          bitrate: stats.bitrate,
          resolution: stats.resolution,
          fps: stats.fps,
          bufferLength: stats.bufferLength,
          droppedFrames: stats.droppedFrames,
          bandwidth: stats.bandwidth,
        } : null,
      },
      performance: perfMetrics ? {
        jsHeapUsed: formatBytes(perfMetrics.jsHeapUsed),
        jsHeapTotal: formatBytes(perfMetrics.jsHeapTotal),
        memoryUsagePercent: perfMetrics.memoryUsagePercent,
        domNodes: perfMetrics.domNodes,
        resourceCount: perfMetrics.resourceCount,
        transferSize: formatBytes(perfMetrics.transferSize),
      } : null,
      streams: {
        layout,
        slotCount: slots.length,
        activeSlots: slots.filter(s => s.channel).length,
        syncEnabled: streamSyncEnabled,
        latencies: streamLatencies,
      },
      chat: {
        connected: chatConnected,
        messageCount: chatMessages.length,
        emoteSets: Object.keys(emoteSets).length,
      },
      cast: castStatus,
    };
    navigator.clipboard.writeText(JSON.stringify(diag, null, 2)).catch(() => {});
  }, [liveLatency, latencyMode, isDvrAvailable, dvrDuration, dvrPosition, stats, perfMetrics, layout, slots, streamSyncEnabled, streamLatencies, chatConnected, chatMessages, emoteSets, castStatus]);

  const avgBufferLength = statsHistory.length > 0
    ? statsHistory.reduce((sum, s) => sum + s.bufferLength, 0) / statsHistory.length
    : 0;
  const minBufferLength = statsHistory.length > 0
    ? Math.min(...statsHistory.map(s => s.bufferLength))
    : 0;
  const maxBufferLength = statsHistory.length > 0
    ? Math.max(...statsHistory.map(s => s.bufferLength))
    : 0;

  const playbackRate = stats && stats.latency > 0
    ? ((stats.latency < 3000) ? 'Live' : stats.latency < 6000 ? 'Near-Live' : 'Behind')
    : 'N/A';

  const Section = ({ id, title, icon, children }: { id: string; title: string; icon: React.ReactNode; children: React.ReactNode }) => (
    <Card className="border-border/50">
      <CardHeader
        className="p-3 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => toggleSection(id)}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-medium flex items-center gap-1.5">
            {icon}
            {title}
          </CardTitle>
          {expandedSections[id] ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </div>
      </CardHeader>
      {expandedSections[id] && (
        <CardContent className="px-3 pb-3 pt-0 space-y-1.5">
          {children}
        </CardContent>
      )}
    </Card>
  );

  const MetricRow = ({ label, value, health, mono }: { label: string; value: string; health?: React.ReactNode; mono?: boolean }) => (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        {health}
        <span className={mono ? 'font-mono' : ''}>{value}</span>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4" />
          <span className="text-sm font-medium">Diagnostics</span>
          <Badge variant="outline" className="text-[9px] h-4 px-1">
            HIDDEN
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] gap-1"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <RefreshCw className={`h-3 w-3 ${autoRefresh ? 'animate-spin' : ''}`} />
            {autoRefresh ? '2s' : 'Off'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] gap-1"
            onClick={copyDiagnostics}
          >
            <Copy className="h-3 w-3" />
            Copy
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2">

          <Section id="playback" title="Playback" icon={<Monitor className="h-3.5 w-3.5" />}>
            <MetricRow label="Latency" value={formatLatency(liveLatency)} health={<HealthIndicator value={liveLatency} thresholds={{ good: 3000, warn: 6000 }} />} mono />
            <MetricRow label="Latency Mode" value={latencyMode.toUpperCase()} />
            <MetricRow label="Buffer Health" value={`${avgBufferLength.toFixed(2)}s`} health={<HealthIndicator value={avgBufferLength} thresholds={{ good: 2, warn: 5 }} />} mono />
            <MetricRow label="Buffer Range" value={`${minBufferLength.toFixed(1)}s - ${maxBufferLength.toFixed(1)}s`} mono />
            <MetricRow label="Dropped Frames" value={`${stats?.droppedFrames ?? 0}`} health={<HealthIndicator value={stats?.droppedFrames ?? 0} thresholds={{ good: 5, warn: 50 }} />} mono />
            <MetricRow label="Bitrate" value={stats ? `${(stats.bitrate / 1000).toFixed(0)} kbps` : '--'} mono />
            <MetricRow label="Resolution" value={stats ? `${stats.resolution.width}x${stats.resolution.height}` : '--'} mono />
            <MetricRow label="FPS" value={stats ? `${stats.fps.toFixed(1)}` : '--'} mono />
            <MetricRow label="Playback Rate" value={playbackRate} health={
              playbackRate === 'Live' ? <span className="text-green-400"><CheckCircle className="h-3 w-3 inline" /></span> :
              playbackRate === 'Near-Live' ? <span className="text-yellow-400"><AlertTriangle className="h-3 w-3 inline" /></span> : null
            } />
            <MetricRow label="Bandwidth" value={stats ? `${(stats.bandwidth / 1000000).toFixed(2)} Mbps` : '--'} mono />
            <MetricRow label="DVR Available" value={isDvrAvailable ? 'Yes' : 'No'} />
            {isDvrAvailable && (
              <>
                <MetricRow label="DVR Duration" value={`${Math.floor(dvrDuration / 60)}m`} mono />
                <MetricRow label="DVR Position" value={`${dvrPosition.toFixed(1)}%`} mono />
              </>
            )}
            <MetricRow label="Recording" value={isRecording ? 'Active' : 'Inactive'} health={isRecording ? <span className="text-red-400"><span className="inline-block w-2 h-2 rounded-full bg-red-500 record-pulse mr-1" /></span> : null} />
            <MetricRow label="PiP Active" value={isPiP ? 'Yes' : 'No'} />
            <MetricRow label="Audio Mode" value={audioMode === 'audioOnly' ? 'Audio Only' : 'Normal'} />
          </Section>

          <Section id="streams" title="Stream Uptime" icon={<Clock className="h-3.5 w-3.5" />}>
            {streamUptimes.length > 0 ? streamUptimes.map(s => (
              <div key={s.slotId} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground truncate max-w-[120px]">{s.channelName}</span>
                <span className="font-mono">{formatUptime(s.uptime)}</span>
              </div>
            )) : (
              <div className="text-xs text-muted-foreground">No active streams</div>
            )}
            <Separator className="my-1" />
            <MetricRow label="Layout" value={layout} />
            <MetricRow label="Slots" value={`${slots.filter(s => s.channel).length}/${slots.length}`} />
            <MetricRow label="Active Slot" value={activeSlotId ?? 'None'} />
            <MetricRow label="Stream Sync" value={streamSyncEnabled ? 'ON' : 'OFF'} />
            {streamSyncEnabled && Object.entries(streamLatencies).map(([slotId, lat]) => (
              <MetricRow key={slotId} label={`  ${slotId}`} value={formatLatency(lat)} mono />
            ))}
          </Section>

          <Section id="performance" title="Performance" icon={<Cpu className="h-3.5 w-3.5" />}>
            {perfMetrics ? (
              <>
                <MetricRow label="JS Heap Used" value={formatBytes(perfMetrics.jsHeapUsed)} mono />
                <MetricRow label="JS Heap Total" value={formatBytes(perfMetrics.jsHeapTotal)} mono />
                <MetricRow label="JS Heap Limit" value={formatBytes(perfMetrics.jsHeapLimit)} mono />
                <MetricRow label="Memory Usage" value={`${perfMetrics.memoryUsagePercent}%`} health={<HealthIndicator value={perfMetrics.memoryUsagePercent} thresholds={{ good: 50, warn: 80 }} />} mono />
                <MetricRow label="DOM Nodes" value={`${perfMetrics.domNodes}`} health={<HealthIndicator value={perfMetrics.domNodes} thresholds={{ good: 1500, warn: 3000 }} />} mono />
                <MetricRow label="Resources" value={`${perfMetrics.resourceCount}`} mono />
                <MetricRow label="Transfer Size" value={formatBytes(perfMetrics.transferSize)} mono />
                <MetricRow label="Layout Shifts" value={`${perfMetrics.layoutShifts}`} health={<HealthIndicator value={perfMetrics.layoutShifts} thresholds={{ good: 3, warn: 10 }} />} />
                <MetricRow label="Long Tasks" value={`${perfMetrics.longTasks}`} health={<HealthIndicator value={perfMetrics.longTasks} thresholds={{ good: 2, warn: 10 }} />} />
              </>
            ) : (
              <div className="text-xs text-muted-foreground">Performance API not available</div>
            )}
          </Section>

          <Section id="network" title="Network" icon={<Wifi className="h-3.5 w-3.5" />}>
            {perfMetrics ? (
              <>
                <MetricRow label="Downlink" value={`${perfMetrics.networkDownlink} Mbps`} mono />
                <MetricRow label="RTT" value={`${perfMetrics.networkRTT}ms`} health={<HealthIndicator value={perfMetrics.networkRTT} thresholds={{ good: 50, warn: 200 }} />} mono />
                <MetricRow label="Effective Type" value={perfMetrics.networkEffectiveType} />
                <MetricRow label="Save Data" value={perfMetrics.networkSaveData ? 'Yes' : 'No'} />
              </>
            ) : (
              <div className="text-xs text-muted-foreground">Network API not available</div>
            )}
            <Separator className="my-1" />
            <MetricRow label="Chat Connected" value={chatConnected ? 'Yes' : 'No'} health={chatConnected ? <span className="text-green-400"><CheckCircle className="h-3 w-3 inline" /></span> : <span className="text-red-400"><XCircle className="h-3 w-3 inline" /></span>} />
            <MetricRow label="Chat Messages" value={`${chatMessages.length}`} mono />
            <MetricRow label="Emote Sets" value={`${Object.keys(emoteSets).length}`} mono />
          </Section>

          <Section id="cast" title="Cast Status" icon={<HardDrive className="h-3.5 w-3.5" />}>
            <MetricRow label="Cast Available" value={castStatus.available ? 'Yes' : 'No'} health={castStatus.available ? <span className="text-green-400"><CheckCircle className="h-3 w-3 inline" /></span> : <span className="text-muted-foreground"><XCircle className="h-3 w-3 inline" /></span>} />
            <MetricRow label="Connected" value={castStatus.connected ? 'Yes' : 'No'} health={castStatus.connected ? <span className="text-green-400"><CheckCircle className="h-3 w-3 inline" /></span> : null} />
            {castStatus.deviceName && <MetricRow label="Device" value={castStatus.deviceName} />}
            {castStatus.protocol && <MetricRow label="Protocol" value={castStatus.protocol} />}
          </Section>

          <Section id="app" title="App State" icon={<Activity className="h-3.5 w-3.5" />}>
            <MetricRow label="Theme" value={theme} />
            <MetricRow label="Chat Visible" value={chatVisible ? 'Yes' : 'No'} />
            <MetricRow label="Chat Position" value={chatPosition} />
            <MetricRow label="Viewport" value={typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : '--'} mono />
            <MetricRow label="Timestamp" value={new Date().toISOString().slice(11, 23)} mono />
          </Section>

          {statsHistory.length > 0 && (
            <Card className="border-border/50">
              <CardHeader className="p-3 cursor-pointer" onClick={() => toggleSection('graph')}>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs font-medium">Buffer History (last 60s)</CardTitle>
                  {expandedSections['graph'] ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </div>
              </CardHeader>
              {expandedSections['graph'] && (
                <CardContent className="px-3 pb-3 pt-0">
                  <div className="h-20 flex items-end gap-px bg-muted/20 rounded p-1">
                    {statsHistory.slice(-60).map((s, i) => {
                      const height = Math.min((s.bufferLength / 10) * 100, 100);
                      const color = s.bufferLength < 1 ? 'bg-red-500' : s.bufferLength < 3 ? 'bg-yellow-500' : 'bg-green-500';
                      return (
                        <div
                          key={i}
                          className={`flex-1 ${color} rounded-t-sm opacity-80`}
                          style={{ height: `${Math.max(height, 2)}%` }}
                          title={`${s.bufferLength.toFixed(2)}s`}
                        />
                      );
                    })}
                  </div>
                  <div className="flex justify-between text-[9px] text-muted-foreground mt-1">
                    <span>60s ago</span>
                    <span>now</span>
                  </div>
                </CardContent>
              )}
            </Card>
          )}

        </div>
      </ScrollArea>
    </div>
  );
}
