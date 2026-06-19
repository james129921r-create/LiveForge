import { NextRequest, NextResponse } from 'next/server';
import { fetchKickChannel, fetchKickCategories, fetchKickCategoryLivestreams } from '@/lib/kick-fetch';
import { normalizeChannel, normalizeLivestream, normalizeCategory, CATEGORY_CHANNEL_MAP, RELATED_CATEGORIES, resolveCategorySlug, fuzzyScore, sortChannelsByLiveStatus } from '@/lib/normalize-channel';
import { safeParseInt } from '@/lib/parse-utils';
import type { StreamChannel } from '@/types';

function validateSlug(slug: string): { valid: boolean; sanitized?: string } {
  const sanitized = slug.toLowerCase().replace(/[^a-z0-9_-]/g, '');
  if (!sanitized || sanitized.length > 64) return { valid: false };
  return { valid: true, sanitized };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const { searchParams } = new URL(request.url);
  const liveOnly = searchParams.get('liveOnly') === 'true';
  const sortBy = searchParams.get('sort') || 'viewers'; // viewers | recent
  const limit = safeParseInt(searchParams.get('limit'), 20, 1, 50);
  const offset = safeParseInt(searchParams.get('offset'), 0, 0);

  const validation = validateSlug(slug);
  if (!validation.valid || !validation.sanitized) {
    return NextResponse.json(
      { error: 'Invalid category slug' },
      { status: 400 }
    );
  }

  const catSlug = validation.sanitized;

  // Resolve category alias (e.g., 'cs2' → 'counter-strike-2')
  const resolvedSlug = resolveCategorySlug(catSlug);

  try {
    let channels: StreamChannel[] = [];
    let usedCategoryEndpoint = false;
    let apiTotalCount: number | null = null;

    // Also fetch category info from the top categories list
    let categoryInfo: Record<string, unknown> | null = null;
    const catRes = await fetchKickCategories();
    if (catRes.ok && Array.isArray(catRes.data)) {
      const found = (catRes.data as Array<Record<string, unknown>>).find(
        (c) => (c.slug as string) === resolvedSlug || (c.slug as string) === catSlug
      );
      if (found) {
        categoryInfo = normalizeCategory(found);
      }
    }

    // ── Primary: Use /api/v1/categories/{slug}/livestreams endpoint ──────
    // Fetch up to 3 pages to get 50+ channels
    const MAX_PAGES = 3;
    const PAGE_LIMIT = 25; // Per page limit for category livestreams
    const seenUsernames = new Set<string>();

    for (let page = 1; page <= MAX_PAGES; page++) {
      try {
        const livestreamsRes = await fetchKickCategoryLivestreams(resolvedSlug, page, PAGE_LIMIT);
        if (livestreamsRes.ok && livestreamsRes.data) {
          const livestreamsData = livestreamsRes.data as { data?: Array<Record<string, unknown>>; total?: number } | Array<Record<string, unknown>>;
          const streamItems = Array.isArray(livestreamsData) ? livestreamsData : ((livestreamsData as Record<string, unknown>).data as Array<Record<string, unknown>>) || [];

          // Extract total count if available from the API
          if (!Array.isArray(livestreamsData) && (livestreamsData as Record<string, unknown>).total !== undefined) {
            apiTotalCount = (livestreamsData as Record<string, unknown>).total as number;
          }

          if (Array.isArray(streamItems) && streamItems.length > 0) {
            for (const item of streamItems) {
              const normalized = normalizeLivestream(item);
              if (normalized && !seenUsernames.has(normalized.username)) {
                channels.push(normalized);
                seenUsernames.add(normalized.username);
              }
            }

            if (channels.length > 0) {
              usedCategoryEndpoint = true;
            }

            // Stop paginating if this page returned fewer items than requested
            if (streamItems.length < PAGE_LIMIT) break;
          } else {
            // Empty page — no more results
            break;
          }
        } else {
          console.warn(`[category-channels] Category livestreams endpoint failed for "${resolvedSlug}" page ${page}:`, livestreamsRes.status, '— falling back to channel-by-channel');
          break;
        }
      } catch (error) {
        console.warn(`[category-channels] Category livestreams endpoint error for "${resolvedSlug}" page ${page}:`, (error as Error).message, '— falling back to channel-by-channel');
        break;
      }
    }

    // ── Fallback: Channel-by-channel approach ────────────────────────────
    if (!usedCategoryEndpoint || channels.length < Math.min(limit, 3)) {
      // Find known channels for this category, with fuzzy fallback
      let knownChannels = CATEGORY_CHANNEL_MAP[resolvedSlug] || CATEGORY_CHANNEL_MAP[catSlug] || [];

      // If no exact match, try fuzzy matching against known category slugs
      if (knownChannels.length === 0) {
        const bestMatch = Object.keys(CATEGORY_CHANNEL_MAP)
          .map(k => ({ key: k, score: fuzzyScore(catSlug, k) }))
          .filter(({ score }) => score >= 0.5)
          .sort((a, b) => b.score - a.score)[0];

        if (bestMatch) {
          knownChannels = CATEGORY_CHANNEL_MAP[bestMatch.key] || [];
        }
      }

      const seenUsernamesFallback = new Set<string>(channels.map(ch => ch.username));
      const fallbackChannels: StreamChannel[] = [...channels];

      // Increased fallback channel lookups from 15 to 25 for better category coverage
      const fetchSlugs = knownChannels.filter(s => !seenUsernamesFallback.has(s)).slice(0, 25);
      // Fetch in batches of 3 to limit concurrent curl processes
      for (let i = 0; i < fetchSlugs.length; i += 3) {
        const batch = fetchSlugs.slice(i, i + 3);
        const results = await Promise.all(
          batch.map(async (chSlug) => {
            try {
              const res = await fetchKickChannel(chSlug);
              if (res.ok && res.data) {
                return normalizeChannel(res.data as Record<string, unknown>);
              }
            } catch {
              // Skip
            }
            return null;
          })
        );

        for (const ch of results) {
          if (ch && !seenUsernamesFallback.has(ch.username)) {
            fallbackChannels.push(ch);
            seenUsernamesFallback.add(ch.username);
          }
        }
      }

      channels = fallbackChannels;
    }

    // Apply live-only filter
    let filtered = channels;

    // ── Category relevance filter ─────────────────────────────────────────
    // Channels fetched from the fallback list may not actually belong to this
    // category. We score channels by how well they match the requested category
    // using both the API-returned category data AND the CATEGORY_CHANNEL_MAP.
    //
    // Key rules:
    //   - Only the exact requested category gets relevance 3
    //   - Related categories (e.g., just-chatting for IRL) only get relevance 2
    //   - Channels in our category map get relevance 1 (offline) or 1.5 (live elsewhere)
    //   - Unknown channels with no match get relevance 0 (filtered out)
    const directCategorySlugs = new Set<string>([resolvedSlug, catSlug]);
    const relatedCategorySlugs = new Set<string>();
    const relatedSlugs = RELATED_CATEGORIES[resolvedSlug] || RELATED_CATEGORIES[catSlug] || [];
    for (const rs of relatedSlugs) relatedCategorySlugs.add(rs);

    // Build a reverse lookup: which categories is this channel known to be in?
    const channelKnownCategories = new Map<string, Set<string>>();
    for (const [catKey, slugs] of Object.entries(CATEGORY_CHANNEL_MAP)) {
      for (const s of slugs) {
        if (!channelKnownCategories.has(s)) channelKnownCategories.set(s, new Set());
        channelKnownCategories.get(s)!.add(catKey);
      }
    }

    // Score each channel for category relevance
    const scored = filtered.map(ch => {
      let relevance = 0;
      // Use categorySlug for precise matching (slug-to-slug), fall back to category name
      const chCatSlug = (ch.categorySlug || '').toLowerCase();
      const chCat = chCatSlug || (ch.category || '').toLowerCase().replace(/\s+/g, '-');
      const chUsername = (ch.username || '').toLowerCase();
      const knownCats = channelKnownCategories.get(chUsername);

      // Exact category match from live stream data (highest priority)
      if (directCategorySlugs.has(chCat) || (chCatSlug && directCategorySlugs.has(chCatSlug))) {
        relevance = 3;
      }
      // Related category match (e.g., streaming just-chatting while viewing IRL)
      else if (relatedCategorySlugs.has(chCat) || (chCatSlug && relatedCategorySlugs.has(chCatSlug))) {
        relevance = 2;
      }
      // Partial string match (fuzzy)
      else if (chCat && Array.from(directCategorySlugs).some(alias =>
        alias.includes(chCat) || chCat.includes(alias)
      )) {
        relevance = 2;
      }
      // Channel is live but in a different category — check if known for this category
      else if (ch.isLive && chCat && knownCats?.has(resolvedSlug)) {
        // Listed in our map for this category but currently streaming elsewhere
        // Give moderate score so they appear below matching streams but above irrelevant
        relevance = 1.5;
      }
      // Channel is live in some other category (not known for this one)
      else if (ch.isLive && chCat) {
        relevance = 0.5;
      }
      // Offline channel — check if it's known for this category
      else if (!ch.isLive && knownCats?.has(resolvedSlug)) {
        // Known for this category but currently offline
        relevance = 1;
      }
      // Offline with mismatched category and not in our map for this category
      else if (!ch.isLive && chCat && !directCategorySlugs.has(chCat) && !relatedCategorySlugs.has(chCat) && !(knownCats?.has(resolvedSlug))) {
        relevance = 0;
      }
      // Offline with no category data — only keep if in our category map
      else if (!ch.isLive && !chCat) {
        relevance = knownCats?.has(resolvedSlug) ? 1 : 0;
      }
      // Fallback
      else {
        relevance = 0.5;
      }

      return { channel: ch, relevance };
    });

    // Sort by: relevance DESC, then live first, then viewers DESC
    scored.sort((a, b) => {
      if (a.relevance !== b.relevance) return b.relevance - a.relevance;
      const aLive = a.channel.isLive ? 1 : 0;
      const bLive = b.channel.isLive ? 1 : 0;
      if (aLive !== bLive) return bLive - aLive;
      return (b.channel.viewerCount || 0) - (a.channel.viewerCount || 0);
    });

    // Only include channels with relevance >= 1 (exclude clearly irrelevant ones)
    filtered = scored
      .filter(s => s.relevance >= 1)
      .map(s => s.channel);

    // If we filtered too aggressively and have <3 results, relax the threshold
    if (filtered.length < 3) {
      filtered = scored
        .filter(s => s.relevance >= 0.5)
        .map(s => s.channel);
    }

    if (liveOnly) {
      filtered = filtered.filter(ch => ch.isLive);
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

    // Compute hasMore: whether there are more results beyond this page
    const totalAvailable = filtered.length;
    const paginatedChannels = filtered.slice(offset, offset + limit);
    const hasMore = (offset + paginatedChannels.length) < totalAvailable;

    return NextResponse.json({
      category: categoryInfo,
      channels: paginatedChannels,
      total: apiTotalCount ?? totalAvailable,
      limit,
      offset,
      hasMore,
    });
  } catch (error) {
    console.error('Category channels API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch category channels' },
      { status: 500 }
    );
  }
}
