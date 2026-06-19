import { NextRequest, NextResponse } from 'next/server';
import { fetchKickCategories } from '@/lib/kick-fetch';
import { normalizeCategory, CATEGORY_CHANNEL_MAP } from '@/lib/normalize-channel';

// Known categories that should always be available even if the API fails.
// IDs use "fallback-" prefix to avoid collisions with Kick API numeric IDs.
const FALLBACK_CATEGORIES: Array<Record<string, unknown>> = [
  { id: 'fallback-just-chatting', name: 'Just Chatting', slug: 'just-chatting', viewers: 0, tags: [], is_mature: false },
  { id: 'fallback-slots', name: 'Slots', slug: 'slots', viewers: 0, tags: [], is_mature: false },
  { id: 'fallback-grand-theft-auto-v', name: 'Grand Theft Auto V', slug: 'grand-theft-auto-v', viewers: 0, tags: [], is_mature: false },
  { id: 'fallback-rust', name: 'Rust', slug: 'rust', viewers: 0, tags: [], is_mature: false },
  { id: 'fallback-valorant', name: 'Valorant', slug: 'valorant', viewers: 0, tags: [], is_mature: false },
  { id: 'fallback-asmr', name: 'ASMR', slug: 'asmr', viewers: 0, tags: [], is_mature: false },
  { id: 'fallback-pools-hot-tubs-and-bikinis', name: 'Pools, Hot Tubs & Bikinis', slug: 'pools-hot-tubs-and-bikinis', viewers: 0, tags: [], is_mature: true },
  { id: 'fallback-mature-gaming', name: 'Mature Gaming', slug: 'mature-gaming', viewers: 0, tags: [], is_mature: true },
  { id: 'fallback-irl', name: 'IRL', slug: 'irl', viewers: 0, tags: [], is_mature: false },
  { id: 'fallback-music', name: 'Music', slug: 'music', viewers: 0, tags: [], is_mature: false },
  { id: 'fallback-counter-strike-2', name: 'Counter-Strike 2', slug: 'counter-strike-2', viewers: 0, tags: [], is_mature: false },
  { id: 'fallback-league-of-legends', name: 'League of Legends', slug: 'league-of-legends', viewers: 0, tags: [], is_mature: false },
  { id: 'fallback-world-of-warcraft', name: 'World of Warcraft', slug: 'world-of-warcraft', viewers: 0, tags: [], is_mature: false },
  { id: 'fallback-minecraft', name: 'Minecraft', slug: 'minecraft', viewers: 0, tags: [], is_mature: false },
  { id: 'fallback-apex-legends', name: 'Apex Legends', slug: 'apex-legends', viewers: 0, tags: [], is_mature: false },
  { id: 'fallback-escape-from-tarkov', name: 'Escape From Tarkov', slug: 'escape-from-tarkov', viewers: 0, tags: [], is_mature: false },
  { id: 'fallback-call-of-duty-warzone', name: 'Call of Duty: Warzone', slug: 'call-of-duty-warzone', viewers: 0, tags: [], is_mature: false },
  { id: 'fallback-fortnite', name: 'Fortnite', slug: 'fortnite', viewers: 0, tags: [], is_mature: false },
  { id: 'fallback-overwatch-2', name: 'Overwatch 2', slug: 'overwatch-2', viewers: 0, tags: [], is_mature: false },
  { id: 'fallback-dead-by-daylight', name: 'Dead by Daylight', slug: 'dead-by-daylight', viewers: 0, tags: [], is_mature: false },
  { id: 'fallback-poker', name: 'Poker', slug: 'poker', viewers: 0, tags: [], is_mature: false },
  { id: 'fallback-diablo-iv', name: 'Diablo IV', slug: 'diablo-iv', viewers: 0, tags: [], is_mature: false },
  { id: 'fallback-old-school-runescape', name: 'Old School RuneScape', slug: 'old-school-runescape', viewers: 0, tags: [], is_mature: false },
  { id: 'fallback-art', name: 'Art', slug: 'art', viewers: 0, tags: [], is_mature: false },
  { id: 'fallback-software-and-game-development', name: 'Software and Game Development', slug: 'software-and-game-development', viewers: 0, tags: [], is_mature: false },
  { id: 'fallback-sports', name: 'Sports', slug: 'sports', viewers: 0, tags: [], is_mature: false },
  { id: 'fallback-fifa', name: 'FIFA', slug: 'fifa', viewers: 0, tags: [], is_mature: false },
  { id: 'fallback-path-of-exile', name: 'Path of Exile', slug: 'path-of-exile', viewers: 0, tags: [], is_mature: false },
  { id: 'fallback-hearthstone', name: 'Hearthstone', slug: 'hearthstone', viewers: 0, tags: [], is_mature: false },
  { id: 'fallback-dota-2', name: 'Dota 2', slug: 'dota-2', viewers: 0, tags: [], is_mature: false },
  { id: 'fallback-teamfight-tactics', name: 'Teamfight Tactics', slug: 'teamfight-tactics', viewers: 0, tags: [], is_mature: false },
  { id: 'fallback-special-events', name: 'Special Events', slug: 'special-events', viewers: 0, tags: [], is_mature: false },
  { id: 'fallback-pubg-battlegrounds', name: 'PUBG: BATTLEGROUNDS', slug: 'pubg-battlegrounds', viewers: 0, tags: [], is_mature: false },
];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const includeChannelCount = searchParams.get('includeChannelCount') === 'true';
    const section = searchParams.get('section') || 'all'; // all | general | mature

    const res = await fetchKickCategories();
    let rawData: Array<Record<string, unknown>>;

    if (res.ok && Array.isArray(res.data)) {
      rawData = res.data as Array<Record<string, unknown>>;

      // Merge in fallback categories that might be missing from the API response
      // (e.g., ASMR, Pools, Poker might not appear if the API is filtered)
      const apiSlugs = new Set(rawData.map((cat) => (cat.slug as string || '').toLowerCase()));
      for (const fallback of FALLBACK_CATEGORIES) {
        const fallbackSlug = (fallback.slug as string).toLowerCase();
        if (!apiSlugs.has(fallbackSlug)) {
          rawData = [...rawData, fallback];
        }
      }
    } else {
      // API failed — use fallback categories
      console.warn('[categories] Using fallback categories due to API failure');
      rawData = FALLBACK_CATEGORIES;
    }

    let categories: Record<string, unknown>[] = rawData.map((cat) => {
      const normalized = normalizeCategory(cat) as Record<string, unknown>;

      // Fix: General ASMR should NOT be marked as isMature regardless of what the API says.
      // Kick marks the entire ASMR category as is_mature=true, but general ASMR streams
      // are safe for all ages and should appear in both general and mature sections.
      const slug = (normalized.slug as string || '').toLowerCase();
      const name = (normalized.name as string || '').toLowerCase();
      const asmrType = normalized.asmrType as string | null | undefined;
      if ((slug.includes('asmr') || name.includes('asmr')) && asmrType === 'general') {
        normalized.isMature = false;
        normalized.subCategories = (normalized.subCategories as string[])?.filter(s => s !== 'nsfw') || [];
        normalized.contentSection = 'general';
      }

      // Attach known channel count from our map
      if (includeChannelCount) {
        const knownChannels = CATEGORY_CHANNEL_MAP[slug] || [];
        normalized.channels = knownChannels.length;
      }

      return normalized;
    });

    // Filter by section if requested
    if (section === 'general') {
      // General section: non-mature content PLUS general ASMR (asmrType === 'general')
      categories = categories.filter(c => {
        const isMatureCat = c.isMature || c.contentSection === 'mature';
        if (!isMatureCat) return true;
        // Allow general ASMR in general section
        const slug = (c.slug as string || '').toLowerCase();
        const name = (c.name as string || '').toLowerCase();
        const isASMR = slug.includes('asmr') || name.includes('asmr');
        const subs = (c.subCategories as string[]) || [];
        return isASMR && !subs.includes('sensual-asmr');
      });
    } else if (section === 'mature') {
      // Mature section: all mature content PLUS the ASMR category (even general ASMR)
      categories = categories.filter(c => {
        const isMatureCat = c.isMature || c.contentSection === 'mature';
        if (isMatureCat) return true;
        // Also include ASMR category in mature section for discoverability
        const slug = (c.slug as string || '').toLowerCase();
        const name = (c.name as string || '').toLowerCase();
        return slug.includes('asmr') || name.includes('asmr');
      });
    }

    // Sort: by viewer count descending, but always show known categories first
    categories.sort((a, b) => {
      // Known categories with channel maps get a boost
      const aKnown = CATEGORY_CHANNEL_MAP[(a.slug as string)] ? 1 : 0;
      const bKnown = CATEGORY_CHANNEL_MAP[(b.slug as string)] ? 1 : 0;
      if (aKnown !== bKnown) return bKnown - aKnown;
      return (b.viewerCount as number || 0) - (a.viewerCount as number || 0);
    });

    return NextResponse.json(categories);
  } catch (error) {
    console.error('Kick categories API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch categories' },
      { status: 500 }
    );
  }
}
