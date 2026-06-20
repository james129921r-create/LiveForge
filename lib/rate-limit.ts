/**
 * Cluster-aware Rate Limiting
 *
 * Currently in-memory with sliding window, structured for future Redis migration.
 * Uses a sliding window algorithm where each key maintains an array of timestamps.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  retryAfterMs?: number;
}

export class RateLimiter {
  private windows: Map<string, number[]> = new Map();
  private maxRequests: number;
  private windowMs: number;

  constructor(options: { maxRequests: number; windowMs: number }) {
    this.maxRequests = options.maxRequests;
    this.windowMs = options.windowMs;
  }

  check(key: string): RateLimitResult {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Get or create window for this key
    let timestamps = this.windows.get(key);

    if (!timestamps) {
      timestamps = [now];
      this.windows.set(key, timestamps);
      return {
        allowed: true,
        remaining: this.maxRequests - 1,
        resetTime: now + this.windowMs,
      };
    }

    // Prune timestamps outside the sliding window
    let pruneIdx = 0;
    while (pruneIdx < timestamps.length && timestamps[pruneIdx]! < windowStart) {
      pruneIdx++;
    }

    if (pruneIdx > 0) {
      timestamps = timestamps.slice(pruneIdx);
      this.windows.set(key, timestamps);
    }

    // Check if limit exceeded
    if (timestamps.length >= this.maxRequests) {
      const oldestInWindow = timestamps[0]!;
      const resetTime = oldestInWindow + this.windowMs;
      const retryAfterMs = resetTime - now;

      return {
        allowed: false,
        remaining: 0,
        resetTime,
        retryAfterMs: Math.max(retryAfterMs, 1000),
      };
    }

    // Add current timestamp
    timestamps.push(now);

    return {
      allowed: true,
      remaining: this.maxRequests - timestamps.length,
      resetTime: now + this.windowMs,
    };
  }

  reset(key: string): void {
    this.windows.delete(key);
  }

  /**
   * Prune expired windows.
   * @returns count of keys removed
   */
  cleanup(): number {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    let removed = 0;

    for (const [key, timestamps] of this.windows) {
      // Remove timestamps outside the window
      const validTimestamps = timestamps.filter(t => t >= windowStart);
      if (validTimestamps.length === 0) {
        this.windows.delete(key);
        removed++;
      } else if (validTimestamps.length !== timestamps.length) {
        this.windows.set(key, validTimestamps);
      }
    }

    return removed;
  }

  /**
   * Get stats for monitoring.
   */
  getStats(): { activeKeys: number; totalRequests: number } {
    let totalRequests = 0;
    for (const timestamps of this.windows.values()) {
      totalRequests += timestamps.length;
    }
    return {
      activeKeys: this.windows.size,
      totalRequests,
    };
  }
}
