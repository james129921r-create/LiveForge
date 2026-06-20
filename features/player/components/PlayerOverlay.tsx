'use client';

import { usePlayerStore } from '@/stores/playerStore';
import { useIsMobile } from '@/hooks/use-mobile';
import { Eye, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { useMultiStreamStore } from '@/stores/multiStreamStore';
import { useWindowManager } from '@/hooks/useWindowManager';

interface PlayerOverlayProps {
  channelName?: string;
  slotId?: string;
}

export function PlayerOverlay({ channelName, slotId }: PlayerOverlayProps) {
  const [showStats, setShowStats] = useState(false);
  const { stats } = usePlayerStore();
  const isMobile = useIsMobile();
  const { popOutStream, isSlotPoppedOut } = useWindowManager();

  // Look up the channel from the store by slotId
  const slots = useMultiStreamStore((s) => s.slots);
  const channel = slotId ? slots.find(s => s.id === slotId)?.channel ?? null : null;
  const isPoppedOut = slotId ? isSlotPoppedOut(slotId) : false;

  return (
    <>
      {/* Channel Name — always visible on mobile, hover on desktop */}
      {channelName && (
        <div className={`absolute top-3 left-3 transition-opacity ${
          isMobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}>
          <span className="text-white text-xs sm:text-sm font-medium bg-black/50 px-2 py-1 rounded">
            {channelName}
          </span>
        </div>
      )}

      {/* Stats Toggle — always visible on mobile */}
      <button
        className={`absolute top-3 left-1/2 -translate-x-1/2 transition-opacity text-white/60 hover:text-white p-1 ${
          isMobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
        onClick={() => setShowStats(!showStats)}
      >
        <Eye className="h-4 w-4" />
      </button>

      {/* Pop Out button */}
      {channel && slotId && !isPoppedOut && (
        <button
          className={`absolute top-3 right-3 z-10 flex items-center gap-1 text-white/60 hover:text-white bg-black/50 hover:bg-black/70 px-2 py-1 rounded transition-all ${
            isMobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
          onClick={(e) => {
            e.stopPropagation();
            popOutStream(slotId, channel);
          }}
          title="Pop out stream to new window"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          <span className="text-[10px] hidden sm:inline">Pop Out</span>
        </button>
      )}

      {/* Popped Out indicator */}
      {isPoppedOut && slotId && (
        <div className="absolute top-3 right-3 z-10 flex items-center gap-1 bg-primary/80 text-primary-foreground px-2 py-1 rounded">
          <ExternalLink className="h-3.5 w-3.5" />
          <span className="text-[10px] font-medium">Popped Out</span>
        </div>
      )}

      {/* Stats Overlay */}
      {showStats && stats && (
        <div className="absolute top-10 right-3 bg-black/85 backdrop-blur-sm rounded-lg p-2 sm:p-3 text-xs font-mono text-gray-300 space-y-1 min-w-[180px] sm:min-w-[200px] z-20">
          <div className="text-white font-semibold mb-1 sm:mb-2">Stream Stats</div>
          <div className="flex justify-between">
            <span className="text-gray-500">Bitrate</span>
            <span>{(stats.bitrate / 1000).toFixed(0)} kbps</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Resolution</span>
            <span>{stats.resolution.width}x{stats.resolution.height}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">FPS</span>
            <span>{stats.fps.toFixed(1)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Buffer</span>
            <span>{stats.bufferLength.toFixed(2)}s</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Latency</span>
            <span>
              {stats.latency < 1000
                ? `${Math.round(stats.latency)}ms`
                : `${(stats.latency / 1000).toFixed(1)}s`}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Bandwidth</span>
            <span>{(stats.bandwidth / 1000000).toFixed(2)} Mbps</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Dropped</span>
            <span className={stats.droppedFrames > 0 ? 'text-red-400' : ''}>{stats.droppedFrames}</span>
          </div>
        </div>
      )}
    </>
  );
}
