'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Hls, { type ErrorData } from 'hls.js';
import { usePlayerStore } from '@/stores/playerStore';
import { recordHLSError, recordPlayerCrash } from '@/lib/telemetry';
import type { StreamStats } from '@/types';

const PROXY_BASE = '/api/kick/proxy/hls';
const ALLOWED_HOSTS = [
  'playback.live-video.net',
  'playlist.live-video.net',
  'stream.kick.com',
  'cf-hls-media.kick.com',
  'files.kick.com',
  'kick.com',
  'vod-cdn.kick.com',
  'thumb-cdn.kick.com',
  'clips-cdn.kick.com',
  'images.kick.com',
  'assets.kick.com',
  // AWS CloudFront distributions used by Kick
  'd1ymq67oymj63v.cloudfront.net',
  'd2nvs31859zcd8.cloudfront.net',
  'd3vd9lf5q06oi0.cloudfront.net',
  // Generic wildcards
  '.cloudfront.net',
  '.live-video.net',
  '.kick.com',
];

// ─── Retry configuration ─────────────────────────────────────────────────────

const MAX_NETWORK_RETRIES = 5;
const MAX_MEDIA_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 30000;
const RETRY_BACKOFF_FACTOR = 2;

// ─── Quality levels ──────────────────────────────────────────────────────────

export type QualityLevel = 'auto' | '1080p' | '720p' | '480p' | '360p' | '160p';

const QUALITY_HEIGHT_MAP: Record<string, number> = {
  '1080p': 1080,
  '720p': 720,
  '480p': 480,
  '360p': 360,
  '160p': 160,
};

/**
 * Convert a direct Kick/IVS URL to a proxied URL to bypass CORS.
 *
 * Since the HLS proxy now rewrites M3U8 manifests to proxy all sub-URLs,
 * we only need to proxy the initial master playlist URL. Segment URLs
 * inside the manifest will already be rewritten by the server.
 */
function proxyUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const isAllowed = ALLOWED_HOSTS.some(h => {
      // Wildcard prefix (e.g., ".cloudfront.net" matches any subdomain)
      if (h.startsWith('.')) {
        return parsed.hostname.endsWith(h) || parsed.hostname === h.slice(1);
      }
      // Exact match or subdomain match
      return parsed.hostname === h || parsed.hostname.endsWith('.' + h);
    });
    if (!isAllowed) return url;
    return `${PROXY_BASE}/${parsed.hostname}${parsed.pathname}${parsed.search}`;
  } catch {
    // Relative URLs (already proxied) pass through unchanged
    return url;
  }
}

