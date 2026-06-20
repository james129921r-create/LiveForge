'use client';

import { useState, useEffect } from 'react';
import { usePlaybackControls } from '../hooks/usePlaybackControls';
import { usePlayerStore } from '@/stores/playerStore';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  Play, Pause, Volume2, VolumeX, Volume1,
  Maximize, Minimize, PictureInPicture2,
  Monitor, MonitorOff, Headphones, Scissors,
  Link2, RotateCcw, Gauge, Circle, Square,
  Pause as PauseIcon,
} from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import type { ClipDurationOption } from '@/types';

interface PlaybackControlsProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onClipCreate?: (duration?: ClipDurationOption) => void;
  onRecordToggle?: () => void;
  onRecordPause?: () => void;
  onRecordResume?: () => void;
}

// Safe check for PiP support (SSR-safe)
function usePiPSupported(): boolean {
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    setSupported(typeof document !== 'undefined' && document.pictureInPictureEnabled !== false);
  }, []);
  return supported;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function PlaybackControls({
  videoRef,
  containerRef,
  onClipCreate,
  onRecordToggle,
  onRecordPause,
  onRecordResume,
}: PlaybackControlsProps) {
  const {
    isPlaying, isMuted, volume, isTheaterMode, isFullscreen, audioMode,
    togglePlay, toggleMute, changeVolume,
    togglePiP, toggleFullscreen, toggleTheaterMode,
    toggleAudioOnly, seekRelative, changePlaybackRate,
  } = usePlaybackControls(videoRef);

  const {
    latencyMode, setLatencyMode, liveLatency, isDvrAvailable,
    isPiP, streamSyncEnabled, setStreamSyncEnabled, dvrPosition,
    isRecording, isRecordingPaused, recordingDuration, clipDuration, setClipDuration,
  } = usePlayerStore();

  const isMobile = useIsMobile();
  const isAudioOnly = audioMode === 'audioOnly';
  const pipSupported = usePiPSupported();
  const isSeekedBack = isDvrAvailable && dvrPosition < 95;

  return (
    <div className="px-2 sm:px-3 pb-2 pt-1">
      {/* DVR Progress Bar handled by DVRTimeline */}

      {/* Control Buttons */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-0.5 sm:gap-1">
          {/* Play/Pause */}
          <Button
            variant="ghost"
            size="icon"
            className={`h-8 w-8 sm:h-9 sm:w-9 text-white hover:bg-white/10 ${isMobile ? 'active:bg-white/20' : ''}`}
            onClick={togglePlay}
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>

          {/* Volume */}
          <Button
            variant="ghost"
            size="icon"
            className={`h-8 w-8 sm:h-9 sm:w-9 text-white hover:bg-white/10 ${isMobile ? 'active:bg-white/20' : ''}`}
            onClick={toggleMute}
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="h-4 w-4" />
            ) : volume < 0.5 ? (
              <Volume1 className="h-4 w-4" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </Button>

          {/* Volume Slider */}
          {!isMobile ? (
            <div className="w-20">
              <Slider
                value={[isMuted ? 0 : volume * 100]}
                max={100}
                step={1}
                className="cursor-pointer [&_[role=slider]]:h-2.5 [&_[role=slider]]:w-2.5"
                onValueChange={([v]) => changeVolume(v / 100)}
              />
            </div>
          ) : (
            /* Mobile: compact volume slider always visible */
            <div className="w-14">
              <Slider
                value={[isMuted ? 0 : volume * 100]}
                max={100}
                step={1}
                className="cursor-pointer [&_[role=slider]]:h-2 [&_[role=slider]]:w-2"
                onValueChange={([v]) => changeVolume(v / 100)}
              />
            </div>
          )}

          {/* Latency Mode */}
          <div className="flex items-center gap-0 ml-1 sm:ml-2">
            {(['low', 'normal', 'dvr'] as const).map((mode) => (
              <Button
                key={mode}
                variant="ghost"
                size="sm"
                className={`h-6 px-1.5 sm:px-2 text-[10px] sm:text-xs text-white hover:bg-white/10 ${
                  latencyMode === mode ? 'bg-white/20' : ''
                }`}
                onClick={() => setLatencyMode(mode)}
              >
                {mode === 'low' ? 'LL' : mode === 'normal' ? 'Live' : 'DVR'}
              </Button>
            ))}
          </div>

          {/* Latency Display */}
          {liveLatency > 0 && (
            <span className="text-[10px] sm:text-xs text-gray-400 ml-1 sm:ml-2 hidden sm:inline">
              {liveLatency < 1000
                ? `${Math.round(liveLatency)}ms`
                : `${(liveLatency / 1000).toFixed(1)}s`}
            </span>
          )}

          {/* DVR: Return to Live */}
          {isSeekedBack && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px] text-red-400 hover:bg-white/10 gap-1 ml-1"
              onClick={() => {
                const video = videoRef.current;
                if (video && isFinite(video.duration)) {
                  video.currentTime = video.duration;
                }
              }}
            >
              <RotateCcw className="h-3 w-3" />
              LIVE
            </Button>
          )}

          {/* DVR: Skip buttons */}
          {isDvrAvailable && latencyMode === 'dvr' && (
            <div className="hidden sm:flex items-center gap-0 ml-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-[10px] text-white hover:bg-white/10"
                onClick={() => seekRelative(-10)}
              >
                -10s
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-[10px] text-white hover:bg-white/10"
                onClick={() => seekRelative(10)}
              >
                +10s
              </Button>
              {/* Speed control */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1.5 text-[10px] text-white hover:bg-white/10 gap-1"
                  >
                    <Gauge className="h-3 w-3" />
                    1x
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-1" side="top">
                  {[0.5, 1, 1.5, 2].map((rate) => (
                    <Button
                      key={rate}
                      variant="ghost"
                      size="sm"
                      className="w-full h-7 text-xs justify-start"
                      onClick={() => changePlaybackRate(rate)}
                    >
                      {rate}x
                    </Button>
                  ))}
                </PopoverContent>
              </Popover>
            </div>
          )}
        </div>

        <div className="flex items-center gap-0.5 sm:gap-1">
          {/* Audio Only Mode */}
          <Button
            variant="ghost"
            size="icon"
            className={`h-8 w-8 text-white hover:bg-white/10 ${isAudioOnly ? 'bg-white/20' : ''}`}
            onClick={toggleAudioOnly}
            title="Audio Only Mode"
          >
            <Headphones className="h-4 w-4" />
          </Button>

          {/* Record Button */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={`h-8 w-8 text-white hover:bg-white/10 ${isRecording ? 'bg-red-500/30' : ''}`}
                title={isRecording ? 'Recording Controls' : 'Start Recording'}
              >
                {isRecording ? (
                  <Square className="h-3.5 w-3.5 text-red-400" />
                ) : (
                  <Circle className="h-3.5 w-3.5" />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-3" side="top" align="end">
              <div className="space-y-3">
                <div className="text-xs font-medium text-foreground">Recording</div>

                {isRecording && (
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-xs font-mono text-muted-foreground">
                      {formatDuration(recordingDuration)}
                    </span>
                    {isRecordingPaused && (
                      <span className="text-[10px] text-yellow-400 bg-yellow-500/10 px-1.5 py-0.5 rounded">
                        PAUSED
                      </span>
                    )}
                  </div>
                )}

                <div className="flex gap-2">
                  {!isRecording ? (
                    <Button
                      size="sm"
                      variant="default"
                      className="flex-1 gap-1.5"
                      onClick={() => onRecordToggle?.()}
                    >
                      <Circle className="h-3 w-3" />
                      Record
                    </Button>
                  ) : (
                    <>
                      {isRecordingPaused ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 gap-1.5"
                          onClick={() => onRecordResume?.()}
                        >
                          <Play className="h-3 w-3" />
                          Resume
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 gap-1.5"
                          onClick={() => onRecordPause?.()}
                        >
                          <PauseIcon className="h-3 w-3" />
                          Pause
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="destructive"
                        className="flex-1 gap-1.5"
                        onClick={() => onRecordToggle?.()}
                      >
                        <Square className="h-3 w-3" />
                        Stop
                      </Button>
                    </>
                  )}
                </div>

                {isRecording && (
                  <div className="text-[10px] text-muted-foreground">
                    Max duration: 30 minutes
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>

          {/* Create Clip with Duration Selector */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-white hover:bg-white/10"
                title="Create Clip"
              >
                <Scissors className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-3" side="top" align="end">
              <div className="space-y-3">
                <div className="text-xs font-medium text-foreground">Clip Duration</div>
                <div className="flex gap-1.5">
                  {([15, 30, 60] as ClipDurationOption[]).map((dur) => (
                    <Button
                      key={dur}
                      size="sm"
                      variant={clipDuration === dur ? 'default' : 'outline'}
                      className="flex-1 text-xs"
                      onClick={() => setClipDuration(dur)}
                    >
                      {dur}s
                    </Button>
                  ))}
                </div>
                <Button
                  size="sm"
                  className="w-full gap-1.5"
                  onClick={() => onClipCreate?.(clipDuration)}
                >
                  <Scissors className="h-3 w-3" />
                  Clip Last {clipDuration}s
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          {/* Stream Sync */}
          <Button
            variant="ghost"
            size="icon"
            className={`h-8 w-8 text-white hover:bg-white/10 ${streamSyncEnabled ? 'bg-white/20' : ''}`}
            onClick={() => setStreamSyncEnabled(!streamSyncEnabled)}
            title="Stream Sync (Y)"
          >
            <Link2 className="h-4 w-4" />
          </Button>

          {/* PiP — now available on mobile too */}
          {pipSupported && (
            <Button
              variant="ghost"
              size="icon"
              className={`h-8 w-8 text-white hover:bg-white/10 ${isPiP ? 'bg-white/20' : ''}`}
              onClick={togglePiP}
              title="Picture-in-Picture"
            >
              <PictureInPicture2 className="h-4 w-4" />
            </Button>
          )}

          {/* Theater Mode — hide on mobile (no room) */}
          {!isMobile && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white hover:bg-white/10"
              onClick={toggleTheaterMode}
              title="Theater Mode"
            >
              {isTheaterMode ? <MonitorOff className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
            </Button>
          )}

          {/* Fullscreen */}
          <Button
            variant="ghost"
            size="icon"
            className={`h-8 w-8 sm:h-9 sm:w-9 text-white hover:bg-white/10 ${isMobile ? 'active:bg-white/20' : ''}`}
            onClick={() => toggleFullscreen(containerRef?.current)}
            title="Fullscreen"
          >
            {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Recording Duration Bar (shown below controls when recording) */}
      {isRecording && (
        <div className="flex items-center justify-center gap-2 mt-1">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[10px] text-white/80 font-mono">
            REC {formatDuration(recordingDuration)}
          </span>
          {isRecordingPaused && (
            <span className="text-[10px] text-yellow-400 font-medium">PAUSED</span>
          )}
          <span className="text-[10px] text-white/40">
            Max 30:00
          </span>
        </div>
      )}
    </div>
  );
}
