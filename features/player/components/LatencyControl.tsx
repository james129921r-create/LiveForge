'use client';

import { usePlayerStore } from '@/stores/playerStore';
import { useIsMobile } from '@/hooks/use-mobile';
import { Badge } from '@/components/ui/badge';

export function LatencyControl() {
  const { liveLatency, latencyMode } = usePlayerStore();
  const isMobile = useIsMobile();

  const formatLatency = (ms: number) => {
    if (ms <= 0) return '--';
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const getLatencyColor = () => {
    if (latencyMode === 'dvr') return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    if (liveLatency < 3000) return 'bg-green-500/20 text-green-400 border-green-500/30';
    if (liveLatency < 6000) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    return 'bg-red-500/20 text-red-400 border-red-500/30';
  };

  return (
    <div className={`absolute top-3 right-3 ${isMobile ? '' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
      <Badge
        variant="outline"
        className={`text-xs font-mono ${getLatencyColor()}`}
      >
        <span className="mr-1 inline-block w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
        {formatLatency(liveLatency)}
      </Badge>
    </div>
  );
}