export function useHLS(videoRef: React.RefObject<HTMLVideoElement | null>, src?: string) {
  const hlsRef = useRef<Hls | null>(null);
  const { latencyMode, setPlaying, setLiveLatency, updateStats, setDvrAvailable, setDvrDuration, setDvrPosition } = usePlayerStore();
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [connectionState, setConnectionState] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [qualityLevels, setQualityLevels] = useState<{ height: number; bitrate: number }[]>([]);
  const [currentQuality, setCurrentQuality] = useState<QualityLevel>('auto');

  // Refs for retry tracking (to avoid stale closures in event handlers)
  const networkRetryRef = useRef(0);
  const mediaRetryRef = useRef(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastErrorKeyRef = useRef<string>('');
  const statsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const srcRef = useRef(src);

  // Keep srcRef in sync with src prop (must be in effect to avoid render-time ref update)
  useEffect(() => {
    srcRef.current = src;
  }, [src]);

  const getLatencyConfig = useCallback(() => {
    switch (latencyMode) {
      case 'low':
        return {
          liveSyncDurationCount: 1,
          liveMaxLatencyDurationCount: 3,
          liveDurationInfinity: true,
          backBufferLength: 30,
          progressive: false,
          maxBufferLength: 10,
          maxMaxBufferLength: 15,
        };
      case 'normal':
        return {
          liveSyncDurationCount: 3,
          liveMaxLatencyDurationCount: 6,
          liveDurationInfinity: true,
          backBufferLength: 30,
          progressive: false,
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
        };
      case 'dvr':
        return {
          liveSyncDurationCount: 6,
          liveMaxLatencyDurationCount: 30,
          liveDurationInfinity: true,
          backBufferLength: 300,
          progressive: true,
          maxBufferLength: 120,
          maxMaxBufferLength: 600,
        };
    }
  }, [latencyMode]);

  // Cleanup helper
  const cleanupHls = useCallback(() => {
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
      statsIntervalRef.current = null;
    }
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
  }, []);

  // Initialize HLS instance
  const initHls = useCallback((video: HTMLVideoElement, sourceUrl: string) => {
    cleanupHls();

    // Reset retry counters for new source
    networkRetryRef.current = 0;
    mediaRetryRef.current = 0;
    lastErrorKeyRef.current = '';
    setRetryCount(0);
    setError(null);
    setIsRetrying(false);
    setIsLoading(true);
    setConnectionState('connecting');

    const proxiedSrc = proxyUrl(sourceUrl);
    const latencyConfig = getLatencyConfig();

    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: latencyMode === 'low',
      backBufferLength: latencyConfig.backBufferLength,
      liveSyncDurationCount: latencyConfig.liveSyncDurationCount,
      liveMaxLatencyDurationCount: latencyConfig.liveMaxLatencyDurationCount,
      liveDurationInfinity: latencyConfig.liveDurationInfinity,
      progressive: latencyConfig.progressive,
      // Buffer architecture tuned per latency mode
      maxBufferLength: latencyConfig.maxBufferLength,
      maxMaxBufferLength: latencyConfig.maxMaxBufferLength,
      // NOTE: No xhrSetup — the server-side HLS proxy rewrites all URLs inside
      // M3U8 manifests, so all segment/key/playlist URLs already point to our
      // proxy. Using xhrSetup to call xhr.open() can interfere with hls.js
      // internals and cause double-opens or missed headers. If a URL slips
      // through that isn't proxied, it's better to let it fail with a CORS
      // error (which the retry logic handles) than to corrupt the XHR state.
      // The only URL we need to proxy is the initial source, handled by
      // proxyUrl(sourceUrl) above.
      // Frag loading timeout — increase for slow connections
      fragLoadingTimeOut: 20000,
      fragLoadingMaxRetry: 6,
      fragLoadingMaxRetryTimeout: 64000,
      fragLoadingRetryDelay: 1000,
      // Manifest loading
      manifestLoadingTimeOut: 15000,
      manifestLoadingMaxRetry: 4,
      manifestLoadingRetryDelay: 1000,
      // Level loading
      levelLoadingTimeOut: 15000,
      levelLoadingMaxRetry: 4,
      levelLoadingRetryDelay: 1000,
      // ABR — start at lower quality for faster start
      startLevel: -1, // auto
      capLevelToPlayerSize: true,
      // Buffer size limits
      maxBufferSize: 60 * 1000 * 1000,
      maxBufferHole: 0.5,
    });

    hls.loadSource(proxiedSrc);
    hls.attachMedia(video);

    // ─── Error handler (defined inline to avoid stale closures) ──────
    const handleHLSError = (data: ErrorData) => {
      // Create a deduplication key to avoid recording identical errors repeatedly
      const errorKey = `${data.type}:${data.details}:${data.fatal}`;

      // Record HLS error to telemetry (with deduplication)
      if (errorKey !== lastErrorKeyRef.current) {
        lastErrorKeyRef.current = errorKey;
        recordHLSError({
          type: data.type,
          details: data.details,
          fatal: data.fatal,
          url: sourceUrl,
          latencyMode,
        });
      }

      // Non-fatal errors — just track, don't disrupt playback or spam console
      if (!data.fatal) {
        // Only log buffer-related errors at debug level since they're very common
        const isBufferNoise = data.details === 'bufferStalledError' ||
          data.details === 'bufferAppendError' ||
          data.details === 'bufferFullError';
        if (!isBufferNoise) {
          console.debug('[hls] Non-fatal error:', data.type, data.details);
        }
        return;
      }

      setConnectionState('error');

      // Record player crash
      const stats = usePlayerStore.getState().stats;
      recordPlayerCrash({
        hlsUrl: sourceUrl,
        errorType: data.type === Hls.ErrorTypes.NETWORK_ERROR ? 'network'
          : data.type === Hls.ErrorTypes.MEDIA_ERROR ? 'media' : 'unknown',
        errorMessage: `${data.type}: ${data.details}`,
        latencyMode,
        audioMode: usePlayerStore.getState().audioMode,
        bitrate: stats?.bitrate,
        resolution: stats?.resolution ? `${stats.resolution.width}x${stats.resolution.height}` : undefined,
        bufferLength: stats?.bufferLength,
        liveLatency: stats?.latency,
        droppedFrames: stats?.droppedFrames,
      });

      switch (data.type) {
        case Hls.ErrorTypes.NETWORK_ERROR: {
          const currentRetry = networkRetryRef.current;
          if (currentRetry < MAX_NETWORK_RETRIES) {
            networkRetryRef.current = currentRetry + 1;
            const delay = Math.min(
              INITIAL_RETRY_DELAY_MS * Math.pow(RETRY_BACKOFF_FACTOR, currentRetry),
              MAX_RETRY_DELAY_MS,
            );

            // Provide specific error messages
            let errorMsg = 'Network error';
            if (data.details === 'manifestLoadError') {
              // Check if the response was 404 — stream is offline
              const resp = data.response;
              if (resp && resp.code === 404) {
                errorMsg = 'Stream is offline — channel is not currently live';
              } else if (resp && resp.code === 403) {
                errorMsg = 'Stream token expired — click retry to refresh';
              } else {
                errorMsg = 'Cannot load stream — server unreachable';
              }
            } else if (data.details === 'manifestLoadTimeOut') {
              errorMsg = 'Stream load timed out — slow connection';
            } else if (data.details === 'fragLoadError' || data.details === 'fragLoadTimeOut') {
              errorMsg = 'Video segment failed to load — reconnecting';
            } else if (data.details === 'levelLoadError' || data.details === 'levelLoadTimeOut') {
              errorMsg = 'Quality level failed to load — reconnecting';
            } else if (data.details === 'keyLoadError') {
              errorMsg = 'Stream key error — retrying';
            }

            setError(`${errorMsg} (${currentRetry + 1}/${MAX_NETWORK_RETRIES})...`);
            setIsRetrying(true);
            setRetryCount(currentRetry + 1);

            // Clear any pending retry
            if (retryTimeoutRef.current) {
              clearTimeout(retryTimeoutRef.current);
            }

            retryTimeoutRef.current = setTimeout(() => {
              if (hlsRef.current === hls) {
                hls.startLoad();
              }
            }, delay);
          } else {
            setError(`Network error — unable to connect after ${MAX_NETWORK_RETRIES} attempts. The stream may be offline or your connection is unstable.`);
            setIsRetrying(false);
            setIsLoading(false);
            hls.destroy();
          }
          break;
        }

        case Hls.ErrorTypes.MEDIA_ERROR: {
          const currentRetry = mediaRetryRef.current;
          if (currentRetry < MAX_MEDIA_RETRIES) {
            mediaRetryRef.current = currentRetry + 1;
            const delay = Math.min(
              INITIAL_RETRY_DELAY_MS * Math.pow(RETRY_BACKOFF_FACTOR, currentRetry),
              MAX_RETRY_DELAY_MS,
            );

            let errorMsg = 'Media error';
            if (data.details === 'bufferStalledError') {
              errorMsg = 'Buffer stalled — recovering';
            } else if (data.details === 'bufferAppendError') {
              errorMsg = 'Buffer error — recovering';
            } else if (data.details === 'bufferFullError') {
              errorMsg = 'Buffer full — recovering';
            }

            setError(`${errorMsg} (${currentRetry + 1}/${MAX_MEDIA_RETRIES})...`);
            setIsRetrying(true);
            setRetryCount(currentRetry + 1);

            if (retryTimeoutRef.current) {
              clearTimeout(retryTimeoutRef.current);
            }

            retryTimeoutRef.current = setTimeout(() => {
              if (hlsRef.current === hls) {
                hls.recoverMediaError();
              }
            }, delay);
          } else {
            setError(`Media error — unable to recover after ${MAX_MEDIA_RETRIES} attempts. Try a different quality or latency mode.`);
            setIsRetrying(false);
            setIsLoading(false);
            hls.destroy();
          }
          break;
        }

        default: {
          setError('Fatal playback error — stream may be unavailable. The streamer may be offline.');
          setIsRetrying(false);
          setIsLoading(false);
          hls.destroy();
          break;
        }
      }
    };

    // ─── Event: MANIFEST_PARSED ───────────────────────────────────────
    hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
      console.debug('[hls] Manifest parsed, levels:', data.levels.length);
      setIsLoading(false);
      setConnectionState('connected');
      setError(null);
      setIsRetrying(false);

      // Build quality level list
      const levels = hls.levels.map(l => ({ height: l.height, bitrate: l.bitrate }));
      setQualityLevels(levels);

      // Try autoplay: unmuted first, then muted, then show play button
      video.play().catch(() => {
        // Autoplay blocked — try muted
        console.warn('[hls] Autoplay blocked, trying muted...');
        video.muted = true;
        video.play().catch(() => {
          // Even muted autoplay failed — user needs to interact
          console.warn('[hls] Even muted autoplay failed — user interaction needed');
        });
      });
      setPlaying(true);
    });

    // ─── Event: LEVEL_SWITCHED ────────────────────────────────────────
    hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
      const level = hls.levels[data.level];
      if (level) {
        // Update current quality display
        const height = level.height;
        if (height >= 1080) setCurrentQuality('1080p');
        else if (height >= 720) setCurrentQuality('720p');
        else if (height >= 480) setCurrentQuality('480p');
        else if (height >= 360) setCurrentQuality('360p');
        else setCurrentQuality('160p');
      }
    });

    // ─── Event: ERROR ─────────────────────────────────────────────────
    hls.on(Hls.Events.ERROR, (_event, data) => {
      handleHLSError(data);
    });

    // ─── Event: FRAG_BUFFERED — track quality ─────────────────────────
    hls.on(Hls.Events.FRAG_BUFFERED, () => {
      // Stream is buffering correctly — clear any stale loading state
      setIsLoading(false);
    });

    // ─── Stats tracking ────────────────────────────────────────────────
    statsIntervalRef.current = setInterval(() => {
      if (!hls || !video) return;
      try {
        const quality = hls.levels?.[hls.currentLevel];
        const stats: StreamStats = {
          bitrate: quality?.bitrate ?? 0,
          resolution: quality
            ? { width: quality.width, height: quality.height }
            : { width: 0, height: 0 },
          fps: quality?.attrs?.['FRAME-RATE']
            ? parseFloat(quality.attrs['FRAME-RATE'])
            : 0,
          bufferLength: video.buffered.length > 0
            ? video.buffered.end(video.buffered.length - 1) - video.currentTime
            : 0,
          latency: video.duration && isFinite(video.duration)
            ? (video.duration - video.currentTime) * 1000
            : 0,
          droppedFrames: (video as HTMLVideoElement & { getVideoPlaybackQuality?: () => { droppedVideoFrames: number } }).getVideoPlaybackQuality?.()?.droppedVideoFrames ?? 0,
          bandwidth: hls.bandwidthEstimate ?? 0,
          timestamp: Date.now(),
        };
        updateStats(stats);
        setLiveLatency(stats.latency);

        if (isFinite(video.duration) && video.duration > 0) {
          setDvrDuration(video.duration);
          setDvrAvailable(true);
          const position = (video.currentTime / video.duration) * 100;
          setDvrPosition(position);
        }
      } catch {
        // Ignore stats errors — they shouldn't crash the player
      }
    }, 1000);

    hlsRef.current = hls;
  }, [latencyMode, getLatencyConfig, cleanupHls, setPlaying, setLiveLatency, updateStats, setDvrAvailable, setDvrDuration, setDvrPosition]);

  // Manual retry function — fully resets the video element and reinitializes
  const manualRetry = useCallback(() => {
    const video = videoRef.current;
    const currentSrc = srcRef.current;
    if (!video || !currentSrc) return;

    // Fully reset the video element before reinitializing
    cleanupHls();
    video.pause();
    video.removeAttribute('src');
    video.load();
    // Small delay to let the video element fully reset
    setTimeout(() => {
      if (videoRef.current && srcRef.current) {
        initHls(videoRef.current, srcRef.current);
      }
    }, 100);
  }, [videoRef, cleanupHls, initHls]);

  // ─── Set quality level ─────────────────────────────────────────────────
  const setQuality = useCallback((quality: QualityLevel) => {
    const hls = hlsRef.current;
    if (!hls) return;

    setCurrentQuality(quality);

    if (quality === 'auto') {
      hls.currentLevel = -1;
      return;
    }

    const targetHeight = QUALITY_HEIGHT_MAP[quality];
    if (!targetHeight) return;

    // Find the best matching level
    const levelIndex = hls.levels.findIndex(l => l.height === targetHeight);
    if (levelIndex >= 0) {
      hls.currentLevel = levelIndex;
    } else {
      // Find the closest level that's <= targetHeight
      const closest = hls.levels
        .map((l, i) => ({ height: l.height, index: i }))
        .filter(l => l.height <= targetHeight)
        .sort((a, b) => b.height - a.height)[0];

      if (closest) {
        hls.currentLevel = closest.index;
      }
    }
  }, []);

  // ─── Main effect: initialize when src changes ───────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) {
      cleanupHls();
      setConnectionState('disconnected');
      setError(null);
      setIsLoading(false);
      setQualityLevels([]);
      setCurrentQuality('auto');
      return;
    }

    if (Hls.isSupported()) {
      initHls(video, src);
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari native HLS — still needs proxy for CORS
      const proxiedSrc = proxyUrl(src);
      video.src = proxiedSrc;
      setIsLoading(true);
      setConnectionState('connecting');

      const handleLoadedMetadata = () => {
        video.play().catch(() => {});
        setPlaying(true);
        setIsLoading(false);
        setConnectionState('connected');
        setError(null);
      };
      const handleError = () => {
        setError('Failed to load stream — the video element encountered an error');
        setIsLoading(false);
        setConnectionState('error');
      };

      video.addEventListener('loadedmetadata', handleLoadedMetadata);
      video.addEventListener('error', handleError);

      return () => {
        video.removeEventListener('loadedmetadata', handleLoadedMetadata);
        video.removeEventListener('error', handleError);
        video.src = '';
        video.load();
        setConnectionState('disconnected');
      };
    } else {
      setError('HLS is not supported in this browser');
      setConnectionState('error');
    }

    return () => {
      cleanupHls();
      setConnectionState('disconnected');
    };
  }, [src, initHls, cleanupHls, setPlaying, videoRef]);

  return {
    error,
    hlsInstance: hlsRef,
    retryCount,
    isRetrying,
    isLoading,
    manualRetry,
    connectionState,
    qualityLevels,
    currentQuality,
    setQuality,
  };
}
