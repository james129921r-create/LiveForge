'use client';

import { useState, useRef, useEffect } from 'react';
import type { ClipData, ClipDurationOption } from '@/types';
import { usePlayerStore } from '@/stores/playerStore';
import { useMultiStreamStore } from '@/stores/multiStreamStore';
import { Button } from '@/components/ui/button';
import { Play, Pause, Download, Share2, X, RotateCcw, Clock, User, Film, Copy, Check, BookmarkPlus, Tv } from 'lucide-react';
import { safeDownload } from '@/lib/security';

interface ClipCreatorProps {
  clip: ClipData | null;
  onClose: () => void;
  onClipFromStream?: (slotId: string, duration: ClipDurationOption) => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function ClipCreator({ clip, onClose, onClipFromStream }: ClipCreatorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [copied, setCopied] = useState(false);
  const [savedToLibrary, setSavedToLibrary] = useState(false);

  const { addToClipLibrary, clipDuration, setClipDuration } = usePlayerStore();
  const { slots } = useMultiStreamStore();

  // Get active streams for multi-POV clip support
  const activeStreams = slots.filter((s) => s.channel).map((s) => ({
    slotId: s.id,
    channelName: s.channel?.displayName || s.channel?.username || '',
    username: s.channel?.username || '',
  }));

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => setCurrentTime(video.currentTime);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false);

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
    };
  }, [clip]);

  // Auto-play clip when it loads
  useEffect(() => {
    const video = videoRef.current;
    if (video && clip?.blobUrl) {
      video.play().catch(() => {});
    }
    // Reset saved state when clip changes
    setSavedToLibrary(false);
  }, [clip?.blobUrl]);

  if (!clip?.blobUrl) return null;

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  };

  const handleDownload = () => {
    const extension = clip.format === 'mp4' ? 'mp4' : 'webm';
    const filename = `clip_${clip.channelName}_${new Date(clip.startTime).toISOString().slice(0, 19).replace(/[:.]/g, '-')}.${extension}`;
    safeDownload(clip.blobUrl!, filename);
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        const response = await fetch(clip.blobUrl!);
        const blob = await response.blob();
        const extension = clip.format === 'mp4' ? 'mp4' : 'webm';
        const file = new File([blob], `clip_${clip.channelName}.${extension}`, { type: clip.mimeType || 'video/webm' });

        await navigator.share({
          title: `Clip: ${clip.channelName}`,
          files: [file],
        });
      } catch {
        // User cancelled or not supported — fallback to copy link
        handleCopyLink();
      }
    } else {
      handleCopyLink();
    }
  };

  const handleCopyLink = async () => {
    const text = `LiveForge Clip — ${clip.channelName} (${formatTime(clip.duration)}) — ${formatTimestamp(clip.createdAt)}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
  };

  const handleSaveToLibrary = () => {
    addToClipLibrary(clip);
    setSavedToLibrary(true);
  };

  const progressPercent = clip.duration > 0 ? (currentTime / clip.duration) * 100 : 0;

  return (
    <div className="absolute bottom-0 left-0 right-0 bg-black/95 backdrop-blur-md z-50 border-t border-white/10">
      {/* Preview Video */}
      <div className="relative">
        <video
          ref={videoRef}
          src={clip.blobUrl}
          className="w-full max-h-48 object-contain bg-black"
          playsInline
          loop
        />

        {/* Play/Pause overlay */}
        <button
          className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-colors"
          onClick={togglePlay}
          aria-label={isPlaying ? 'Pause clip' : 'Play clip'}
        >
          {isPlaying ? (
            <Pause className="h-8 w-8 text-white/80" />
          ) : (
            <Play className="h-8 w-8 text-white/80" />
          )}
        </button>

        {/* Close button */}
        <button
          className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
          onClick={onClose}
          aria-label="Close clip preview"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Duration badge */}
        <div className="absolute top-2 left-2 flex items-center gap-1.5">
          <span className="bg-red-500/90 text-white px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider">
            CLIP
          </span>
          <span className="bg-black/60 text-white px-1.5 py-0.5 rounded text-[10px] font-mono">
            {formatTime(clip.duration)}
          </span>
        </div>

        {/* Progress bar */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20 cursor-pointer"
          onClick={(e) => {
            const video = videoRef.current;
            if (!video || !clip.duration) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const percent = (e.clientX - rect.left) / rect.width;
            video.currentTime = percent * clip.duration;
          }}
        >
          <div
            className="h-full bg-red-500 transition-[width] duration-100"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Clip info & actions */}
      <div className="p-3 space-y-2">
        {/* Metadata */}
        <div className="flex items-center gap-3 text-xs text-white/60">
          <div className="flex items-center gap-1">
            <User className="h-3 w-3" />
            <span className="text-white font-medium">{clip.channelName}</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span>{formatTime(clip.duration)}</span>
          </div>
          <div className="flex items-center gap-1">
            <Film className="h-3 w-3" />
            <span>{clip.format?.toUpperCase() || 'WEBM'}</span>
          </div>
          <span className="text-white/40">•</span>
          <span>{formatTimestamp(clip.createdAt)}</span>
        </div>

        {/* Duration selector — visible buttons */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-white/40 mr-1">Duration:</span>
          {([15, 30, 60] as ClipDurationOption[]).map((dur) => (
            <Button
              key={dur}
              size="sm"
              variant={clipDuration === dur ? 'default' : 'outline'}
              className="h-6 px-2 text-[10px] text-white border-white/20 hover:bg-white/10"
              onClick={() => setClipDuration(dur)}
            >
              {dur}s
            </Button>
          ))}
        </div>

        {/* Multi-POV clip support — select which stream to clip from */}
        {activeStreams.length > 1 && onClipFromStream && (
          <div className="flex items-center gap-1.5">
            <Tv className="h-3 w-3 text-white/40" />
            <span className="text-[10px] text-white/40 mr-1">Clip from:</span>
            <div className="flex gap-1 overflow-x-auto max-w-[300px]">
              {activeStreams.map((stream) => (
                <Button
                  key={stream.slotId}
                  size="sm"
                  variant={stream.channelName === clip.channelName ? 'default' : 'outline'}
                  className="h-6 px-2 text-[10px] text-white border-white/20 hover:bg-white/10 shrink-0"
                  onClick={() => onClipFromStream(stream.slotId, clipDuration)}
                >
                  {stream.channelName}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-white hover:bg-white/10"
            onClick={() => {
              const video = videoRef.current;
              if (video) video.currentTime = 0;
            }}
            title="Replay"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-white hover:bg-white/10 gap-1"
            onClick={handleShare}
            title="Share clip"
          >
            <Share2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline text-xs">Share</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-white hover:bg-white/10 gap-1"
            onClick={handleCopyLink}
            title="Copy clip info"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-400" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline text-xs">{copied ? 'Copied!' : 'Copy'}</span>
          </Button>
          {/* Save to Library button */}
          <Button
            variant="ghost"
            size="sm"
            className={`h-8 gap-1 ${savedToLibrary ? 'text-green-400' : 'text-white hover:bg-white/10'}`}
            onClick={handleSaveToLibrary}
            title={savedToLibrary ? 'Saved to library' : 'Save to clip library'}
          >
            {savedToLibrary ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <BookmarkPlus className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline text-xs">{savedToLibrary ? 'Saved!' : 'Library'}</span>
          </Button>
          <Button
            variant="default"
            size="sm"
            className="h-8 ml-auto gap-1"
            onClick={handleDownload}
            title="Download clip"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="text-xs">Save</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
