/// <reference lib="webworker" />

const CACHE_NAME = 'liveforge-v1';
const STATIC_CACHE = 'liveforge-static-v1';
const SETTINGS_CACHE = 'liveforge-settings-v1';
const MEDIA_CACHE = 'liveforge-media-v1';

// Static assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
];

// Settings data keys to persist offline
const SETTINGS_KEYS = [
  'liveforge-streams',
  'liveforge-settings',
];

// Install: cache static assets and settings
self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)),
      caches.open(SETTINGS_CACHE).then(async (cache) => {
        // Pre-warm settings cache
        for (const key of SETTINGS_KEYS) {
          cache.put(`/settings/${key}`, new Response(JSON.stringify({ cached: true }), {
            headers: { 'Content-Type': 'application/json' },
          }));
        }
      }),
    ])
  );
  // Skip waiting to activate immediately
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== STATIC_CACHE && key !== SETTINGS_CACHE && key !== MEDIA_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch: network-first for API, cache-first for static, stale-while-revalidate for media
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip cross-origin requests
  if (url.origin !== self.location.origin) return;

  // HLS proxy: network only (MUST check before /api/ to avoid caching live streams)
  // Caching HLS manifests/segments causes stale playback data and stream failures
  if (url.pathname.startsWith('/api/kick/proxy/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // API routes: network-first with short cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(event.request, SETTINGS_CACHE, 10000)); // 10s cache
    return;
  }

  // Static assets: cache-first
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.woff2') ||
    url.pathname.endsWith('.woff') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.ico')
  ) {
    event.respondWith(cacheFirst(event.request, STATIC_CACHE));
    return;
  }

  // HTML pages: stale-while-revalidate for offline shell
  if (event.request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(staleWhileRevalidate(event.request, STATIC_CACHE));
    return;
  }

  // Default: network with cache fallback
  event.respondWith(networkFirst(event.request, STATIC_CACHE, 60000));
});

// Cache-first strategy
async function cacheFirst(request: Request, cacheName: string): Promise<Response> {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

// Network-first strategy with cache fallback
async function networkFirst(request: Request, cacheName: string, maxAge: number): Promise<Response> {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) {
      // Check cache age
      const dateHeader = cached.headers.get('date');
      if (dateHeader) {
        const age = Date.now() - new Date(dateHeader).getTime();
        if (age < maxAge) return cached;
      } else {
        return cached;
      }
    }
    return new Response(JSON.stringify({ error: 'Offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// Stale-while-revalidate strategy
async function staleWhileRevalidate(request: Request, cacheName: string): Promise<Response> {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached || new Response('Offline', { status: 503, statusText: 'Offline' }));

  return cached || fetchPromise;
}

// Handle update notifications
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data?.type === 'GET_VERSION') {
    event.source?.postMessage({ type: 'VERSION', version: CACHE_NAME });
  }
});
