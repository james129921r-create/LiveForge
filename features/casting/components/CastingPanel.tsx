'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Cast, Airplay, Monitor, Wifi, RefreshCw, Loader2, CheckCircle } from 'lucide-react';
import type { HTMLVideoElementWithAirplay } from '@/types/cast';

interface CastDevice {
  id: string;
  name: string;
  type?: string;
}

export function CastingPanel() {
  const [castAvailable, setCastAvailable] = useState(false);
  const [isSearchingChromecast, setIsSearchingChromecast] = useState(false);
  const [_devices, setDevices] = useState<CastDevice[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<string | null>(null);
  const [castError, setCastError] = useState<string | null>(null);
  const [airplaySupported, setAirplaySupported] = useState(false);
  const castInitializedRef = useRef(false);

  const initializeCastApi = useCallback(() => {
    if (typeof window === 'undefined' || castInitializedRef.current) return;

    const castFramework = window.cast?.framework;

    try {
      // Use Cast Framework if available
      if (castFramework) {
        const context = castFramework.CastContext.getInstance();
        context.setOptions({
          receiverApplicationId: window.chrome?.cast?.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
          autoJoinPolicy: window.chrome?.cast?.AutoJoinPolicy.ORIGIN_SCOPED,
        });

        context.addEventListener(
          castFramework.CastContextEventType.SESSION_STATE_CHANGED,
          (event: { sessionState: string }) => {
            if (event.sessionState === castFramework.SessionState.SESSION_STARTED) {
              const session = context.getCurrentSession();
              if (session) {
                setConnectedDevice(session.getCastDevice().friendlyName || 'Unknown Device');
              }
            } else if (
              event.sessionState === castFramework.SessionState.SESSION_ENDED ||
              event.sessionState === castFramework.SessionState.SESSION_RESUMED
            ) {
              if (event.sessionState === castFramework.SessionState.SESSION_ENDED) {
                setConnectedDevice(null);
              }
            }
          }
        );

        setCastAvailable(true);
        castInitializedRef.current = true;
      }
    } catch (err) {
      console.warn('Cast SDK initialization failed:', err);
      setCastAvailable(false);
    }
  }, []);

  // Load Google Cast SDK dynamically
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check AirPlay support
    const video = document.createElement('video') as HTMLVideoElementWithAirplay;
    if ('webkitShowPlaybackTargetPicker' in video) {
      setAirplaySupported(true);
    }

    // Load Cast SDK
    const existingScript = document.querySelector('script[src*="cast_sender"]');
    if (existingScript) {
      initializeCastApi();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
    script.async = true;
    script.onload = () => {
      // Wait for the SDK to be ready
      const checkReady = setInterval(() => {
        if (window.chrome?.cast || window.cast?.framework) {
          clearInterval(checkReady);
          initializeCastApi();
        }
      }, 100);

      // Timeout after 10 seconds
      setTimeout(() => clearInterval(checkReady), 10000);
    };
    document.head.appendChild(script);
  }, [initializeCastApi]);

  const searchDevices = useCallback(async () => {
    if (!castAvailable) {
      setCastError('Chromecast SDK not available. Make sure you are using Chrome.');
      return;
    }

    const castFramework = window.cast?.framework;
    setIsSearchingChromecast(true);
    setCastError(null);
    setDevices([]);

    try {
      if (castFramework) {
        const context = castFramework.CastContext.getInstance();

        // Request a session which triggers browser native device discovery
        await context.requestSession();

        // Get discovered devices from the session
        const session = context.getCurrentSession();
        if (session) {
          const deviceName = session.getCastDevice().friendlyName || 'Unknown Device';
          setDevices([{ id: 'current', name: deviceName, type: 'chromecast' }]);
          setConnectedDevice(deviceName);
        }
      }
    } catch (err: unknown) {
      const error = err as { code?: string };
      if (error?.code === 'cancel') {
        setCastError('Device selection cancelled.');
      } else {
        setCastError('No devices found. Make sure your Chromecast is on the same network.');
      }
    } finally {
      setIsSearchingChromecast(false);
    }
  }, [castAvailable]);

  const handleDisconnect = useCallback(() => {
    const castFramework = window.cast?.framework;
    if (castFramework) {
      const context = castFramework.CastContext.getInstance();
      const session = context.getCurrentSession();
      if (session) {
        session.endSession(true);
      }
    }
    setConnectedDevice(null);
    setDevices([]);
  }, []);

  const handleAirPlay = useCallback(() => {
    const video = document.querySelector('video') as HTMLVideoElementWithAirplay | null;
    if (video?.webkitShowPlaybackTargetPicker) {
      video.webkitShowPlaybackTargetPicker();
    }
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Cast className="h-5 w-5" />
          Casting
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Cast to your TV or speakers
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Chromecast */}
        <Card className="overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Cast className="h-5 w-5 text-blue-500" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium">Chromecast</div>
                <div className="text-xs text-muted-foreground">
                  {castAvailable ? 'Cast to Google devices' : 'Not available in this browser'}
                </div>
              </div>
              {connectedDevice && (
                <Wifi className="h-4 w-4 text-blue-500 animate-pulse" />
              )}
            </div>

            {/* Connected device */}
            {connectedDevice ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 p-2 rounded-lg bg-blue-500/10">
                  <CheckCircle className="h-4 w-4 text-blue-500" />
                  <span className="text-sm font-medium">{connectedDevice}</span>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  className="w-full"
                  onClick={handleDisconnect}
                >
                  Disconnect
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Button
                  variant="default"
                  size="sm"
                  className="w-full"
                  onClick={searchDevices}
                  disabled={isSearchingChromecast || !castAvailable}
                >
                  {isSearchingChromecast ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                      Searching...
                    </>
                  ) : (
                    'Find Devices'
                  )}
                </Button>

                {/* Error state */}
                {castError && (
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground mb-2">{castError}</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs gap-1"
                      onClick={searchDevices}
                    >
                      <RefreshCw className="h-3 w-3" />
                      Retry
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* AirPlay */}
        <Card className="overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-gray-500/10 flex items-center justify-center">
                <Airplay className="h-5 w-5 text-gray-400" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium">AirPlay</div>
                <div className="text-xs text-muted-foreground">
                  {airplaySupported ? 'Cast to Apple devices' : 'Safari only'}
                </div>
              </div>
            </div>
            <Button
              variant="default"
              size="sm"
              className="w-full"
              onClick={handleAirPlay}
              disabled={!airplaySupported}
            >
              <Airplay className="h-3.5 w-3.5 mr-1.5" />
              Open AirPlay Picker
            </Button>
          </CardContent>
        </Card>

        {/* Info */}
        <div className="text-center text-xs text-muted-foreground mt-6 p-4 bg-muted/30 rounded-lg">
          <Monitor className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p>Make sure your casting device is on the same network</p>
          <p className="mt-1">Chromecast requires Chrome browser</p>
        </div>
      </div>
    </div>
  );
}
