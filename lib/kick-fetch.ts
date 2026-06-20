/**
 * Secure Kick API Fetch Utility
 *
 * Uses a hybrid strategy to reliably reach the Kick API:
 *   1. Primary:  Native async fetch() — fast, serverless-compatible
 *   2. Fallback: async execFile('curl', [array]) — bypasses Cloudflare TLS fingerprinting
 *   3. Optional: residential proxy via KICK_PROXY_URL for hardened environments
 *
 * ⚠️  SERVER-ONLY: This module MUST never be imported from client components.
 *     It accesses server-side environment variables (KICK_PROXY_URL) that
 *     contain sensitive credentials. The `server-only` package enforces this
 *     at build time — importing from client code will cause a compile error.
 *
 * Security design:
 * - execFile('curl', [...args]) uses an argv array — NO shell, NO string interpolation,
 *   so command injection is impossible. This is fundamentally different from the old
 *   execSync(`curl ${userInput}`) which was a critical RCE vulnerability.
 * - Native fetch() is the primary path (fast, serverless-compatible)
 * - curl fallback only triggers on Cloudflare 403 blocks
 * - Built-in rate limiting, retries, and timeout handling
 * - Request/response size limits to prevent memory exhaustion
 * - URL validation to prevent SSRF
 * - Configurable proxy via environment variables
 */

// ─── Server-Only Guard ────────────────────────────────────────────────────────
// This import crashes at build time if this module is ever accidentally imported
// from a client component. It protects KICK_PROXY_URL credentials from leaking.
import 'server-only';

import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// ─── Configuration ────────────────────────────────────────────────────────────

const KICK_API_BASE = 'https://kick.com';

/** Maximum time (ms) to wait for a response */
const REQUEST_TIMEOUT_MS = 12_000;

/** Maximum number of retry attempts for transient errors */
const MAX_RETRIES = 2;

/** Delay between retries (ms) — doubles each attempt */
const RETRY_BASE_DELAY_MS = 500;

/** Maximum response body size (bytes) — 5MB */
const MAX_RESPONSE_SIZE = 5 * 1024 * 1024;

/** Rate limit: max requests per window */
const RATE_LIMIT_MAX = 90;

/** Rate limit: sliding window (ms) */
const RATE_LIMIT_WINDOW_MS = 60_000;

// ─── Proxy Configuration ──────────────────────────────────────────────────────

/**
 * Configure a residential proxy or anti-bot API via environment variables:
 *
 * KICK_PROXY_URL - Full proxy URL, e.g.:
 *   - SOCKS5:  socks5://user:pass@proxy.example.com:1080
 *   - HTTP:    http://user:pass@proxy.example.com:8080
 *   - HTTPS:   https://user:pass@proxy.example.com:443
 *
 * KICK_PROXY_ENABLED - Set to "true" to enable proxy (default: false)
 *
 * For anti-bot APIs (ScrapeOps, ScrapingBee, ZenRows), set KICK_PROXY_URL
 * to the API endpoint with your API key and target URL parameter.
 */

/**
 * Retrieve the proxy URL from environment variables.
 *
 * ⚠️  CRITICAL: KICK_PROXY_URL must NEVER be prefixed with NEXT_PUBLIC_.
 *     Without the prefix, Next.js keeps it server-side only and never
 *     bundles it into the client JavaScript. This prevents your proxy
 *     credentials (user:pass@) from being exposed in the browser.
 *
 *     Correct:   KICK_PROXY_URL=http://user:pass@proxy:8080
 *     DANGEROUS: NEXT_PUBLIC_KICK_PROXY_URL=http://user:pass@proxy:8080
 */
function getProxyUrl(): string | undefined {
  // Guard: prevent accidental client-side execution
  if (typeof window !== 'undefined') {
    console.error('[kickFetch] SECURITY: kickFetch must only be called server-side. Proxy credentials would leak to the client.');
    return undefined;
  }

  if (process.env.KICK_PROXY_ENABLED !== 'true') return undefined;
  return process.env.KICK_PROXY_URL;
}

// ─── Rate Limiter (in-memory, per-process) ────────────────────────────────────

const requestTimestamps: number[] = [];

