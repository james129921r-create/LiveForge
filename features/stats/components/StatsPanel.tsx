'use client';

import { usePlayerStore } from '@/stores/playerStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, Wifi, Monitor, Clock, AlertTriangle, Signal } from 'lucide-react';

export function StatsPanel() {
  const { stats, statsHistory, liveLatency } = usePlayerStore();

  if (!stats) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8">
        <Activity className="h-12 w-12 mb-4 opacity-30" />
        <p className="text-sm">No stream stats available</p>
        <p className="text-xs mt-1">Start watching a stream to see stats</p>
      </div>
    );
  }

  const avgBitrate = statsHistory.length > 0
    ? statsHistory.reduce((sum, s) => sum + s.bitrate, 0) / statsHistory.length
    : 0;

  const avgBuffer = statsHistory.length > 0
    ? statsHistory.reduce((sum, s) => sum + s.bufferLength, 0) / statsHistory.length
    : 0;

  const maxLatency = Math.max(...statsHistory.map((s) => s.latency), 0);
  const minLatency = Math.min(...statsHistory.map((s) => s.latency), Infinity);

  const getBufferHealth = (buffer: number) => {
    if (buffer > 5) return { label: 'Excellent', color: 'text-green-400' };
    if (buffer > 2) return { label: 'Good', color: 'text-yellow-400' };
    if (buffer > 0.5) return { label: 'Fair', color: 'text-orange-400' };
    return { label: 'Poor', color: 'text-red-400' };
  };

  const bufferHealth = getBufferHealth(stats.bufferLength);

  return (
    <div className="p-3 space-y-3 overflow-y-auto h-full">
      {/* Live Stats */}
      <div className="grid grid-cols-2 gap-2">
        <StatCard
          icon={<Wifi className="h-4 w-4" />}
          title="Bitrate"
          value={`${(stats.bitrate / 1000).toFixed(0)}`}
          unit="kbps"
          color={stats.bitrate > 4000000 ? 'text-green-400' : stats.bitrate > 2000000 ? 'text-yellow-400' : 'text-red-400'}
        />
        <StatCard
          icon={<Monitor className="h-4 w-4" />}
          title="Resolution"
          value={`${stats.resolution.width}x${stats.resolution.height}`}
          color="text-blue-400"
        />
        <StatCard
          icon={<Clock className="h-4 w-4" />}
          title="Latency"
          value={liveLatency < 1000 ? `${Math.round(liveLatency)}` : `${(liveLatency / 1000).toFixed(1)}`}
          unit={liveLatency < 1000 ? 'ms' : 's'}
          color={liveLatency < 3000 ? 'text-green-400' : liveLatency < 6000 ? 'text-yellow-400' : 'text-red-400'}
        />
        <StatCard
          icon={<Signal className="h-4 w-4" />}
          title="Buffer"
          value={`${stats.bufferLength.toFixed(1)}`}
          unit="s"
          color={bufferHealth.color}
        />
      </div>

      {/* Buffer Health */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Buffer Health
            <Badge variant="outline" className={`text-xs ${bufferHealth.color}`}>
              {bufferHealth.label}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-20 flex items-end gap-px">
            {statsHistory.slice(-40).map((s, i) => {
              const height = Math.min((s.bufferLength / 10) * 100, 100);
              const color = s.bufferLength > 3
                ? 'bg-green-500'
                : s.bufferLength > 1
                ? 'bg-yellow-500'
                : 'bg-red-500';
              return (
                <div
                  key={i}
                  className={`flex-1 ${color} rounded-t-sm opacity-80`}
                  style={{ height: `${Math.max(height, 2)}%` }}
                />
              );
            })}
          </div>
          <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
            <span>40s ago</span>
            <span>now</span>
          </div>
        </CardContent>
      </Card>

      {/* Bitrate Graph */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Wifi className="h-4 w-4" />
            Bitrate History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-20 flex items-end gap-px">
            {statsHistory.slice(-40).map((s, i) => {
              const maxBitrate = Math.max(...statsHistory.map((h) => h.bitrate), 1);
              const height = (s.bitrate / maxBitrate) * 100;
              return (
                <div
                  key={i}
                  className="flex-1 bg-blue-500 rounded-t-sm opacity-80"
                  style={{ height: `${Math.max(height, 2)}%` }}
                />
              );
            })}
          </div>
          <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
            <span>40s ago</span>
            <span>now</span>
          </div>
        </CardContent>
      </Card>

      {/* Additional Info */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Session Averages</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Avg Bitrate</span>
            <span>{(avgBitrate / 1000).toFixed(0)} kbps</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Avg Buffer</span>
            <span>{avgBuffer.toFixed(2)}s</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Min Latency</span>
            <span>{minLatency === Infinity ? '--' : `${(minLatency / 1000).toFixed(1)}s`}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Max Latency</span>
            <span>{maxLatency === 0 ? '--' : `${(maxLatency / 1000).toFixed(1)}s`}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Dropped Frames</span>
            <span className={stats.droppedFrames > 10 ? 'text-red-400' : ''}>{stats.droppedFrames}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Bandwidth</span>
            <span>{(stats.bandwidth / 1000000).toFixed(2)} Mbps</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon,
  title,
  value,
  unit,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  unit?: string;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
          {icon}
          <span className="text-xs">{title}</span>
        </div>
        <div className={`text-lg font-bold ${color}`}>
          {value}
          {unit && <span className="text-xs font-normal text-muted-foreground ml-1">{unit}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
