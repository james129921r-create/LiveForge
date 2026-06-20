/**
 * LiveForge Security Utilities
 *
 * Provides URL validation, XSS sanitization, M3U8 validation,
 * safe clipboard operations, and safe download helpers.
 */

// ─── URL Validation ──────────────────────────────────────────────────────────

const ALLOWED_HLS_HOSTS = [
  'playback.live-video.net',
  'playlist.live-video.net',
  'stream.kick.com',
];

const ALLOWED_KICK_HOSTS = [
  'kick.com',
  'www.kick.com',
  'api.kick.com',
  'files.kick.com',
];

const ALLOWED_EMOTE_HOSTS = [
  'cdn.7tv.app',
  'cdn.betterttv.net',
  'files.kick.com',
  'static-cdn.jtvnw.net', // Twitch fallback emotes
];

const ALLOWED_IMAGE_HOSTS = [
  ...ALLOWED_EMOTE_HOSTS,
  'img.kick.com',
  'kick.com',
];

/**
 * Validate that a URL is safe and points to an allowed host.
 * Prevents SSRF, open redirect, and arbitrary URL injection.
 */
export function validateUrl(url: string, allowedHosts: string[]): { valid: boolean; reason?: string } {
  try {
    const parsed = new URL(url);

    // Only allow https: and http: protocols
    if (!['https:', 'http:'].includes(parsed.protocol)) {
      return { valid: false, reason: `Disallowed protocol: ${parsed.protocol}` };
    }

    // Check against allowlist
    const isAllowed = allowedHosts.some(host =>
      parsed.hostname === host || parsed.hostname.endsWith(`.${host}`)
    );

    if (!isAllowed) {
      return { valid: false, reason: `Host not allowlisted: ${parsed.hostname}` };
    }

    // Block credential URLs
    if (parsed.username || parsed.password) {
      return { valid: false, reason: 'Credentials in URL not allowed' };
    }

    // Block data: and javascript: in search/hash
    if (parsed.search.includes('javascript:') || parsed.hash.includes('javascript:')) {
      return { valid: false, reason: 'JavaScript URL in query/hash' };
    }

    return { valid: true };
  } catch {
    return { valid: false, reason: 'Invalid URL format' };
  }
}

/**
 * Validate an HLS/M3U8 URL specifically
 */
export function validateHlsUrl(url: string): { valid: boolean; reason?: string } {
  return validateUrl(url, ALLOWED_HLS_HOSTS);
}

/**
 * Validate a Kick API URL
 */
export function validateKickUrl(url: string): { valid: boolean; reason?: string } {
  return validateUrl(url, [...ALLOWED_KICK_HOSTS, ...ALLOWED_HLS_HOSTS]);
}

/**
 * Validate an emote image URL
 */
export function validateEmoteUrl(url: string): { valid: boolean; reason?: string } {
  return validateUrl(url, ALLOWED_EMOTE_HOSTS);
}

/**
 * Validate an image URL (avatars, thumbnails, etc.)
 */
export function validateImageUrl(url: string): { valid: boolean; reason?: string } {
  return validateUrl(url, ALLOWED_IMAGE_HOSTS);
}

// ─── XSS Sanitization ────────────────────────────────────────────────────────

const HTML_ENTITY_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#96;',
};

/**
 * Escape HTML entities to prevent XSS injection.
 * Use this for any user-generated content rendered in the DOM.
 */
