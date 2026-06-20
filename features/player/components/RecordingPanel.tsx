'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePlayerStore } from '@/stores/playerStore';
import { useMultiStreamStore } from '@/stores/multiStreamStore';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Circle, Square, Trash2, AlertTriangle,
  Download, Clock, HardDrive, Zap, RotateCcw, Archive,
} from 'lucide-react';
import { safeDownload } from '@/lib/security';

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Estimate file size from bitrate and duration.
 * Default to 4 Mbps (typical stream bitrate) if stats not available.
 */
function estimateFileSize(bitrateBps: number, durationSeconds: number): number {
  // bitrateBps is in bits per second, file size in bytes
  return (bitrateBps / 8) * durationSeconds;
}

// ─── IndexedDB Recovery ─────────────────────────────────────────────────────

const IDB_NAME = 'liveforge-recordings';
const IDB_STORE = 'partial-recordings';
const IDB_VERSION = 1;

async function openDB(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) return null;
  return new Promise((resolve) => {
    const request = indexedDB.open(IDB_NAME, IDB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

async function _savePartialRecording(data: { id: string; channelName: string; channelSlug: string; startedAt: number; blob: Blob }): Promise<void> {
  const db = await openDB();
  if (!db) return;
  return new Promise((resolve) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    store.put(data);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

async function getPartialRecordings(): Promise<Array<{ id: string; channelName: string; channelSlug: string; startedAt: number; blob: Blob }>> {
  const db = await openDB();
  if (!db) return [];
  return new Promise((resolve) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const store = tx.objectStore(IDB_STORE);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => resolve([]);
  });
}

async function deletePartialRecording(id: string): Promise<void> {
  const db = await openDB();
  if (!db) return;
  return new Promise((resolve) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

/**
 * RecordingPanel — Enhanced recording management.
 *
 * - Auto-record toggle (global and per-channel)
 * - Recording queue status
 * - Stop All Recordings button
 * - Estimated file size based on current bitrate and duration
 * - Recording recovery from IndexedDB after crash
 */
export function RecordingPanel() {
  const {
    isRecording,
    isRecordingPaused,
    recordingDuration,
    recordingFormat,
    recordingUrl,
    recordingBlob,
    stats,
    autoRecord,
    setAutoRecord,
    recordingQueue,
    addToRecordingQueue,
    removeFromRecordingQueue,
    perChannelAutoRecord,
    setPerChannelAutoRecord,
    clipLibrary,
    removeFromClipLibrary,
  } = usePlayerStore();
  const { slots } = useMultiStreamStore();

  const [partialRecordings, setPartialRecordings] = useState<Array<{
    id: string;
    channelName: string;
    channelSlug: string;
    startedAt: number;
    blob: Blob;
  }>>([]);

  // Load partial recordings from IndexedDB on mount (crash recovery)
  useEffect(() => {
    getPartialRecordings().then(setPartialRecordings);
  }, []);

  // Calculate estimated file size
  const currentBitrate = stats?.bitrate ?? 4000000; // Default 4 Mbps
  const estimatedFileSize = estimateFileSize(currentBitrate, recordingDuration);

  // Get active streams for per-channel auto-record
  const activeStreams = slots.filter((s) => s.channel);

  // Handle recording recovery
  const handleRecoverRecording = useCallback(async (rec: typeof partialRecordings[0]) => {
    const url = URL.createObjectURL(rec.blob);
    const extension = 'webm';
    const filename = `recovered_${rec.channelName}_${new Date(rec.startedAt).toISOString().slice(0, 19).replace(/[:.]/g, '-')}.${extension}`;
    safeDownload(url, filename);
    // Delete from IndexedDB after recovery
    await deletePartialRecording(rec.id);
    setPartialRecordings((prev) => prev.filter((p) => p.id !== rec.id));
  }, []);

  const handleDeletePartial = useCallback(async (id: string) => {
    await deletePartialRecording(id);
    setPartialRecordings((prev) => prev.filter((p) => p.id !== id));
  }, []);

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {/* Global Auto-Record Toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              <div>
                <span className="text-sm font-medium">Auto-Record</span>
                <p className="text-[10px] text-muted-foreground">Auto-start recording when streams go live</p>
              </div>
            </div>
            <Switch
              checked={autoRecord}
              onCheckedChange={setAutoRecord}
            />
          </div>

          <Separator />

          {/* Current Recording Status */}
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground">Current Recording</span>
            {isRecording ? (
              <div className="rounded-lg border border-border/50 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${isRecordingPaused ? 'bg-yellow-400' : 'bg-red-500 animate-pulse'}`} />
                  <span className="text-sm font-medium font-mono">
                    {isRecordingPaused ? 'PAUSED' : 'RECORDING'}
                  </span>
                  <Badge variant="outline" className="text-[9px] ml-auto">
                    {recordingFormat.toUpperCase()}
                  </Badge>
                </div>

                {/* Duration */}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span className="font-mono">{formatDuration(recordingDuration)}</span>
                  <span className="text-muted-foreground/50">/ 30:00 max</span>
                </div>

                {/* Estimated file size */}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <HardDrive className="h-3 w-3" />
                  <span>{formatFileSize(estimatedFileSize)} estimated</span>
                  <span className="text-muted-foreground/50">
                    ({(currentBitrate / 1000000).toFixed(1)} Mbps)
                  </span>
                </div>

                {/* Progress bar */}
                <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ${isRecordingPaused ? 'bg-yellow-400' : 'bg-red-500'}`}
                    style={{ width: `${Math.min((recordingDuration / 1800) * 100, 100)}%` }}
                  />
                </div>

                {/* Stop All Recordings */}
                <Button
                  variant="destructive"
                  size="sm"
                  className="w-full gap-1.5 h-8"
                >
                  <Square className="h-3 w-3" />
                  Stop Recording
                </Button>
              </div>
            ) : recordingUrl ? (
              <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
                  <span className="text-sm font-medium">Recording Ready</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <HardDrive className="h-3 w-3" />
                  <span>{recordingBlob ? formatFileSize(recordingBlob.size) : 'Unknown size'}</span>
                </div>
                <Button
                  size="sm"
                  className="w-full gap-1.5 h-8"
                  onClick={() => {
                    if (recordingUrl) {
                      const filename = `recording_${new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')}.${recordingFormat === 'mp4' ? 'mp4' : 'webm'}`;
                      safeDownload(recordingUrl, filename);
                    }
                  }}
                >
                  <Download className="h-3 w-3" />
                  Download Recording
                </Button>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border/50 p-4 text-center">
                <Circle className="h-6 w-6 mx-auto mb-2 text-muted-foreground/30" />
                <p className="text-xs text-muted-foreground">No active recording</p>
                <p className="text-[10px] text-muted-foreground/60">Use the record button on a stream to start</p>
              </div>
            )}
          </div>

          <Separator />

          {/* Recording Queue */}
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground">Recording Queue</span>
            {recordingQueue.length === 0 ? (
              <p className="text-[10px] text-muted-foreground/60">No channels queued for auto-recording</p>
            ) : (
              <div className="space-y-1">
                {recordingQueue.map((slug) => (
                  <div key={slug} className="flex items-center justify-between rounded-md px-2 py-1.5 bg-muted/30">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                      <span className="text-xs">{slug}</span>
                    </div>
                    <button
                      className="text-muted-foreground hover:text-red-400 transition-colors"
                      onClick={() => removeFromRecordingQueue(slug)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Separator />

          {/* Per-Channel Auto-Record */}
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground">Per-Channel Auto-Record</span>
            {activeStreams.length === 0 ? (
              <p className="text-[10px] text-muted-foreground/60">No active streams to configure</p>
            ) : (
              <div className="space-y-1">
                {activeStreams.map((slot) => {
                  const slug = slot.channel?.username || '';
                  const isAutoRecord = perChannelAutoRecord[slug] ?? false;
                  return (
                    <div key={slot.id} className="flex items-center justify-between rounded-md px-2 py-1.5 bg-muted/30">
                      <span className="text-xs truncate max-w-[140px]">{slot.channel?.displayName || slug}</span>
                      <Switch
                        checked={isAutoRecord}
                        onCheckedChange={(checked) => {
                          setPerChannelAutoRecord(slug, checked);
                          if (checked) {
                            addToRecordingQueue(slug);
                          } else {
                            removeFromRecordingQueue(slug);
                          }
                        }}
                        className="scale-75"
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <Separator />

          {/* Recording Recovery */}
          {partialRecordings.length > 0 && (
            <>
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  <span className="text-xs font-medium text-yellow-500">Crash Recovery</span>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Found {partialRecordings.length} partial recording(s) from a previous session. You can recover or delete them.
                </p>
                <div className="space-y-1">
                  {partialRecordings.map((rec) => (
                    <div key={rec.id} className="rounded-md border border-yellow-500/30 bg-yellow-500/5 p-2 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">{rec.channelName}</span>
                        <span className="text-[9px] text-muted-foreground">
                          {formatFileSize(rec.blob.size)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-[10px] gap-1 flex-1"
                          onClick={() => handleRecoverRecording(rec)}
                        >
                          <RotateCcw className="h-2.5 w-2.5" />
                          Recover
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-[10px] gap-1 text-red-400 hover:text-red-500"
                          onClick={() => handleDeletePartial(rec.id)}
                        >
                          <Trash2 className="h-2.5 w-2.5" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <Separator />
            </>
          )}

          {/* Clip Library */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Clip Library</span>
              <Badge variant="outline" className="text-[9px]">{clipLibrary.length}</Badge>
            </div>
            {clipLibrary.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/50 p-4 text-center">
                <Archive className="h-6 w-6 mx-auto mb-2 text-muted-foreground/30" />
                <p className="text-xs text-muted-foreground">No clips saved yet</p>
                <p className="text-[10px] text-muted-foreground/60">Create clips and save them to your library</p>
              </div>
            ) : (
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {clipLibrary.map((clip) => (
                  <div key={clip.id} className="flex items-center justify-between rounded-md px-2 py-1.5 bg-muted/30 group/clip">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                      <div className="min-w-0">
                        <span className="text-[11px] font-medium truncate block">{clip.channelName}</span>
                        <span className="text-[9px] text-muted-foreground">{formatDuration(clip.duration)} · {clip.format?.toUpperCase() || 'WEBM'}</span>
                      </div>
                    </div>
                    <button
                      className="opacity-0 group-hover/clip:opacity-100 text-muted-foreground hover:text-red-400 transition-opacity shrink-0"
                      onClick={() => removeFromClipLibrary(clip.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
