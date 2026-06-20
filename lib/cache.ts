/**
 * Shared Caching Layer for API Routes
 *
 * Currently in-memory only, but structured for future Redis migration.
 * Provides TTL-based expiration, size limits, and hit/miss statistics.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export class ApiCache<T = unknown> {
  private cache: Map<string, CacheEntry<T>>;
  private maxSize: number;
  private defaultTtl: number;
  private hits = 0;
  private misses = 0;
  /** In-flight promises to prevent cache stampede */
  private inFlight: Map<string, Promise<T>> = new Map();

  constructor(options: { maxSize?: number; defaultTtl?: number } = {}) {
    this.cache = new Map();
    this.maxSize = options.maxSize ?? 500;
    this.defaultTtl = options.defaultTtl ?? 60_000; // 60 seconds default
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      // Entry has expired
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;
    return entry.data;
  }

  set(key: string, data: T, ttl?: number): void {
    // Evict oldest entries if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      // Delete the first (oldest) entry
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl ?? this.defaultTtl,
    });
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
    this.inFlight.clear();
    this.hits = 0;
    this.misses = 0;
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  size(): number {
    return this.cache.size;
  }

  /**
   * Get or compute — if key exists and not expired, return cached;
   * otherwise compute, cache, and return.
   */
  async getOrCompute(key: string, computeFn: () => Promise<T>, ttl?: number): Promise<T> {
    // Check cache first
    const cached = this.get(key);
    if (cached !== null) {
      return cached;
    }

    // Check if there's already an in-flight request for this key
    const existing = this.inFlight.get(key);
    if (existing) {
      return existing;
    }

    // Start the computation and store the in-flight promise
    const promise = computeFn()
      .then((data) => {
        this.set(key, data, ttl);
        this.inFlight.delete(key);
        return data;
      })
      .catch((error) => {
        this.inFlight.delete(key);
        throw error;
      });

    this.inFlight.set(key, promise);
    return promise;
  }

  /**
   * Cleanup expired entries.
   * @returns number of entries removed
   */
  cleanup(): number {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Get cache statistics.
   */
  getStats(): { size: number; hitRate: number; missRate: number } {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      hitRate: total > 0 ? this.hits / total : 0,
      missRate: total > 0 ? this.misses / total : 0,
    };
  }
}