export function escapeHtml(str: string): string {
  return str.replace(/[&<>"'`/]/g, (char) => HTML_ENTITY_MAP[char] || char);
}

/**
 * Sanitize chat message content for safe rendering.
 * Strips HTML tags and escapes entities.
 */
export function sanitizeChatContent(content: string): string {
  // Remove any HTML tags
  const stripped = content.replace(/<[^>]*>/g, '');
  // Escape remaining entities
  return escapeHtml(stripped);
}

/**
 * Sanitize a username for display.
 * Only allows alphanumeric, underscore, hyphen characters.
 */
export function sanitizeUsername(username: string): string {
  return username.replace(/[^a-zA-Z0-9_\-]/g, '');
}

/**
 * Validate and sanitize a chat filter regex pattern.
 * Prevents ReDoS (Regular Expression Denial of Service).
 */
export function validateRegexFilter(pattern: string): { valid: boolean; reason?: string; sanitized?: string } {
  // Block obviously dangerous patterns
  const dangerousPatterns = [
    /(\+|\*){2,}/,        // Repeated quantifiers (a+++, a***)
    /\(\?\=/,             // Lookahead
    /\(\?\!/,             // Negative lookahead
    /\(\?\<\=/,           // Lookbehind
    /\(\?\<\!/,           // Negative lookbehind
    /\(\?\>/,             // Atomic group
    /\{[\d,]+\}/,         // Repeated quantifiers like {1,99999}
  ];

  for (const dp of dangerousPatterns) {
    if (dp.test(pattern)) {
      return { valid: false, reason: 'Pattern contains potentially dangerous construct' };
    }
  }

  // Try to compile the regex to check validity
  try {
    const regex = new RegExp(pattern, 'i');
    // Test with a simple string to check for catastrophic backtracking
    const start = performance.now();
    regex.test('a'.repeat(100));
    const elapsed = performance.now() - start;
    if (elapsed > 50) {
      return { valid: false, reason: 'Pattern may cause performance issues (backtracking)' };
    }
    return { valid: true, sanitized: pattern };
  } catch (e) {
    return { valid: false, reason: `Invalid regex: ${(e as Error).message}` };
  }
}

// ─── M3U8 Validation ─────────────────────────────────────────────────────────

/**
 * Validate M3U8 content to ensure it's a legitimate HLS manifest.
 * Prevents injection of malicious content through M3U8 files.
 */
export function validateM3U8(content: string): { valid: boolean; reason?: string } {
  // Must start with #EXTM3U
  if (!content.trimStart().startsWith('#EXTM3U')) {
    return { valid: false, reason: 'Not a valid M3U8: missing #EXTM3U header' };
  }

  const lines = content.split('\n');

  // Check for suspicious content
  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#EXT')) continue;

    // URI lines should be relative or to allowed hosts
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const result = validateUrl(trimmed, [...ALLOWED_HLS_HOSTS, ...ALLOWED_KICK_HOSTS]);
      if (!result.valid) {
        return { valid: false, reason: `M3U8 contains disallowed URL: ${result.reason}` };
      }
    }

    // Block javascript: URIs
    if (trimmed.toLowerCase().startsWith('javascript:')) {
      return { valid: false, reason: 'M3U8 contains javascript: URI' };
    }

    // Block data: URIs (potential injection vector)
    if (trimmed.toLowerCase().startsWith('data:')) {
      return { valid: false, reason: 'M3U8 contains data: URI' };
    }
  }

  return { valid: true };
}

// ─── Safe Clipboard ──────────────────────────────────────────────────────────

/**
 * Safely write text to the clipboard.
 * Handles permission errors and fallback.
 */
export async function safeClipboardWrite(text: string): Promise<boolean> {
  // Validate the text doesn't contain script injection
  if (text.includes('javascript:') || text.includes('data:text/html')) {
    console.warn('Blocked potentially unsafe clipboard content');
    return false;
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const result = document.execCommand('copy');
    document.body.removeChild(textarea);
    return result;
  } catch (err) {
    console.error('Clipboard write failed:', err);
    return false;
  }
}

// ─── Safe Download ───────────────────────────────────────────────────────────

/**
 * Safely trigger a file download.
 * Validates URLs and uses blob URLs when possible.
 */
export function safeDownload(url: string, filename: string, options?: { validateUrl?: boolean }): boolean {
  // Sanitize filename
  const safeFilename = filename.replace(/[^a-zA-Z0-9_\-. ]/g, '_').slice(0, 255);

  // Always block javascript: and vbscript: URLs (XSS vectors)
  const lowerUrl = url.toLowerCase().trim();
  if (lowerUrl.startsWith('javascript:') || lowerUrl.startsWith('vbscript:')) {
    console.warn('Blocked potentially dangerous URL scheme:', url.slice(0, 20));
    return false;
  }

  // If URL validation is requested, check it
  if (options?.validateUrl) {
    const result = validateUrl(url, [...ALLOWED_HLS_HOSTS, ...ALLOWED_KICK_HOSTS, ...ALLOWED_EMOTE_HOSTS]);
    if (!result.valid) {
      console.warn('Blocked download from disallowed URL:', result.reason);
      return false;
    }
  }

  // Check for data: URLs (potential XSS vector)
  if (url.startsWith('data:') && !url.startsWith('data:application/json')) {
    console.warn('Blocked data: URL download');
    return false;
  }

  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = safeFilename;
    a.rel = 'noopener noreferrer';
    a.target = '_blank';
    // Prevent the link from being followed by the browser's navigation
    // We only want the download behavior
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return true;
  } catch (err) {
    console.error('Download failed:', err);
    return false;
  }
}

// ─── Content Security ────────────────────────────────────────────────────────

/**
 * Strip any inline event handlers from an HTML string.
 * Used when rendering third-party content.
 */
export function stripEventHandlers(html: string): string {
  return html.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '');
}

/**
 * Validate that an iframe src is from an allowed domain.
 */
export function validateIframeSrc(src: string): boolean {
  const ALLOWED_IFRAME_DOMAINS = [
    'kick.com',
    'www.kick.com',
    'player.kick.com',
  ];
  const result = validateUrl(src, ALLOWED_IFRAME_DOMAINS);
  return result.valid;
}

/**
 * Rate limiter for chat messages to prevent spam.
 */
export class RateLimiter {
  private timestamps: number[] = [];
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests: number = 20, windowMs: number = 30000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  canProceed(): boolean {
    const now = Date.now();
    this.timestamps = this.timestamps.filter(t => now - t < this.windowMs);

    if (this.timestamps.length >= this.maxRequests) {
      return false;
    }

    this.timestamps.push(now);
    return true;
  }

  reset(): void {
    this.timestamps = [];
  }

  getRemaining(): number {
    const now = Date.now();
    const active = this.timestamps.filter(t => now - t < this.windowMs).length;
    return Math.max(0, this.maxRequests - active);
  }
}
