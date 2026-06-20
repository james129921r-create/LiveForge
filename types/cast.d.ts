// Google Cast SDK type declarations
// These are loaded dynamically at runtime via script injection.
// Only present in Chrome browsers after the SDK script loads.

// ─── Cast Framework Types ──────────────────────────────────────────────────

interface CastSession {
  getCastDevice(): { friendlyName: string };
  endSession(stopCasting: boolean): void;
}

interface CastContextInstance {
  setOptions(options: Record<string, unknown>): void;
  addEventListener(event: string, callback: (event: { sessionState: string }) => void): void;
  requestSession(): Promise<void>;
  getCurrentSession(): CastSession | null;
}

interface CastFramework {
  CastContext: {
    getInstance(): CastContextInstance;
  };
  CastContextEventType: {
    SESSION_STATE_CHANGED: string;
  };
  SessionState: {
    SESSION_STARTED: string;
    SESSION_ENDED: string;
    SESSION_RESUMED: string;
  };
}

interface ChromeCastMedia {
  DEFAULT_MEDIA_RECEIVER_APP_ID: string;
}

interface ChromeCast {
  media: ChromeCastMedia;
  AutoJoinPolicy: {
    ORIGIN_SCOPED: string;
  };
}

interface ChromeWithCast {
  cast?: ChromeCast;
}

// ─── HTMLVideoElement extension for AirPlay ────────────────────────────────

interface HTMLVideoElementWithAirplay extends HTMLVideoElement {
  webkitShowPlaybackTargetPicker?: () => void;
}

// ─── Window augmentation ───────────────────────────────────────────────────

declare global {
  interface Window {
    __onGCastApiAvailable?: (isAvailable: boolean) => void;
    chrome?: ChromeWithCast;
    cast?: {
      framework?: CastFramework;
    };
  }
}

export {
  type CastSession,
  type CastContextInstance,
  type CastFramework,
  type ChromeWithCast,
  type HTMLVideoElementWithAirplay,
};
