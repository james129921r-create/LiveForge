'use client';

import { useDownloadStore } from '@/stores/downloadStore';
import { useMultiStreamStore } from '@/stores/multiStreamStore';
import { usePlayerStore } from '@/stores/playerStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Download, FileText, Copy, CheckCircle, XCircle, Loader2, Trash2, Circle, Square } from 'lucide-react';
import { useState, useCallback, useRef } from 'react';
import { safeClipboardWrite, safeDownload, validateHlsUrl, validateM3U8 } from '@/lib/security';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function DownloadPanel() {
  const { downloads, addDownload, updateDownload, removeDownload, clearCompleted } = useDownloadStore();
  const { slots } = useMultiStreamStore();
  const { isRecording, setRecording } = usePlayerStore();
  const [exportedUrl, setExportedUrl] = useState<string | null>(null);

  // Recording state
  const [activeRecording, setActiveRecording] = useState<{
    channelName: string;
    startTime: number;
    segments: number;
    estimatedSize: number;
  } | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeStreams = slots.filter((s) => s.channel?.hlsUrl);

  const handleExportM3U8 = (channelName: string, hlsUrl: string) => {
    // Validate the HLS URL before generating M3U8
    const urlValidation = validateHlsUrl(hlsUrl);
    if (!urlValidation.valid) {
      console.warn('Blocked M3U8 export for invalid URL:', urlValidation.reason);
      return;
    }

    const m3u8Content = `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:10\n#EXTINF:10.0,\n${hlsUrl}\n#EXT-X-ENDLIST`;

    // Validate the generated M3U8 content
    const m3u8Validation = validateM3U8(m3u8Content);
    if (!m3u8Validation.valid) {
      console.warn('Generated invalid M3U8:', m3u8Validation.reason);
      return;
    }

    const blob = new Blob([m3u8Content], { type: 'application/x-mpegURL' });
    const url = URL.createObjectURL(blob);

    safeDownload(url, `${channelName}.m3u8`);

    URL.revokeObjectURL(url);

    addDownload({
      id: `dl-${Date.now()}`,
      channelName,
      hlsUrl,
      format: 'm3u8',
      status: 'completed',
      createdAt: Date.now(),
    });
  };

  const handleCopyUrl = async (url: string) => {
    // Validate URL before copying to clipboard
    const validation = validateHlsUrl(url);
    if (!validation.valid) {
      console.warn('Blocked clipboard copy for invalid URL:', validation.reason);
      return;
    }
    const success = await safeClipboardWrite(url);
    if (success) {
      setExportedUrl(url);
      setTimeout(() => setExportedUrl(null), 2000);
    }
  };

  const handleExportMetadata = (channelName: string, hlsUrl: string) => {
    const metadata = {
      channel: channelName,
      url: hlsUrl,
      exportedAt: new Date().toISOString(),
      format: 'hls',
    };

    const blob = new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    safeDownload(url, `${channelName}_metadata.json`);

    URL.revokeObjectURL(url);

    addDownload({
      id: `dl-${Date.now()}`,
      channelName,
      hlsUrl,
      format: 'metadata',
      status: 'completed',
      createdAt: Date.now(),
    });
  };

  const handleStartRecording = useCallback((channelName: string) => {
    if (typeof MediaRecorder === 'undefined') {
      console.warn('MediaRecorder not supported');
      return;
    }

    const video = document.querySelector('video') as HTMLVideoElement & { captureStream?: () => MediaStream };
    if (!video) return;

    const stream = video.captureStream?.();
    if (!stream) return;

    chunksRef.current = [];
    const startTime = Date.now();

    try {
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : MediaRecorder.isTypeSupported('video/webm')
          ? 'video/webm'
          : 'video/mp4';

      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 4000000,
      });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setRecording(true, `rec-${Date.now()}`);

      setActiveRecording({
        channelName,
        startTime,
        segments: 0,
        estimatedSize: 0,
      });

      // Timer
      timerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);

      // Progress
      progressRef.current = setInterval(() => {
        const totalSize = chunksRef.current.reduce((acc, chunk) => acc + chunk.size, 0);
        setActiveRecording((prev) => prev ? {
          ...prev,
          segments: chunksRef.current.length,
          estimatedSize: totalSize,
        } : null);
      }, 2000);

      addDownload({
        id: `dl-rec-${Date.now()}`,
        channelName,
        hlsUrl: '',
        format: 'mp4',
        status: 'recording',
        createdAt: Date.now(),
      });
    } catch (err) {
      console.error('Failed to start recording:', err);
    }
  }, [addDownload, setRecording]);

  const handleStopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      const recorder = mediaRecorderRef.current;
      const chunks = [...chunksRef.current];

      recorder.onstop = () => {
        if (chunks.length > 0) {
          const mimeType = recorder.mimeType || 'video/webm';
          const blob = new Blob(chunks, { type: mimeType });
          const url = URL.createObjectURL(blob);

          const a = document.createElement('a');
          a.href = url;
          a.download = `${activeRecording?.channelName || 'recording'}_${new Date().toISOString().slice(0, 19)}.webm`;
          a.click();

          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
      };

      recorder.stop();
      mediaRecorderRef.current = null;
    }

    if (timerRef.current) clearInterval(timerRef.current);
    if (progressRef.current) clearInterval(progressRef.current);

    setRecording(false);
    setActiveRecording(null);
    setRecordingDuration(0);
  }, [activeRecording, setRecording]);

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Download className="h-5 w-5" />
          Downloads
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Export stream URLs, record, and download
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 max-h-96">
        {/* Active Recording */}
        {activeRecording && (
          <Card className="overflow-hidden border-red-500/30">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-red-500 record-pulse" />
                <span className="text-sm font-medium">{activeRecording.channelName}</span>
                <Badge variant="outline" className="text-[10px] text-red-500 border-red-500/30 ml-auto">
                  REC {formatDuration(recordingDuration)}
                </Badge>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
                <span>{activeRecording.segments} segments</span>
                <span>{formatBytes(activeRecording.estimatedSize)}</span>
              </div>
              <Progress value={Math.min((activeRecording.estimatedSize / (50 * 1024 * 1024)) * 100, 100)} className="h-1 mb-2" />
              <Button
                variant="destructive"
                size="sm"
                className="w-full text-xs h-7"
                onClick={handleStopRecording}
              >
                <Square className="h-3 w-3 mr-1" />
                Stop & Save Recording
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Active Streams */}
        {activeStreams.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              Active Streams
            </div>
            {activeStreams.map(({ channel }) => {
              if (!channel) return null;
              return (
                <Card key={channel.id}>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center text-xs font-bold">
                          {channel.displayName[0]}
                        </div>
                        <div>
                          <div className="text-sm font-medium">{channel.displayName}</div>
                          <div className="text-[10px] text-muted-foreground">{channel.category}</div>
                        </div>
                      </div>
                      {channel.isLive && (
                        <Badge variant="outline" className="text-[10px] text-red-500 border-red-500/30">
                          <span className="w-1 h-1 rounded-full bg-red-500 mr-1" />
                          LIVE
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 text-xs h-7"
                        onClick={() => handleExportM3U8(channel.displayName, channel.hlsUrl!)}
                      >
                        <FileText className="h-3 w-3 mr-1" />
                        M3U8
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 text-xs h-7"
                        onClick={() => handleCopyUrl(channel.hlsUrl!)}
                      >
                        {exportedUrl === channel.hlsUrl ? (
                          <CheckCircle className="h-3 w-3 mr-1 text-green-500" />
                        ) : (
                          <Copy className="h-3 w-3 mr-1" />
                        )}
                        Copy URL
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 text-xs h-7"
                        onClick={() => handleExportMetadata(channel.displayName, channel.hlsUrl!)}
                      >
                        <Download className="h-3 w-3 mr-1" />
                        Metadata
                      </Button>
                    </div>
                    {/* Record button */}
                    {!activeRecording && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-xs h-7 mt-1.5 border-red-500/30 text-red-500 hover:bg-red-500/10"
                        onClick={() => handleStartRecording(channel.displayName)}
                      >
                        <Circle className="h-3 w-3 mr-1" />
                        Record Stream
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {activeStreams.length === 0 && !activeRecording && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Download className="h-12 w-12 mb-4 opacity-30" />
            <p className="text-sm">No active streams</p>
            <p className="text-xs mt-1">Add a stream to export its URL</p>
          </div>
        )}

        {/* Download History */}
        {downloads.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                History
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[10px]"
                onClick={clearCompleted}
              >
                Clear
              </Button>
            </div>
            {downloads.map((dl) => (
              <div key={dl.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                <div className="flex items-center gap-2">
                  {dl.status === 'completed' ? (
                    <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                  ) : dl.status === 'failed' ? (
                    <XCircle className="h-3.5 w-3.5 text-red-500" />
                  ) : dl.status === 'recording' ? (
                    <span className="w-3.5 h-3.5 flex items-center justify-center">
                      <span className="w-2 h-2 rounded-full bg-red-500 record-pulse" />
                    </span>
                  ) : (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  )}
                  <div>
                    <div className="text-xs font-medium">{dl.channelName}</div>
                    <div className="text-[10px] text-muted-foreground">{dl.format.toUpperCase()}</div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  onClick={() => removeDownload(dl.id)}
                >
                  <Trash2 className="h-2.5 w-2.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