function checkRateLimit(): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();
  // Prune old timestamps
  while (requestTimestamps.length > 0 && now - requestTimestamps[0]! > RATE_LIMIT_WINDOW_MS) {
    requestTimestamps.shift();
  }

  if (requestTimestamps.length >= RATE_LIMIT_MAX) {
    const oldestInWindow = requestTimestamps[0]!;
    const retryAfterMs = RATE_LIMIT_WINDOW_MS - (now - oldestInWindow);
    return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 1000) };
  }

  requestTimestamps.push(now);
  return { allowed: true };
}

// ─── URL Validation ───────────────────────────────────────────────────────────

const ALLOWED_KICK_HOSTS = [
  'kick.com',
  'www.kick.com',
  'api.kick.com',
  // Kick CDN domains (SSRF proxy allowlist — restrict CORS proxy to these only)
  'stream.kick.com',
  'files.kick.com',
  'cf-hls-media.kick.com',
  'vod-cdn.kick.com',
  'thumb-cdn.kick.com',
  'clips-cdn.kick.com',
  'images.kick.com',
  'assets.kick.com',
  // Akamai CDN (Kick uses Akamai for some assets)
  'akamaized.net',
];

/**
 * Check if a hostname is a raw IPv4 or IPv6 address.
 * Used to block SSRF attacks that bypass domain allowlists by using IP literals.
 *
 * IPv4: e.g., "192.168.1.1", "10.0.0.1", "127.0.0.1"
 * IPv6: e.g., "::1", "2001:db8::1", "[::1]"
 */
function isIpAddress(hostname: string): boolean {
  // Strip brackets from IPv6 URL notation (e.g., [::1] → ::1)
  const bare = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;

  // IPv4: four decimal octets separated by dots
  const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4Pattern.test(bare)) {
    return true;
  }

  // IPv6: contains colons (covers full, abbreviated, and mixed notation)
  if (bare.includes(':')) {
    return true;
  }

  return false;
}

