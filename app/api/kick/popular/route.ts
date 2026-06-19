import { NextRequest, NextResponse } from 'next/server';
import { fetchKickChannel, fetchKickStreams } from '@/lib/kick-fetch';
import { normalizeChannel, normalizeLivestream, CATEGORY_CHANNEL_MAP, POPULAR_CHANNELS, sortChannelsByLiveStatus } from '@/lib/normalize-channel';
import { ApiCache } from '@/lib/cache';
import { safeParseInt } from '@/lib/parse-utils';
import type { StreamChannel } from '@/types';

/**
 * GET /api/kick/popular
 *
 * Returns popular/trending live streams on Kick.
 *
 * Primary strategy: Use Kick's /api/v1/streams directory endpoint which
 * returns ONLY live streams ordered by viewer count. Fetches MULTIPLE pages
 * (up to 3) to fill results up to 50-75 live channels.
 *
 * Fallback: If the streams endpoint fails, fall back to the channel-by-channel
 * approach using POPULAR_CHANNELS and CATEGORY_CHANNEL_MAP.
 *
 * Features:
 *   - Shared ApiCache with 120-second TTL for larger datasets
 *   - Cursor-based pagination support via `cursor` query param
 *   - Timeout protection: max 15 seconds per request
 *   - Bounded channel fetches: cap total lookups to prevent OOM
 */

// ─── Shared cache ─────────────────────────────────────────────────────────
const CACHE_TTL_MS = 120_000; // 120 seconds — longer TTL for larger dataset
const cache = new ApiCache<StreamChannel[]>({ maxSize: 100, defaultTtl: CACHE_TTL_MS });

// Maximum time (ms) to spend fetching channels before returning what we have
const MAX_FETCH_TIME_MS = 15_000;

// Maximum number of individual channel lookups to attempt per request
// Prevents spawning too many curl processes which causes OOM crashes
const MAX_CHANNEL_LOOKUPS = 50;

// Batch size for parallel fetches — keep small to avoid spawning too many
// curl child processes simultaneously (each may use 50-100MB memory)
const BATCH_SIZE = 5;

// How many pages to fetch from the streams endpoint
const MAX_STREAM_PAGES = 3;

