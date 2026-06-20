'use client';

import { useCallback, useEffect } from 'react';
import { usePlayerStore } from '@/stores/playerStore';
import { useSettingsStore } from '@/stores/settingsStore';

export function usePlaybackControls(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const {
    isPlaying, isMuted, volume, isTheaterMode, isFullscreen, audioMode,
    setPlaying, setMuted, setVolume, toggleTheaterMode, setFullscreen,
    setAudioMode, setPiP,
  } = usePlayerStore();

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
      setPlaying(true);
    } else {
      video.pause();
      setPlaying(false);
    }
  }, [videoRef, setPlaying]);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(!isMuted);
  }, [videoRef, isMuted, setMuted]);

  const changeVolume = useCallback((v: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = v;
    setVolume(v);
    if (v > 0 && video.muted) {
      video.muted = false;
      setMuted(false);
    }
  }, [videoRef, setVolume, setMuted]);

  const seekTo = useCallback((time: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = time;
  }, [videoRef]);

  const seekRelative = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, video.currentTime + seconds);
  }, [videoRef]);

  const changePlaybackRate = useCallback((rate: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = rate;
  }, [videoRef]);

  const togglePiP = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setPiP(false);
      } else {
        await video.requestPictureInPicture();
        setPiP(true);
      }
    } catch (err) {
      console.debug('PiP failed:', err);
    }
  }, [videoRef, setPiP]);

  const toggleFullscreen = useCallback((container: HTMLElement | null) => {
    if (!container) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
      setFullscreen(false);
    } else {
      container.requestFullscreen();
      setFullscreen(true);
    }
  }, [setFullscreen]);

  const toggleAudioOnly = useCallback(() => {
    const newMode = audioMode === 'audioOnly' ? 'normal' : 'audioOnly';
    setAudioMode(newMode);
  }, [audioMode, setAudioMode]);

  return {
    isPlaying, isMuted, volume, isTheaterMode, isFullscreen, audioMode,
    togglePlay, toggleMute, changeVolume, seekTo, seekRelative,
    changePlaybackRate, togglePiP, toggleFullscreen, toggleTheaterMode,
    toggleAudioOnly,
  };
}

export function useKeyboardShortcuts(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const { keyboardShortcuts } = useSettingsStore();
  const { togglePlay, toggleMute, togglePiP, toggleTheaterMode, toggleAudioOnly, seekRelative } = usePlaybackControls(videoRef);
  const { setStreamSyncEnabled, streamSyncEnabled } = usePlayerStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const key = e.key;
      if (key === keyboardShortcuts.playPause) { e.preventDefault(); togglePlay(); }
      else if (key === keyboardShortcuts.toggleMute) { e.preventDefault(); toggleMute(); }
      else if (key === keyboardShortcuts.toggleTheater) { e.preventDefault(); toggleTheaterMode(); }
      else if (key === keyboardShortcuts.togglePiP) { e.preventDefault(); togglePiP(); }
      else if (key === keyboardShortcuts.toggleAudioOnly) { e.preventDefault(); toggleAudioOnly(); }
      else if (key === keyboardShortcuts.createClip) { e.preventDefault(); /* Clip handled in HLSPlayer */ }
      else if (key === keyboardShortcuts.toggleSync) { e.preventDefault(); setStreamSyncEnabled(!streamSyncEnabled); }
      else if (key === keyboardShortcuts.volumeUp) {
        e.preventDefault();
        const video = videoRef.current;
        if (video) video.volume = Math.min(1, video.volume + 0.05);
      }
      else if (key === keyboardShortcuts.volumeDown) {
        e.preventDefault();
        const video = videoRef.current;
        if (video) video.volume = Math.max(0, video.volume - 0.05);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [keyboardShortcuts, togglePlay, toggleMute, toggleTheaterMode, togglePiP, toggleAudioOnly, seekRelative, setStreamSyncEnabled, streamSyncEnabled, videoRef]);
}
