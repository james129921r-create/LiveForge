'use client';

import { useMultiStreamStore } from '@/stores/multiStreamStore';
import { usePlayerStore } from '@/stores/playerStore';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Volume2, VolumeX, Headphones, Star, Volume1, RotateCcw, Radio, Circle, CircleOff } from 'lucide-react';

/**
 * AudioMixerPanel — Per-stream volume controls for the audio mixer.
 *
 * Shows per-stream volume slider, mute button, solo button, audio priority
 * indicator, global volume control, audio ducking, and stream status.
 * Compact design that fits in the sidebar.
 */
export function AudioMixerPanel() {
  const { slots, activeSlotId, setActiveSlot } = useMultiStreamStore();
  const {
    volume: globalVolume,
    setVolume: setGlobalVolume,
    isMuted: globalMuted,
    setMuted: setGlobalMuted,
    perStreamVolume,
    perStreamMuted,
    audioPrioritySlot,
    soloSlotId,
    streamLatencies,
    audioDuckingEnabled,
    setAudioDuckingEnabled,
    resetMixer,
    setStreamVolume,
    setStreamMuted,
    setAudioPrioritySlot,
    setSoloSlot,
  } = usePlayerStore();

  const activeSlots = slots.filter((s) => s.channel);

  // Determine if ducking is currently active
  const isDuckingActive = audioDuckingEnabled && !!audioPrioritySlot;

  if (activeSlots.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-3">
        <Headphones className="h-8 w-8 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">No streams active</p>
        <p className="text-xs text-muted-foreground/60">Add streams to control their audio</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {/* Per-stream controls */}
          {activeSlots.map((slot) => {
            const streamVolume = perStreamVolume[slot.id] ?? 1;
            const streamMuted = perStreamMuted[slot.id] ?? false;
            const isPriority = audioPrioritySlot === slot.id;
            const isSolo = soloSlotId === slot.id;
            // If solo is active, mute all except the solo slot
            const effectivelyMuted = soloSlotId
              ? soloSlotId !== slot.id
              : streamMuted;

            // Audio ducking: if ducking is enabled and there's a priority slot, reduce this slot's volume by 50%
            const isDucked = isDuckingActive && !isPriority && !isSolo;
            const effectiveVolume = isDucked ? streamVolume * 0.5 : streamVolume;
            const latency = streamLatencies[slot.id];
            const isLive = slot.channel?.isLive ?? false;

            return (
              <div
                key={slot.id}
                className={`rounded-lg border p-3 space-y-2 transition-colors ${
                  slot.id === activeSlotId
                    ? 'border-primary/40 bg-primary/5'
                    : 'border-border/50'
                } ${effectivelyMuted ? 'opacity-60' : ''}`}
                onClick={() => setActiveSlot(slot.id)}
              >
                {/* Channel header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {slot.channel?.avatarUrl && (
                      <img
                        src={slot.channel.avatarUrl}
                        alt={slot.channel.displayName}
                        className="w-5 h-5 rounded-full shrink-0"
                      />
                    )}
                    {/* Stream status indicator */}
                    {isLive ? (
                      <Circle className="h-2.5 w-2.5 fill-red-500 text-red-500 shrink-0" />
                    ) : (
                      <CircleOff className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
                    )}
                    <span className="text-xs font-medium truncate">
                      {slot.channel?.displayName ?? slot.id}
                    </span>
                    {/* Stream status badge */}
                    <Badge
                      variant={isLive ? 'destructive' : 'outline'}
                      className="text-[8px] h-4 px-1 shrink-0"
                    >
                      {isLive ? 'LIVE' : 'OFFLINE'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Priority button */}
                    <Button
                      variant={isPriority ? 'default' : 'ghost'}
                      size="icon"
                      className="h-6 w-6"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAudioPrioritySlot(isPriority ? null : slot.id);
                      }}
                      title={isPriority ? 'Remove priority' : 'Set as audio priority'}
                    >
                      <Star className="h-3 w-3" />
                    </Button>
                    {/* Solo button */}
                    <Button
                      variant={isSolo ? 'default' : 'ghost'}
                      size="icon"
                      className="h-6 w-6"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSoloSlot(isSolo ? null : slot.id);
                      }}
                      title={isSolo ? 'Un-solo' : 'Solo (mute all others)'}
                    >
                      <Headphones className="h-3 w-3" />
                    </Button>
                    {/* Mute button */}
                    <Button
                      variant={streamMuted ? 'destructive' : 'ghost'}
                      size="icon"
                      className="h-6 w-6"
                      onClick={(e) => {
                        e.stopPropagation();
                        setStreamMuted(slot.id, !streamMuted);
                      }}
                      title={streamMuted ? 'Unmute' : 'Mute'}
                    >
                      {streamMuted ? (
                        <VolumeX className="h-3 w-3" />
                      ) : streamVolume < 0.5 ? (
                        <Volume1 className="h-3 w-3" />
                      ) : (
                        <Volume2 className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Volume slider */}
                <div className="flex items-center gap-2">
                  <Volume2 className="h-3 w-3 text-muted-foreground shrink-0" />
                  <Slider
                    value={[streamVolume * 100]}
                    onValueChange={([val]) => setStreamVolume(slot.id, val / 100)}
                    min={0}
                    max={100}
                    step={1}
                    className="flex-1"
                  />
                  <span className="text-[10px] text-muted-foreground w-8 text-right font-mono">
                    {Math.round(effectiveVolume * 100)}%
                  </span>
                </div>

                {/* Priority / Solo / Ducking indicators */}
                {(isPriority || isSolo || isDucked) && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {isPriority && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 font-medium">
                        ★ PRIORITY
                      </span>
                    )}
                    {isSolo && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 font-medium">
                        🎧 SOLO
                      </span>
                    )}
                    {isDucked && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-500 border border-orange-500/20 font-medium">
                        🔇 DUCKING
                      </span>
                    )}
                  </div>
                )}

                {/* Latency indicator */}
                {latency !== undefined && latency > 0 && (
                  <div className="text-[9px] text-muted-foreground/60">
                    Latency: {(latency / 1000).toFixed(1)}s
                  </div>
                )}
              </div>
            );
          })}

          <Separator />

          {/* Audio ducking & reset controls */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">Audio Ducking</span>
              <Button
                variant={audioDuckingEnabled ? 'secondary' : 'ghost'}
                size="sm"
                className="h-6 px-2 text-[10px] gap-1"
                onClick={() => setAudioDuckingEnabled(!audioDuckingEnabled)}
                title={audioDuckingEnabled ? 'Disable audio ducking' : 'Enable audio ducking (lowers non-priority streams)'}
              >
                <Radio className="h-3 w-3" />
                {audioDuckingEnabled ? 'ON' : 'OFF'}
              </Button>
            </div>
            {audioDuckingEnabled && !audioPrioritySlot && (
              <p className="text-[9px] text-muted-foreground/60">
                Set a priority stream (★) to enable ducking
              </p>
            )}
            {isDuckingActive && (
              <Badge variant="outline" className="text-[9px] gap-1 bg-orange-500/5 border-orange-500/20 text-orange-500">
                🔇 Ducking active — non-priority streams at 50%
              </Badge>
            )}
          </div>

          <Separator />

          {/* Reset mix button */}
          <Button
            variant="outline"
            size="sm"
            className="w-full h-8 gap-1.5 text-xs"
            onClick={resetMixer}
          >
            <RotateCcw className="h-3 w-3" />
            Reset Mix
          </Button>

          <Separator />

          {/* Global volume */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">Global Volume</span>
              <Button
                variant={globalMuted ? 'destructive' : 'ghost'}
                size="icon"
                className="h-6 w-6"
                onClick={() => setGlobalMuted(!globalMuted)}
                title={globalMuted ? 'Unmute all' : 'Mute all'}
              >
                {globalMuted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Volume2 className="h-3 w-3 text-muted-foreground shrink-0" />
              <Slider
                value={[globalVolume * 100]}
                onValueChange={([val]) => setGlobalVolume(val / 100)}
                min={0}
                max={100}
                step={1}
                className="flex-1"
              />
              <span className="text-[10px] text-muted-foreground w-8 text-right font-mono">
                {Math.round(globalVolume * 100)}%
              </span>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
