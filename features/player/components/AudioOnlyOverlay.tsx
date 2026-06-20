'use client';

import { usePlayerStore } from '@/stores/playerStore';
import { Play, Pause, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';

interface AudioOnlyOverlayProps {
  channelName?: string;
  onTogglePlay: () => void;
  onToggleMute: () => void;
  onVolumeChange: (v: number) => void;
}

export function AudioOnlyOverlay({
  channelName,
  onTogglePlay,
  onToggleMute,
  onVolumeChange,
}: AudioOnlyOverlayProps) {
  const { isPlaying, isMuted, volume } = usePlayerStore();

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-gray-900 via-gray-950 to-black z-10">
      {/* Audio Visualizer Bars */}
      <div className="flex items-end gap-1 h-16 mb-6">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={`w-2 rounded-full ${isPlaying ? 'bg-primary animate-pulse' : 'bg-muted-foreground/30'}`}
            style={{
              animationDelay: `${i * 0.15}s`,
              animationDuration: `${0.8 + i * 0.1}s`,
              height: isPlaying ? `${30 + Math.sin(i * 1.2) * 30}%` : '10%',
              transition: 'height 0.3s ease',
            }}
          />
        ))}
      </div>

      {/* Channel Name */}
      {channelName && (
        <div className="text-white text-lg font-semibold mb-1">
          {channelName}
        </div>
      )}

      {/* Audio Only Badge */}
      <div className="flex items-center gap-1.5 text-muted-foreground mb-8">
        <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
        <span className="text-xs font-medium uppercase tracking-wider">Audio Only</span>
      </div>

      {/* Centered Controls */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          className="h-12 w-12 text-white hover:bg-white/10 rounded-full"
          onClick={onToggleMute}
        >
          {isMuted || volume === 0 ? (
            <VolumeX className="h-6 w-6" />
          ) : (
            <Volume2 className="h-6 w-6" />
          )}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-16 w-16 text-white hover:bg-white/10 rounded-full border border-white/20"
          onClick={onTogglePlay}
        >
          {isPlaying ? (
            <Pause className="h-8 w-8" />
          ) : (
            <Play className="h-8 w-8 ml-1" />
          )}
        </Button>

        <div className="w-20">
          <Slider
            value={[isMuted ? 0 : volume * 100]}
            max={100}
            step={1}
            className="cursor-pointer [&_[role=slider]]:h-3 [&_[role=slider]]:w-3"
            onValueChange={([v]) => onVolumeChange(v / 100)}
          />
        </div>
      </div>
    </div>
  );
}
