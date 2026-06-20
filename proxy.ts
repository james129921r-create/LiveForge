import { NextRequest, NextResponse } from 'next/server';
import { RateLimiter } from '@/lib/rate-limit';

/**
 * LiveForge Security Proxy (Next.js 16 naming convention)
 *
 * Adds security headers, rate limiting, and request validation
 * to all incoming requests.
 *
 * Rate limit tiers:
 *   - General API: 200 req/min
 *   - Search API: 30 req/min (more expensive)
 *   - Popular/Streams: 60 req/min
 *   - Recommendations: 20 req/min (triggers 25+ upstream API calls)
 *   - HLS proxy: 100 req/min
 */

// ─── Rate Limiters (per tier) ────────────────────────────────────────────────

const generalLimiter = new RateLimiter({ maxRequests: 200, windowMs: 60_000 });
const searchLimiter = new RateLimiter({ maxRequests: 30, windowMs: 60_000 });
const popularLimiter = new RateLimiter({ maxRequests: 60, windowMs: 60_000 });
const recommendationsLimiter = new RateLimiter({ maxRequests: 20, windowMs: 60_000 });
const hlsLimiter = new RateLimiter({ maxRequests: 100, windowMs: 60_000 });

// Periodic cleanup of expired rate limit windows
let lastCleanup = Date.now();
const CLEANUP_INTERVAL_MS = 60_000;

function cleanupRateLimiters() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  generalLimiter.cleanup();
  searchLimiter.cleanup();
  popularLimiter.cleanup();
  recommendationsLimiter.cleanup();
  hlsLimiter.cleanup();
}

/**
 * Determine which rate limiter to use based on the request path.
 */
function getRateLimitResult(ip: string, pathname: string) {
  cleanupRateLimiters();

  // HLS proxy routes — separate tier
  if (pathname.startsWith('/api/kick/proxy/hls')) {
    return { result: hlsLimiter.check(`hls:${ip}`), tier: 'hls' };
  }

  // Search routes — more expensive, separate tier
  if (pathname.startsWith('/api/kick/search')) {
    return { result: searchLimiter.check(`search:${ip}`), tier: 'search' };
  }

  // Recommendations — can trigger 25+ upstream API calls per request
  if (pathname.startsWith('/api/kick/recommendations')) {
    return { result: recommendationsLimiter.check(`recs:${ip}`), tier: 'recommendations' };
  }

  // Popular/streams/trending routes — moderate tier
  if (
    pathname.startsWith('/api/kick/popular') ||
    pathname.startsWith('/api/kick/trending') ||
    pathname.startsWith('/api/kick/categories')
  ) {
    return { result: popularLimiter.check(`popular:${ip}`), tier: 'popular' };
  }

  // General API — default tier
  return { result: generalLimiter.check(`general:${ip}`), tier: 'general' };
}

// ─── Security Headers ─────────────────────────────────────────────────────────

function getSecurityHeaders(): Record<string, string> {
  return {
    // Prevent MIME type sniffing
    'X-Content-Type-Options': 'nosniff',

    // Prevent clickjacking — only allow same-origin framing
    'X-Frame-Options': 'SAMEORIGIN',

    // Enable browser XSS protection
    'X-XSS-Protection': '1; mode=block',

    // Control referrer information
    'Referrer-Policy': 'strict-origin-when-cross-origin',

    // Prevent browser features from being accessed cross-origin
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',

    // Content Security Policy
    'Content-Security-Policy': [
      "default-src 'self'",
      // Note: 'unsafe-eval' is required for hls.js worker; 'unsafe-inline' is needed
      // for inline Tailwind styles and the theme script in layout.tsx
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.pusher.com https://www.gstatic.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https://*.kick.com https://kick.com https://img.kick.com https://files.kick.com https://stream.kick.com https://thumb-cdn.kick.com https://clips-cdn.kick.com https://assets.kick.com https://cdn.7tv.app https://cdn.betterttv.net https://static-cdn.jtvnw.net https://*.cloudfront.net https://*.live-video.net https://z-cdn.chatglm.cn https://*.googleusercontent.com",
      "media-src 'self' blob: https://*.live-video.net https://*.kick.com https://kick.com https://stream.kick.com https://files.kick.com https://*.cloudfront.net",
      // blob: needed for hls.js MSE source buffers
      // Pusher WebSocket: allow all Pusher WebSocket endpoints for Kick chat
      // CSP does NOT support *.-prefixed wildcards for connect-src (e.g., wss://*.pusher.com
      // is invalid and causes "Invalid host" parse errors). We must enumerate the known
      // Pusher clusters explicitly. Pusher uses clusters: us, us2, us3, eu, eu2, ap1, ap2, ap3.
      // Both https: and wss: schemes are needed because Pusher falls back to HTTPS streaming
      // when WebSocket is blocked.
      "connect-src 'self' blob: https://kick.com https://api.kick.com https://pusher.com https://ws-pushr.pusher.com https://ws-us.pusher.com https://ws-us2.pusher.com https://ws-us3.pusher.com https://ws-eu.pusher.com https://ws-eu2.pusher.com https://ws-ap1.pusher.com https://ws-ap2.pusher.com https://ws-ap3.pusher.com wss://pusher.com wss://ws-pushr.pusher.com wss://ws-us.pusher.com wss://ws-us2.pusher.com wss://ws-us3.pusher.com wss://ws-eu.pusher.com wss://ws-eu2.pusher.com wss://ws-ap1.pusher.com wss://ws-ap2.pusher.com wss://ws-ap3.pusher.com https://api.betterttv.net https://7tv.io https://cdn.7tv.app https://cdn.betterttv.net https://*.cloudfront.net https://*.live-video.net https://*.kick.com https://www.gstatic.com",
      "font-src 'self' https://fonts.gstatic.com https://fonts.googleapis.com data:",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
    ].join('; '),

    // Strict Transport Security
    //
    // The `preload` directive tells browsers to hard-code this domain as HTTPS-only.
    // HOWEVER: For preload to actually take effect, you MUST manually submit your
    // domain to the official HSTS Preload List at https://hstspreload.org/
    // (maintained by Google, used by Chrome, Firefox, Safari, Edge).
    //
    // Prerequisites for submission:
    //   1. max-age >= 31536000 (1 year) ✅
    //   2. includeSubDomains directive present ✅
    //   3. preload directive present ✅
    //   4. Your site must redirect HTTP → HTTPS on the same domain
    //   5. Your root domain (not just subdomain) must serve the HSTS header
    //
    // ⚠️  WARNING: Preloading is effectively irreversible on a short timeline.
    //     Removal requests take months to propagate. Only enable preload after
    //     confirming ALL subdomains and services support HTTPS.
    //
    // If not ready for preload, change to: 'max-age=31536000; includeSubDomains'
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',

    // Cross-Origin policies
    'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Cross-Origin-Embedder-Policy': 'unsafe-none',
  };
}