function validateKickUrl(url: string): { valid: boolean; reason?: string } {
  try {
    const parsed = new URL(url);

    // Only HTTPS allowed for Kick API
    if (parsed.protocol !== 'https:') {
      return { valid: false, reason: `Disallowed protocol: ${parsed.protocol} (only https: allowed)` };
    }

    // Block raw IP addresses to prevent SSRF via IP literals
    if (isIpAddress(parsed.hostname)) {
      return { valid: false, reason: `Raw IP addresses not allowed: ${parsed.hostname}` };
    }

    // Must be a Kick domain
    const isAllowed = ALLOWED_KICK_HOSTS.some(
      host => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`)
    );
    if (!isAllowed) {
      return { valid: false, reason: `Host not allowlisted: ${parsed.hostname}` };
    }

    // Block credential URLs
    if (parsed.username || parsed.password) {
      return { valid: false, reason: 'Credentials in URL not allowed' };
    }

    // Block directory traversal in path
    if (parsed.pathname.includes('..')) {
      return { valid: false, reason: 'Directory traversal not allowed in path' };
    }

    // Maximum path length check
    if (parsed.pathname.length > 1024) {
      return { valid: false, reason: 'Path too long' };
    }

    return { valid: true };
  } catch {
    return { valid: false, reason: 'Invalid URL format' };
  }
}

// ─── Browser-like Headers ─────────────────────────────────────────────────────

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Referer': 'https://kick.com/',
  'Origin': 'https://kick.com',
  'Sec-Ch-Ua': '"Chromium";v="131", "Not_A Brand";v="24"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
  'Connection': 'keep-alive',
};

// ─── Fallback Frequency Tracking ────────────────────────────────────────────

let fetchFallbackCount = 0;
let curlFallbackCount = 0;
let totalRequests = 0;

/**
 * Returns cumulative statistics about fallback usage across all requests.
 * Useful for monitoring how often Cloudflare blocks native fetch() and how
 * often the curl fallback path is triggered.
 */
export function getFallbackStats(): { fetchFallbackCount: number; curlFallbackCount: number; totalRequests: number } {
  return { fetchFallbackCount, curlFallbackCount, totalRequests };
}

// ─── Request ID Tracking ────────────────────────────────────────────────────

let requestIdCounter = 0;

/**
 * Generate a unique incrementing request ID for debugging.
 */
function nextRequestId(): number {
  return ++requestIdCounter;
}

// ─── Request Deduplication ────────────────────────────────────────────────────

/**
 * If the same URL is requested within 2 seconds, return the same promise.
 * This prevents duplicate in-flight requests for the same resource.
 */
const DEDUP_TTL_MS = 2_000;
const inFlightRequests = new Map<string, { promise: Promise<KickFetchResult>; timestamp: number }>();

function getDedupKey(url: string): string {
  return url;
}

// ─── Circuit Breaker ────────────────────────────────────────────────────────

const CIRCUIT_BREAKER_THRESHOLD = 15; // 15 consecutive curl failures before opening
const CIRCUIT_BREAKER_OPEN_MS = 15_000; // Open for 15 seconds (shorter to recover faster)
let circuitBreakerFailures = 0;
let circuitBreakerOpenUntil = 0; // timestamp when circuit breaker will close

/**
 * Check if the circuit breaker is currently open (failing fast).
 */
function isCircuitBreakerOpen(): boolean {
  if (circuitBreakerOpenUntil === 0) return false;
  if (Date.now() >= circuitBreakerOpenUntil) {
    // Half-open: allow one request through to test
    circuitBreakerOpenUntil = 0;
    return false;
  }
  return true;
}

/**
 * Record a curl fallback failure for the circuit breaker.
 */
function recordCircuitBreakerFailure(): void {
  circuitBreakerFailures++;
  if (circuitBreakerFailures >= CIRCUIT_BREAKER_THRESHOLD) {
    circuitBreakerOpenUntil = Date.now() + CIRCUIT_BREAKER_OPEN_MS;
    console.error(`[kickFetch] Circuit breaker OPEN for ${CIRCUIT_BREAKER_OPEN_MS / 1000}s after ${circuitBreakerFailures} consecutive curl failures`);
  }
}

/**
 * Record a successful request (resets circuit breaker failure count).
 */
function recordCircuitBreakerSuccess(): void {
  circuitBreakerFailures = 0;
}

/**
 * Get circuit breaker status for monitoring.
 */
export function getCircuitBreakerStatus(): { isOpen: boolean; failures: number; openUntil: number } {
  return {
    isOpen: isCircuitBreakerOpen(),
    failures: circuitBreakerFailures,
    openUntil: circuitBreakerOpenUntil,
  };
}

// ─── Fetch Implementation ─────────────────────────────────────────────────────

export interface KickFetchOptions {
  /** Number of retries for transient errors (default: MAX_RETRIES) */
  maxRetries?: number;
  /** Request timeout in ms (default: REQUEST_TIMEOUT_MS) */
  timeoutMs?: number;
  /** Additional headers to merge */
  headers?: Record<string, string>;
  /** Custom proxy URL override */
  proxyUrl?: string;
}

export interface KickFetchResult<T = unknown> {
  ok: boolean;
  status: number;
  data: T | null;
  headers: Headers;
  /** Whether the request was rate-limited */
  rateLimited?: boolean;
  /** Whether Cloudflare blocked the request (403) */
  cloudflareBlocked?: boolean;
  /** Which method was used: 'fetch' or 'curl' */
  method?: 'fetch' | 'curl';
}

/**
 * Determine if an HTTP status code is a transient error worth retrying.
 */
function isTransientError(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

/**
 * Detect if a 403 response is from Cloudflare protection.
 */
function isCloudflareBlock(status: number, headers: Headers): boolean {
  if (status !== 403) return false;
  const server = headers.get('server') || '';
  const cfRay = headers.get('cf-ray');
  return server.toLowerCase().includes('cloudflare') || !!cfRay;
}

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Build the proxy dispatcher if a proxy is configured.
 * Uses undici's ProxyAgent for HTTP/HTTPS/SOCKS5 proxy support.
 */
async function buildProxyDispatcher(proxyUrl: string): Promise<unknown | undefined> {
  try {
    const { ProxyAgent } = await import('undici');

    // Determine if this is a SOCKS proxy
    if (proxyUrl.startsWith('socks')) {
      console.warn('[kickFetch] SOCKS proxy requested but socks module not available, falling back to direct fetch');
      return undefined;
    }

    const proxyAgent = new ProxyAgent({
      uri: proxyUrl,
      requestTls: {
        timeout: REQUEST_TIMEOUT_MS,
      },
      connect: {
        rejectUnauthorized: true,
      },
    });

    return proxyAgent;
  } catch (error) {
    console.warn('[kickFetch] Proxy setup failed, falling back to direct fetch:', (error as Error).message);
    return undefined;
  }
}

// ─── curl Concurrency Limiter ────────────────────────────────────────────────

/**
 * Global semaphore to limit concurrent curl child processes.
 *
 * PROBLEM: When Cloudflare blocks native fetch(), ALL requests fall back to curl.
 * If the popular page fetches 24 channels in parallel, that's 24 simultaneous
 * curl processes. Each curl process uses ~50-100MB memory, so 24 processes can
 * consume 1.2-2.4 GB — enough to crash the Node.js process with OOM.
 *
 * SOLUTION: Queue curl requests so at most MAX_CONCURRENT_CURL run at once.
 * The rest wait in a queue and are dispatched as slots free up.
 */
const MAX_CONCURRENT_CURL = 3;
let activeCurlCount = 0;
const curlQueue: Array<() => void> = [];

async function acquireCurlSlot(): Promise<void> {
  if (activeCurlCount < MAX_CONCURRENT_CURL) {
    activeCurlCount++;
    return;
  }
  // Wait for a slot to free up
  return new Promise<void>((resolve) => {
    curlQueue.push(resolve);
  });
}

function releaseCurlSlot(): void {
  activeCurlCount--;
  const next = curlQueue.shift();
  if (next) {
    activeCurlCount++;
    next();
  }
}

// ─── curl Fallback ────────────────────────────────────────────────────────────

/**
 * Execute a request using curl as a child process.
 *
 * SECURITY: This uses execFile with an argv array, NOT exec/execSync with
 * string interpolation. Each argument is a separate array element passed
 * directly to the curl binary — no shell is spawned, so command injection
 * is impossible. This is fundamentally different from the old
 * execSync(`curl ${userInput}`) which was a critical RCE vulnerability.
 *
 * Why curl? Cloudflare's bot detection fingerprints TLS connections.
 * Node.js's built-in fetch (undici) has a distinctive TLS fingerprint that
 * Cloudflare flags as a bot, returning 403. The curl binary uses OpenSSL
 * with a browser-like TLS fingerprint that Cloudflare accepts.
 */
async function curlFetch<T = unknown>(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
  proxyUrl?: string,
): Promise<KickFetchResult<T>> {
  // Build curl argument array — each value is a separate argv element (no shell!)
  const args: string[] = [
    '--silent',
    '--show-error',
    '--compressed',          // handle gzip/deflate/brotli
    '--location',            // follow redirects
    '--max-time', String(Math.ceil(timeoutMs / 1000)),
    '--connect-timeout', '10',
    '--max-filesize', String(MAX_RESPONSE_SIZE),
    '--write-out', '\n__CURL_STATUS__%{http_code}',  // capture actual HTTP status
  ];

  // Add proxy if configured
  if (proxyUrl) {
    args.push('--proxy', proxyUrl);
  }

  // Add headers — each -H and its value are SEPARATE array elements
  for (const [key, value] of Object.entries(headers)) {
    args.push('-H', `${key}: ${value}`);
  }

  // URL is the last argument — passed as a single argv element, no shell interpretation
  args.push(url);

  // Acquire a concurrency slot before spawning curl to prevent OOM from too many
  // simultaneous child processes (each curl uses ~50-100MB memory)
  await acquireCurlSlot();

  try {
    const { stdout, stderr } = await execFileAsync('curl', args, {
      timeout: timeoutMs + 5000, // slightly longer than curl's own --max-time
      maxBuffer: MAX_RESPONSE_SIZE,
      encoding: 'utf-8',
      // No shell: true — this is the default for execFile, ensuring no shell interpretation
    });

    if (!stdout || !stdout.trim()) {
      return { ok: false, status: 204, data: null, headers: new Headers(), method: 'curl' };
    }

    // Extract HTTP status from --write-out marker
    let httpStatus = 200;
    let body = stdout;
    const statusMarkerIdx = stdout.lastIndexOf('\n__CURL_STATUS__');
    if (statusMarkerIdx !== -1) {
      const statusStr = stdout.slice(statusMarkerIdx + '\n__CURL_STATUS__'.length).trim();
      const parsed = parseInt(statusStr, 10);
      if (!isNaN(parsed)) httpStatus = parsed;
      body = stdout.slice(0, statusMarkerIdx);
    }

    // If HTTP status indicates failure, return error result
    if (httpStatus >= 400) {
      console.warn('[kickFetch:curl] HTTP error status:', httpStatus);
      return { ok: false, status: httpStatus, data: null, headers: new Headers(), method: 'curl' };
    }

    // Parse JSON
    let data: T | null = null;
    try {
      data = JSON.parse(body) as T;
    } catch {
      console.warn('[kickFetch:curl] Non-JSON response:', body.slice(0, 200));
    }

    return {
      ok: httpStatus >= 200 && httpStatus < 300,
      status: httpStatus,
      data,
      headers: new Headers(),
      method: 'curl',
    };
  } catch (error) {
    const err = error as Error & { code?: string; killed?: boolean };

    // Check if curl timed out
    if (err.killed || err.code === 'ETIMEDOUT') {
      console.error('[kickFetch:curl] Request timed out after', timeoutMs, 'ms');
      return { ok: false, status: 408, data: null, headers: new Headers(), method: 'curl' };
    }

    // curl exits with non-zero status on HTTP errors
    // Try to extract the HTTP status from the error message
    const statusMatch = err.message.match(/HTTP\/\d\s+(\d{3})/);
    const status = statusMatch ? parseInt(statusMatch[1]!, 10) : 502;

    console.warn('[kickFetch:curl] Error:', err.message.slice(0, 200));
    return { ok: false, status, data: null, headers: new Headers(), method: 'curl' };
  } finally {
    // Always release the slot so queued requests can proceed
    releaseCurlSlot();
  }
}

// ─── Main Fetch Function ──────────────────────────────────────────────────────

/**
 * Securely fetch data from the Kick API using a hybrid strategy:
 *
 * 1. Try native async fetch() first (fast, serverless-compatible)
 * 2. If Cloudflare blocks with 403, automatically fall back to curl
 *    (curl has a browser-like TLS fingerprint that bypasses Cloudflare)
 * 3. Optionally use a residential proxy via KICK_PROXY_URL
 *
 * @param path - API path (e.g., '/api/v2/channels/xqc') or full URL
 * @param options - Fetch options
 * @returns Structured result with status, data, and headers
 */
export async function kickFetch<T = unknown>(
  path: string,
  options: KickFetchOptions = {}
): Promise<KickFetchResult<T>> {
  const {
    maxRetries = MAX_RETRIES,
    timeoutMs = REQUEST_TIMEOUT_MS,
    headers: extraHeaders,
    proxyUrl: proxyOverride,
  } = options;

  // Track total requests
  totalRequests++;

  // Generate request ID for debugging
  const reqId = nextRequestId();

  // Build the full URL
  const url = path.startsWith('http') ? path : `${KICK_API_BASE}${path}`;

  // ── Request deduplication ────────────────────────────────────────────────
  // If the same URL is already being fetched, return the same promise
  const dedupKey = getDedupKey(url);
  const now = Date.now();
  const inFlight = inFlightRequests.get(dedupKey);
  if (inFlight && now - inFlight.timestamp < DEDUP_TTL_MS) {
    return inFlight.promise as Promise<KickFetchResult<T>>;
  }

  // ── Circuit breaker check ────────────────────────────────────────────────
  if (isCircuitBreakerOpen()) {
    console.warn(`[kickFetch:${reqId}] Circuit breaker OPEN — failing fast for:`, url);
    return {
      ok: false,
      status: 503,
      data: null,
      headers: new Headers({ 'X-Circuit-Breaker': 'open' }),
      rateLimited: false,
    };
  }

  // ── Fallback frequency logging ──────────────────────────────────────────
  // Every 100 requests, log the ratio of fetch vs curl usage
  if (totalRequests % 100 === 0 && totalRequests > 0) {
    const fetchRatio = totalRequests > 0 ? (fetchFallbackCount / totalRequests * 100).toFixed(1) : '0';
    const curlRatio = totalRequests > 0 ? (curlFallbackCount / totalRequests * 100).toFixed(1) : '0';
    console.log(`[kickFetch] Fallback stats at ${totalRequests} requests: fetch→curl=${fetchFallbackCount} (${fetchRatio}%), curl=${curlFallbackCount} (${curlRatio}%)`);
  }

  // Validate the URL
  const urlValidation = validateKickUrl(url);
  if (!urlValidation.valid) {
    console.error(`[kickFetch:${reqId}] URL validation failed:`, urlValidation.reason, 'URL:', url, 'method: fetch');
    return { ok: false, status: 400, data: null, headers: new Headers() };
  }

  // Check rate limit
  const rateCheck = checkRateLimit();
  if (!rateCheck.allowed) {
    console.warn('[kickFetch] Rate limited, retry after', rateCheck.retryAfterMs, 'ms', 'URL:', url, 'method: fetch');
    return {
      ok: false,
      status: 429,
      data: null,
      headers: new Headers({ 'Retry-After': String(Math.ceil((rateCheck.retryAfterMs || 1000) / 1000)) }),
      rateLimited: true,
    };
  }

  // Get proxy URL
  const proxyUrl = proxyOverride || getProxyUrl();

  // Build proxy dispatcher if needed (for native fetch path)
  let dispatcher: unknown;
  if (proxyUrl) {
    dispatcher = await buildProxyDispatcher(proxyUrl);
  }

  // Merge headers
  const requestHeaders = {
    ...BROWSER_HEADERS,
    ...extraHeaders,
  };

  // ── Create the fetch promise (for deduplication) ───────────────────────
  const fetchPromise = executeKickFetch<T>(url, requestHeaders, maxRetries, timeoutMs, proxyUrl, reqId, dispatcher);

  // Register in-flight request for deduplication
  inFlightRequests.set(dedupKey, { promise: fetchPromise as Promise<KickFetchResult>, timestamp: Date.now() });

  // Clean up stale dedup entries periodically
  if (inFlightRequests.size > 50) {
    const cutoff = Date.now() - DEDUP_TTL_MS;
    for (const [key, entry] of inFlightRequests) {
      if (entry.timestamp < cutoff) {
        inFlightRequests.delete(key);
      }
    }
  }

  try {
    const result = await fetchPromise;
    return result;
  } finally {
    // Remove from in-flight map after completion
    inFlightRequests.delete(dedupKey);
  }
}

/**
 * Internal implementation of the kick fetch logic.
 * Separated from kickFetch() to support request deduplication.
 */
async function executeKickFetch<T = unknown>(
  url: string,
  requestHeaders: Record<string, string>,
  maxRetries: number,
  timeoutMs: number,
  proxyUrl: string | undefined,
  reqId: number,
  dispatcher: unknown,
): Promise<KickFetchResult<T>> {

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Exponential backoff delay before retry
    if (attempt > 0) {
      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
      const jitter = delay * 0.2 * (Math.random() * 2 - 1);
      await sleep(delay + jitter);
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const fetchOptions: RequestInit & { dispatcher?: unknown } = {
        method: 'GET',
        headers: requestHeaders,
        signal: controller.signal,
        redirect: 'follow',
        dispatcher: dispatcher || undefined,
      };

      const response = await fetch(url, fetchOptions);
      clearTimeout(timeoutId);

      // Detect Cloudflare blocking → fall back to curl immediately
      if (isCloudflareBlock(response.status, response.headers)) {
        fetchFallbackCount++;
        console.warn(
          '[kickFetch] Cloudflare 403 on native fetch, falling back to curl.',
          'URL:', url, 'method: fetch', 'status:', response.status
        );
        // Consume the body to free the connection
        await response.text().catch(() => {});
        break; // Exit the fetch retry loop → fall through to curl
      }

      // Handle transient errors with retry
      if (isTransientError(response.status) && attempt < maxRetries) {
        console.warn(`[kickFetch] Transient error ${response.status} on attempt ${attempt + 1}/${maxRetries + 1}`, 'URL:', url, 'method: fetch');
        lastError = new Error(`HTTP ${response.status}`);
        continue;
      }

      // Log failed requests (non-2xx that aren't Cloudflare or transient)
      if (response.status >= 400) {
        console.error('[kickFetch] Failed request —', 'URL:', url, 'status:', response.status, 'method: fetch');
      }

      // Read response body with size limit
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_SIZE) {
        console.error('[kickFetch] Response too large:', contentLength);
        return { ok: false, status: 413, data: null, headers: response.headers, method: 'fetch' };
      }

      const text = await response.text();

      // Validate response size after reading
      if (text.length > MAX_RESPONSE_SIZE) {
        console.error('[kickFetch] Response body exceeds size limit');
        return { ok: false, status: 413, data: null, headers: response.headers, method: 'fetch' };
      }

      // Parse JSON
      let data: T | null = null;
      if (text.trim()) {
        try {
          data = JSON.parse(text) as T;
        } catch {
          console.warn('[kickFetch] Non-JSON response:', text.slice(0, 200));
        }
      }

      return {
        ok: response.status >= 200 && response.status < 300,
        status: response.status,
        data,
        headers: response.headers,
        cloudflareBlocked: false,
        method: 'fetch',
      };
    } catch (error) {
      lastError = error as Error;

      // Don't retry on abort (timeout) — it will keep timing out
      if ((error as Error).name === 'AbortError') {
        console.error('[kickFetch] Request timed out after', timeoutMs, 'ms', 'URL:', url, 'method: fetch');
        break; // Fall through to curl
      }

      console.warn(`[kickFetch] Attempt ${attempt + 1}/${maxRetries + 1} failed:`, (error as Error).message, 'URL:', url, 'method: fetch');
    }
  }

  // ── Step 2: Fallback to curl (bypasses Cloudflare TLS fingerprinting) ──

  curlFallbackCount++;
  console.info(`[kickFetch:${reqId}] Using curl fallback for:`, url);

  try {
    const curlResult = await curlFetch<T>(url, requestHeaders, timeoutMs, proxyUrl);

    // Log failed curl requests
    // Don't count 404s (channel not found) as circuit breaker failures — those are expected
    // when looking up channels from a static list. Only count server errors (5xx) and
    // Cloudflare blocks (403) as genuine failures.
    if (!curlResult.ok) {
      if (curlResult.status === 404) {
        // Channel not found — expected, don't trip the circuit breaker
        console.info(`[kickFetch:${reqId}:curl] Channel not found (404) —`, 'URL:', url, 'method: curl');
      } else {
        console.error(`[kickFetch:${reqId}:curl] Failed request —`, 'URL:', url, 'status:', curlResult.status, 'method: curl');
        recordCircuitBreakerFailure();
      }
    } else {
      // Successful curl response — reset circuit breaker
      recordCircuitBreakerSuccess();
    }

    // If curl also got a Cloudflare block, mark it
    if (curlResult.status === 403) {
      curlResult.cloudflareBlocked = true;
      console.warn(`[kickFetch:${reqId}:curl] Also blocked by Cloudflare. Consider configuring KICK_PROXY_URL.`, 'URL:', url);
      recordCircuitBreakerFailure();
    }

    return curlResult;
  } catch (error) {
    console.error(`[kickFetch:${reqId}] Both fetch and curl failed:`, (error as Error).message, 'URL:', url);
    recordCircuitBreakerFailure();
    return {
      ok: false,
      status: 502,
      data: null,
      headers: new Headers(),
      cloudflareBlocked: false,
      method: 'curl',
    };
  }
}

// ─── Convenience Methods ──────────────────────────────────────────────────────

/**
 * Fetch a Kick channel by slug.
 */
export async function fetchKickChannel(slug: string) {
  const sanitized = slug.toLowerCase().replace(/[^a-z0-9_\-]/g, '');
  if (!sanitized) {
    // Return a structured error instead of throwing — callers expect KickFetchResult
    return { ok: false, status: 400, data: null, headers: new Headers() };
  }
  return kickFetch(`/api/v2/channels/${encodeURIComponent(sanitized)}`);
}

/**
 * Fetch a Kick channel's livestream data.
 */
export async function fetchKickLivestream(slug: string) {
  const sanitized = slug.toLowerCase().replace(/[^a-z0-9_\-]/g, '');
  if (!sanitized) {
    return { ok: false, status: 400, data: null, headers: new Headers() };
  }
  return kickFetch(`/api/v2/channels/${encodeURIComponent(sanitized)}/livestream`);
}

/**
 * Fetch a Kick channel's chatroom data.
 */
export async function fetchKickChatroom(slug: string) {
  const sanitized = slug.toLowerCase().replace(/[^a-z0-9_\-]/g, '');
  if (!sanitized) {
    return { ok: false, status: 400, data: null, headers: new Headers() };
  }
  return kickFetch(`/api/v2/channels/${encodeURIComponent(sanitized)}/chatroom`);
}

/**
 * Fetch recent messages from a Kick chatroom.
 */
export async function fetchKickChatroomMessages(chatroomId: string | number, limit = 50) {
  const roomId = String(chatroomId).replace(/[^0-9]/g, '');
  if (!roomId) {
    return { ok: false, status: 400, data: null, headers: new Headers() };
  }
  const safeLimit = Math.min(Math.max(1, limit), 100);
  return kickFetch(`/api/v2/chatrooms/${encodeURIComponent(roomId)}/messages?limit=${safeLimit}`);
}

/**
 * Fetch top categories from Kick.
 */
export async function fetchKickCategories() {
  return kickFetch('/api/v1/categories/top');
}

/**
 * Fetch top live streams from Kick's stream directory.
 * Returns only live streams ordered by viewer count.
 * GET https://kick.com/api/v1/streams?page=1&limit=30
 */
export async function fetchKickStreams(page = 1, limit = 30) {
  const safePage = Math.max(1, Math.min(page, 100));
  const safeLimit = Math.max(1, Math.min(limit, 50));
  return kickFetch(`/api/v1/streams?page=${safePage}&limit=${safeLimit}`);
}

/**
 * Fetch live streams for a specific category.
 * Returns only live streams in that category, ordered by viewer count.
 *
 * Kick has two endpoints for category streams:
 *   1. /api/v1/categories/{slug}/livestreams — works for some categories
 *   2. /api/v1/categories/subcategories/{slug}/livestreams — required for others
 *
 * We try the subcategories endpoint first as it's more reliable, then fall back
 * to the direct category endpoint.
 */
export async function fetchKickCategoryLivestreams(slug: string, page = 1, limit = 30) {
  const sanitized = slug.toLowerCase().replace(/[^a-z0-9_\-]/g, '');
  if (!sanitized) {
    return { ok: false, status: 400, data: null, headers: new Headers() };
  }
  const safePage = Math.max(1, Math.min(page, 100));
  const safeLimit = Math.max(1, Math.min(limit, 50));
  const queryParams = `?page=${safePage}&limit=${safeLimit}`;

  // Try subcategories endpoint first (more reliable for Kick's category routing)
  const subResult = await kickFetch(`/api/v1/categories/subcategories/${encodeURIComponent(sanitized)}/livestreams${queryParams}`);
  if (subResult.ok && subResult.data) {
    const data = subResult.data as { data?: unknown[] } | unknown[];
    const items = Array.isArray(data) ? data : ((data as Record<string, unknown>)?.data as unknown[]);
    if (Array.isArray(items) && items.length > 0) {
      return subResult;
    }
  }

  // Fallback to direct category endpoint
  return kickFetch(`/api/v1/categories/${encodeURIComponent(sanitized)}/livestreams${queryParams}`);
}

/**
 * Fetch multiple pages of Kick streams in parallel.
 * Convenience method for routes that need to aggregate results across pages.
 *
 * @param startPage - First page to fetch (default: 1)
 * @param endPage - Last page to fetch (inclusive, default: 2)
 * @param limit - Items per page (max 50, default: 30)
 * @returns Array of KickFetchResult objects, one per page
 */
export async function fetchKickStreamsPaginated(
  startPage = 1,
  endPage = 2,
  limit = 30,
): Promise<KickFetchResult<unknown>[]> {
  const safeStart = Math.max(1, startPage);
  const safeEnd = Math.max(safeStart, endPage);
  const safeLimit = Math.max(1, Math.min(limit, 50));

  // Cap to 5 pages max to prevent abuse
  const maxEnd = Math.min(safeEnd, safeStart + 4);

  const pagePromises: Promise<KickFetchResult<unknown>>[] = [];
  for (let page = safeStart; page <= maxEnd; page++) {
    pagePromises.push(fetchKickStreams(page, safeLimit));
  }

  return Promise.all(pagePromises);
}
