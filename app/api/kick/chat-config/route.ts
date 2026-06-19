import { NextResponse } from 'next/server';

/**
 * Dynamic Pusher Config Fetcher
 *
 * Scrapes Kick's frontend JavaScript to extract the CURRENT Pusher app key
 * and cluster. This is Strategy A for future-proofing against unannounced
 * key rotations — when Kick rotates their Pusher credentials, this endpoint
 * will return the new values without requiring a code deploy.
 *
 * The Pusher key is a PUBLIC client-side key (not a developer secret) — it's
 * embedded in Kick's browser JS bundle and is safe to expose.
 *
 * Caches results for 1 hour to avoid hammering Kick's CDN on every request.
 */

interface PusherConfig {
  key: string;
  cluster: string;
  channelPattern: string;  // e.g., "chatrooms.{id}.v2"
  eventName: string;       // e.g., "App\Events\ChatMessageEvent"
  fetchedAt: number;
  source: 'scraped' | 'fallback';
}

// In-memory cache (1 hour TTL)
let cachedConfig: PusherConfig | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// Fallback values — updated when we manually discover a key rotation.
// These are the last-known-good values as of 2026-06.
const FALLBACK: PusherConfig = {
  key: '32cbd69e4b950bf97679',
  cluster: 'us2',
  channelPattern: 'chatrooms.{id}.v2',
  eventName: 'App\\Events\\ChatMessageEvent',
  fetchedAt: 0,
  source: 'fallback',
};

/**
 * Scrape Kick's frontend for the Pusher config by fetching their main JS bundle
 * and extracting the key/cluster via regex.
 */
async function scrapeKickPusherConfig(): Promise<PusherConfig | null> {
  try {
    // Step 1: Fetch Kick's homepage to find the main JS chunk URL
    const homepageRes = await fetch('https://kick.com', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LiveForge/1.0)',
        'Accept': 'text/html',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!homepageRes.ok) return null;

    const html = await homepageRes.text();

    // Step 2: Find JS bundle URLs — look for _next/static chunks or assets.kick.com chunks
    // Kick uses Next.js, so their JS is in _next/static/ or similar paths
    const jsUrls: string[] = [];

    // Match script src attributes
    const scriptRegex = /src=["']([^"']*\.js[^"']*?)["']/g;
    let match;
    while ((match = scriptRegex.exec(html)) !== null) {
      const src = match[1];
      if (src && (src.includes('_next') || src.includes('assets.kick.com'))) {
        jsUrls.push(src.startsWith('//') ? `https:${src}` : src.startsWith('http') ? src : `https://kick.com${src}`);
      }
    }

    // Step 3: Fetch the JS bundles and search for Pusher config
    // Prioritize chunks that might contain the env/config module
    for (const jsUrl of jsUrls.slice(0, 8)) { // Check up to 8 chunks
      try {
        const jsRes = await fetch(jsUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LiveForge/1.0)' },
          signal: AbortSignal.timeout(6000),
        });
        if (!jsRes.ok) continue;

        const jsText = await jsRes.text();

        // Look for the Pusher key pattern — it appears in Next.js env modules as:
        // NEXT_PUBLIC_PUSHER_KEY:"32cbd69e4b950bf97679"
        // or PUSHER_KEY="32cbd69e4b950bf97679"
        const keyMatch = jsText.match(
          /(?:NEXT_PUBLIC_)?PUSHER_(?:APP_)?KEY[:"\s=]+["']([a-f0-9]{20})["']/i
        );
        const clusterMatch = jsText.match(
          /(?:NEXT_PUBLIC_)?PUSHER_(?:APP_)?CLUSTER[:"\s=]+["']([a-z]{2,3}\d?)[\"']/i
        );

        if (keyMatch?.[1]) {
          const key = keyMatch[1];
          const cluster = clusterMatch?.[1] || 'us2';

          // Detect channel pattern from the same bundle
          let channelPattern = 'chatrooms.{id}.v2';
          let eventName = 'App\\Events\\ChatMessageEvent';

          // Look for chatrooms channel pattern
          if (jsText.includes('chatrooms.') && jsText.includes('.v2')) {
            channelPattern = 'chatrooms.{id}.v2';
          } else if (jsText.includes('channel.') && !jsText.includes('chatrooms.')) {
            channelPattern = 'channel.{id}';
          }

          // Look for event name
          if (jsText.includes('ChatMessageEvent')) {
            eventName = 'App\\Events\\ChatMessageEvent';
          } else if (jsText.includes('ChatMessageSent')) {
            eventName = 'App\\Events\\ChatMessageSent';
          }

          console.log(`[chat-config] Scraped Pusher config: key=${key}, cluster=${cluster}, channel=${channelPattern}, event=${eventName}`);

          return {
            key,
            cluster,
            channelPattern,
            eventName,
            fetchedAt: Date.now(),
            source: 'scraped',
          };
        }
      } catch {
        // Skip this chunk, try next
      }
    }

    return null;
  } catch (error) {
    console.warn('[chat-config] Failed to scrape Kick frontend:', (error as Error).message);
    return null;
  }
}

export async function GET() {
  // Return cached config if still fresh
  if (cachedConfig && Date.now() - cachedConfig.fetchedAt < CACHE_TTL_MS) {
    return NextResponse.json(cachedConfig, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=600',
      },
    });
  }

  // Attempt to scrape the current config from Kick's frontend
  const scraped = await scrapeKickPusherConfig();

  if (scraped) {
    cachedConfig = scraped;
    return NextResponse.json(scraped, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=600',
      },
    });
  }

  // Scrape failed — return fallback with stale-while-revalidate so browsers
  // can still use the cached fallback while we try again in the background
  const result: PusherConfig = {
    ...FALLBACK,
    fetchedAt: cachedConfig?.fetchedAt || Date.now(),
    source: 'fallback',
  };

  return NextResponse.json(result, {
    headers: {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
    },
  });
}