// ─── Request Validation ───────────────────────────────────────────────────────

function getClientIp(request: NextRequest): string {
  // Try various headers for the real client IP
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]!.trim();
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }
  return 'unknown';
}

function isApiRequest(pathname: string): boolean {
  return pathname.startsWith('/api/');
}

function isBlockedPath(pathname: string): boolean {
  const blocked = [
    '/.env',
    '/.git',
    '/wp-admin',
    '/wp-login',
    '/phpmyadmin',
    '/admin',
    '/config',
    '/debug',
    '/trace',
    '/actuator',
    '/.well-known/security.txt',
  ];
  return blocked.some(p => pathname.toLowerCase().startsWith(p));
}

// ─── Proxy (Next.js 16 naming) ────────────────────────────────────────────────

export function proxy(request: NextRequest) {
  const { pathname } = new URL(request.url);

  // Block malicious paths
  if (isBlockedPath(pathname)) {
    return new NextResponse(null, { status: 404 });
  }

  // Validate request method for API routes (only GET allowed)
  if (isApiRequest(pathname) && request.method !== 'GET') {
    return NextResponse.json(
      { error: 'Method not allowed' },
      { status: 405 }
    );
  }

  // Rate limiting for API routes
  // Note: Internal API routes that proxy to Kick may spawn multiple sub-requests
  // (e.g., /api/kick/popular makes 16+ fetchKickChannel calls). The rate limit
  // must be generous enough to not block page loads. External-facing API abuse
  // is mitigated by the per-IP limit on individual requests, not on aggregate.
  if (isApiRequest(pathname)) {
    const clientIp = getClientIp(request);
    const { result: rateLimit, tier } = getRateLimitResult(clientIp, pathname);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests', retryAfter: Math.ceil((rateLimit.resetTime - Date.now()) / 1000) },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil((rateLimit.resetTime - Date.now()) / 1000)),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(rateLimit.resetTime),
            'X-RateLimit-Limit': String(tier === 'search' ? 30 : tier === 'popular' ? 60 : tier === 'recommendations' ? 20 : tier === 'hls' ? 100 : 200),
            'X-RateLimit-Tier': tier,
          },
        }
      );
    }

    // Apply security headers + rate limit headers to API responses
    const response = NextResponse.next();
    const securityHeaders = getSecurityHeaders();

    for (const [key, value] of Object.entries(securityHeaders)) {
      response.headers.set(key, value);
    }

    response.headers.set('X-RateLimit-Remaining', String(rateLimit.remaining));
    response.headers.set('X-RateLimit-Reset', String(rateLimit.resetTime));
    response.headers.set('X-RateLimit-Tier', tier);

    return response;
  }

  // For non-API routes, just add security headers
  const response = NextResponse.next();
  const securityHeaders = getSecurityHeaders();

  for (const [key, value] of Object.entries(securityHeaders)) {
    response.headers.set(key, value);
  }

  return response;
}

// ─── Matcher ──────────────────────────────────────────────────────────────────

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (favicon)
     * - public folder assets
     */
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2)$).*)',
  ],
};