// Target minimum number of live channels before we stop fetching more pages
const TARGET_LIVE_CHANNELS = 50;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = safeParseInt(searchParams.get('limit'), 24, 1, 50);
  const offset = safeParseInt(searchParams.get('offset'), 0, 0);
  const cursor = searchParams.get('cursor')?.trim() || '';
  const categoryFilter = searchParams.get('category')?.trim().toLowerCase() || '';
  const liveOnly = searchParams.get('liveOnly') === 'true';
  const sortBy = searchParams.get('sort') || 'viewers';

  // If cursor is provided, use it as offset
  const effectiveOffset = cursor ? (Number.isFinite(parseInt(cursor, 10)) ? parseInt(cursor, 10) : offset) ?? offset : offset;

  // Check cache first
  const cacheKey = `popular:${categoryFilter}:${liveOnly}:${sortBy}`;
  const cached = cache.get(cacheKey);
  if (cached !== null) {
    let filtered = cached;
    if (liveOnly) {
      filtered = filtered.filter(ch => ch.isLive);
    }
    const total = filtered.length;
    const paginated = filtered.slice(effectiveOffset, effectiveOffset + limit);
    const liveChannels = filtered.filter(ch => ch.isLive);
    const totalViewers = liveChannels.reduce((sum, ch) => sum + (ch.viewerCount || 0), 0);

    const nextCursor = effectiveOffset + limit < total ? String(effectiveOffset + limit) : '';

    return NextResponse.json({
      channels: paginated,
      total,
      limit,
      offset: effectiveOffset,
      cursor: nextCursor,
      stats: {
        totalLive: liveChannels.length,
        totalViewers,
        totalChannels: filtered.length,
      },
    });
  }

  try {
    let channels: StreamChannel[] = [];
    let usedStreamsEndpoint = false;

    // ── Primary: Use /api/v1/streams directory endpoint (MULTIPLE PAGES) ──
    try {
      const seenUsernames = new Set<string>();
      const fetchStartTime = Date.now();

      for (let page = 1; page <= MAX_STREAM_PAGES; page++) {
        // Stop if we've spent too long
        if (Date.now() - fetchStartTime > MAX_FETCH_TIME_MS) {
          break;
        }

        // Stop if we already have enough live channels
        const liveCount = channels.filter(ch => ch.isLive).length;
        if (liveCount >= TARGET_LIVE_CHANNELS) {
          break;
        }

        const pageLimit = 50; // Max per page from Kick API
        const streamsRes = await fetchKickStreams(page, pageLimit);

        if (streamsRes.ok && streamsRes.data) {
          const streamsData = streamsRes.data as { data?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;
          const streamItems = Array.isArray(streamsData) ? streamsData : (streamsData.data || []);

          if (Array.isArray(streamItems) && streamItems.length > 0) {
            for (const item of streamItems) {
              const normalized = normalizeLivestream(item);
              if (normalized && !seenUsernames.has(normalized.username)) {
                channels.push(normalized);
                seenUsernames.add(normalized.username);
              }
            }
            usedStreamsEndpoint = true;

            // If this page returned fewer than the page limit, there are no more pages
            if (streamItems.length < pageLimit) {
              break;
            }
          } else {
            // Empty page — no more results
            break;
          }
        } else {
          console.warn(`[popular] Streams endpoint failed on page ${page}:`, streamsRes.status);
          // If first page fails, fall through to fallback
          if (page === 1) break;
          // If subsequent page fails, use what we have
          break;
        }
      }

      if (channels.length > 0) {
        // channels from streams endpoint available for use below
      }
    } catch (error) {
      console.warn('[popular] Streams endpoint error:', (error as Error).message, '— falling back to channel-by-channel');
    }

    // ── Fallback: Channel-by-channel approach ───────────────────────────
    if (!usedStreamsEndpoint || channels.length < Math.min(limit, 5)) {
      const fetchStartTime = Date.now();
      const seenUsernames = new Set<string>(channels.map(ch => ch.username));
      let totalLookups = 0;
      const fallbackChannels: StreamChannel[] = [...channels];

      // If a category filter is provided, fetch channels from that category
      let slugsToFetch: string[];
      if (categoryFilter && CATEGORY_CHANNEL_MAP[categoryFilter]) {
        slugsToFetch = CATEGORY_CHANNEL_MAP[categoryFilter]!;
      } else if (categoryFilter) {
        // Try to find the category in the map with fuzzy matching
        const matchedKey = Object.keys(CATEGORY_CHANNEL_MAP).find(
          k => k.includes(categoryFilter) || categoryFilter.includes(k)
        );
        slugsToFetch = matchedKey ? CATEGORY_CHANNEL_MAP[matchedKey]! : POPULAR_CHANNELS;
      } else {
        slugsToFetch = POPULAR_CHANNELS;
      }

      // Cap the number of slugs to fetch to prevent OOM from too many curl processes
      const maxSlugs = Math.min(slugsToFetch.length, MAX_CHANNEL_LOOKUPS);
      slugsToFetch = slugsToFetch.slice(0, maxSlugs);

      const TARGET_LIVE_CHANNELS_FALLBACK = limit + offset + 5;

      for (let i = 0; i < slugsToFetch.length; i += BATCH_SIZE) {
        // Time limit: stop fetching if we've spent too long
        if (Date.now() - fetchStartTime > MAX_FETCH_TIME_MS) {
          break;
        }

        // Lookup limit: stop if we've made too many API calls
        if (totalLookups >= MAX_CHANNEL_LOOKUPS) {
          break;
        }

        // Early exit: if we already have enough live channels, stop
        const liveCount = fallbackChannels.filter(ch => ch.isLive).length;
        if (liveCount >= TARGET_LIVE_CHANNELS_FALLBACK && !liveOnly) {
          break;
        }
        if (fallbackChannels.length >= limit + offset + 10) break;

        const batch = slugsToFetch.slice(i, i + BATCH_SIZE);
        totalLookups += batch.length;

        const results = await Promise.all(
          batch.map(async (chSlug) => {
            if (seenUsernames.has(chSlug)) return null;
            try {
              const res = await fetchKickChannel(chSlug);
              if (res.ok && res.data) {
                return normalizeChannel(res.data as Record<string, unknown>);
              }
            } catch {
              // Skip failed lookups
            }
            return null;
          })
        );

        for (const ch of results) {
          if (ch && !seenUsernames.has(ch.username)) {
            fallbackChannels.push(ch);
            seenUsernames.add(ch.username);
          }
        }
      }

      channels = fallbackChannels;
    }

    // Apply live-only filter
    let filtered = channels;
    if (liveOnly) {
      filtered = filtered.filter(ch => ch.isLive);
    }

    // Apply category filter if specified
    if (categoryFilter) {
      filtered = filtered.filter(ch => {
        if (!ch.category) return false;
        const catLower = ch.category.toLowerCase();
        return catLower.includes(categoryFilter) || categoryFilter.includes(catLower);
      });
    }

    // Sort using the shared utility
    switch (sortBy) {
      case 'recent':
        filtered.sort((a, b) => {
          const aTime = a.startedAt;
          const bTime = b.startedAt;
          if (!aTime && !bTime) return 0;
          if (!aTime) return 1;
          if (!bTime) return -1;
          return new Date(bTime).getTime() - new Date(aTime).getTime();
        });
        break;
      case 'viewers':
      default:
        filtered = sortChannelsByLiveStatus(filtered);
        break;
    }

    // Update cache
    cache.set(cacheKey, filtered);

    const total = filtered.length;
    const paginated = filtered.slice(effectiveOffset, effectiveOffset + limit);

    // Compute aggregate stats
    const liveChannels = filtered.filter(ch => ch.isLive);
    const totalViewers = liveChannels.reduce((sum, ch) => sum + (ch.viewerCount || 0), 0);

    const nextCursor = effectiveOffset + limit < total ? String(effectiveOffset + limit) : '';

    return NextResponse.json({
      channels: paginated,
      total,
      limit,
      offset: effectiveOffset,
      cursor: nextCursor,
      stats: {
        totalLive: liveChannels.length,
        totalViewers,
        totalChannels: filtered.length,
      },
    });
  } catch (error) {
    console.error('Popular streams API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch popular streams' },
      { status: 500 }
    );
  }
}
