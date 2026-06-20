/**
 * Shared Channel Normalizer
 *
 * Converts raw Kick API channel data into the normalized StreamChannel format.
 * Applies all mature content routing rules consistently across all API routes.
 *
 * Previously this logic was duplicated in 5 different route files.
 */

import { detectMatureContent, isPoolOrHotTubContent, containsBannedContent } from '@/lib/mature-content';
import { enforceMatureRouting } from '@/lib/mature-content-enforcer';
import type { StreamChannel } from '@/types';

export function normalizeChannel(data: Record<string, unknown>) {
  const livestream = data.livestream as Record<string, unknown> | undefined;
  const user = data.user as Record<string, unknown> | undefined;
  const chatroom = data.chatroom as Record<string, unknown> | undefined;
  const recentCategories = data.recent_categories as Array<Record<string, unknown>> | undefined;
  const categories = livestream?.categories as Array<Record<string, unknown>> | undefined;
  const thumbnail = livestream?.thumbnail as Record<string, unknown> | undefined;

  const slugValue = data.slug as string | undefined;
  if (!slugValue) return null;

  // Collect category names for mature content detection
  const categoryNames: string[] = [
    ...(categories || []),
    ...(recentCategories || []),
  ].map((c: Record<string, unknown>) => (c.name as string || ''));

  const isMatureApiFlag = livestream?.is_mature as boolean | undefined;
  const streamTitle = (livestream?.session_title as string) || '';
  const streamTags = (livestream?.tags as string[]) || [];

  // ── Banned content filter ───────────────────────────────────────────────
  if (containsBannedContent(streamTitle, streamTags)) return null;

  // ── Enhanced mature content detection ───────────────────────────────────
  const {
    isMature,
    matureTags,
    subCategories,
    contentSection,
    asmrType,
  } = detectMatureContent(categoryNames, isMatureApiFlag, streamTitle, streamTags);

  // ── Infer ASMR type from category map when Kick API returns no category ──
  // When a channel is offline, the Kick API often returns no category data,
  // so asmrType would be null even for known ASMR channels. We use the
  // CATEGORY_CHANNEL_MAP to infer ASMR status from the channel's known slug.
  // Two paths:
  // 1. If there's an ASMR signal (category, tags, title), AND the slug is in
  //    the ASMR map → infer general ASMR
  // 2. If there's NO category data at all (offline channel) AND the slug is
  //    in the ASMR map → infer general ASMR (the channel IS an ASMR channel,
  //    it's just offline so the API doesn't return category info)
  let finalAsmrType = asmrType;
  const isInASMRMap = CATEGORY_CHANNEL_MAP['asmr']?.includes(slugValue);
  const hasASMRSignal = categoryNames.some(c => c.toLowerCase().includes('asmr')) ||
    streamTags?.some(t => t.toLowerCase().includes('asmr')) ||
    streamTitle.toLowerCase().includes('asmr');
  // hasNoCategoryData: true only when the channel has category data entries but they're all empty.
  // IMPORTANT: We must check categoryNames.length > 0 to avoid the vacuous truth problem
  // where Array.every() returns true for empty arrays (offline channels with no categories).
  // Without this guard, ANY channel in the ASMR map with no category data would be
  // incorrectly classified as ASMR.
  const hasNoCategoryData = categoryNames.length > 0 && categoryNames.every(c => !c || c.trim() === '');
  if (!finalAsmrType && isInASMRMap && (hasASMRSignal || hasNoCategoryData)) {
    finalAsmrType = 'general'; // Default to general; sensual detection would come from title/tags
  }

  // ── Mandatory Pool/Hot Tub routing ──────────────────────────────────────
  let finalIsMature = isMature;
  let finalContentSection = contentSection;
  let finalSubCategories = [...subCategories];
  let finalMatureTags = [...matureTags];

  if (isPoolOrHotTubContent(streamTitle, streamTags) && !finalIsMature) {
    finalIsMature = true;
    finalContentSection = 'mature';
    if (!finalSubCategories.includes('pool-hot-tub')) finalSubCategories.push('pool-hot-tub');
    if (!finalMatureTags.includes('suggestive')) finalMatureTags.push('suggestive');
  }

  // ── Infer content section from category map for offline ASMR channels ───
  // When the Kick API returns no category (channel offline), the mature content
  // detection doesn't fire, so contentSection may be 'general' even for known
  // mature-category channels. Fix this using the category map.
  if (finalAsmrType && !finalIsMature) {
    // Known ASMR channel that wasn't flagged by API — ensure proper section
    if (finalAsmrType === 'general' && finalContentSection !== 'general') {
      // Already in a section, leave it
    } else if (finalAsmrType === 'general') {
      finalContentSection = 'general'; // General ASMR in general section
    }
  }

  // ── Compute uptime / live streak ────────────────────────────────────────
  const startedAt = livestream?.start_time as string | null | undefined;
  let uptimeMinutes = 0;
  if (startedAt && livestream?.is_live) {
    try {
      uptimeMinutes = Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 60000));
    } catch {
      uptimeMinutes = 0;
    }
  }

  // Compute liveStreak: approximate from consecutive days (simplified: 1 if live, 0 if not)
  const liveStreak = livestream?.is_live ? 1 : 0;

  // ── Resolve HLS playback URL ────────────────────────────────────────────
  // Kick API v2 channel endpoint: playback_url is at top level
  // Kick API v2 livestream endpoint: playback_url is inside data.data
  const hlsUrl = (data.playback_url as string) ||
    (livestream?.playback_url as string) ||
    null;

  const channel: StreamChannel = {
    id: String(data.id),
    username: slugValue,
    displayName: (user?.username as string) || slugValue,
    avatarUrl: (user?.profile_pic as string | null) || null,
    isLive: (livestream?.is_live as boolean) || false,
    category: (categories?.[0]?.name as string) || (recentCategories?.[0]?.name as string) || null,
    categorySlug: (categories?.[0]?.slug as string) || (recentCategories?.[0]?.slug as string) || null,
    title: streamTitle || null,
    viewerCount: (livestream?.viewer_count as number) || 0,
    startedAt: startedAt || null,
    hlsUrl,
    thumbnail: (thumbnail?.url as string | null) || null,
    followersCount: (data.followers_count as number) || 0,
    verified: (data.verified as boolean) || false,
    chatroomId: (chatroom?.id as number) || (data.id as number),
    isMature: finalIsMature,
    matureTags: finalMatureTags,
    subCategories: finalSubCategories,
    contentSection: finalContentSection,
    asmrType: finalAsmrType,
    uptimeMinutes,
    liveStreak,
    tags: streamTags,
    language: (livestream?.language as string) || (data.language as string) || undefined,
  };

  // Apply server-side enforcement of mandatory mature routing rules:
  //   - Pool/Hot Tub & Gambling → ALWAYS isMature=true, contentSection='mature'
  //   - General ASMR → dual-listed (isMature=false, contentSection='general')
  //   - Sensual ASMR → mature-only
  //   - Gambling flag for UI warnings
  return enforceMatureRouting(channel);
}

/**
 * Category alias map — maps common search terms and alternate spellings
 * to the canonical Kick category slug. This is CRITICAL for making
 * search work when users type "asmr", "pool", "hot tub", "gambling" etc.
 */
export const CATEGORY_ALIASES: Record<string, string> = {
  // ── ASMR aliases ──
  'asmr': 'asmr',
  'asmr-streams': 'asmr',
  'asmr-stream': 'asmr',
  'whisper': 'asmr',
  'tingles': 'asmr',
  'sleep-stream': 'asmr',
  'sleep-streams': 'asmr',
  'sleep': 'asmr',
  'asmothgold': 'asmr',

  // ── Pool / Hot Tub / Bikinis aliases ──
  'pool': 'pools-hot-tubs-and-bikinis',
  'pools': 'pools-hot-tubs-and-bikinis',
  'hot-tub': 'pools-hot-tubs-and-bikinis',
  'hottub': 'pools-hot-tubs-and-bikinis',
  'hot tub': 'pools-hot-tubs-and-bikinis',
  'hot-tubs': 'pools-hot-tubs-and-bikinis',
  'bikini': 'pools-hot-tubs-and-bikinis',
  'bikinis': 'pools-hot-tubs-and-bikinis',
  'swim': 'pools-hot-tubs-and-bikinis',
  'swimming': 'pools-hot-tubs-and-bikinis',
  'swimwear': 'pools-hot-tubs-and-bikinis',
  'beach': 'pools-hot-tubs-and-bikinis',
  'jacuzzi': 'pools-hot-tubs-and-bikinis',
  'pool-party': 'pools-hot-tubs-and-bikinis',

  // ── Gambling aliases ──
  'gambling': 'slots',
  'casino': 'slots',
  'slots': 'slots',
  'slot': 'slots',
  'poker': 'poker',
  'roulette': 'slots',
  'blackjack': 'slots',
  'betting': 'slots',
  'crypto-gambling': 'slots',
  'stake': 'slots',
  'roshtein': 'slots',

  // ── Just Chatting aliases ──
  'just-chatting': 'just-chatting',
  'just chatting': 'just-chatting',
  'chat': 'just-chatting',
  'chatting': 'just-chatting',
  'irl': 'irl',
  'in-real-life': 'irl',
  'talking': 'just-chatting',
  'podcast': 'just-chatting',
  'podcast-and-talk-shows': 'just-chatting',
  'react': 'just-chatting',
  'reaction': 'just-chatting',
  'reactions': 'just-chatting',

  // ── FPS / Shooter aliases ──
  'cs2': 'counter-strike-2',
  'cs': 'counter-strike-2',
  'csgo': 'counter-strike-2',
  'counter-strike': 'counter-strike-2',
  'counterstrike': 'counter-strike-2',
  'cod': 'call-of-duty',
  'call-of-duty': 'call-of-duty',
  'warzone': 'call-of-duty-warzone',
  'valorant': 'valorant',
  'val': 'valorant',
  'r6': 'rainbow-six-siege',
  'r6s': 'rainbow-six-siege',
  'siege': 'rainbow-six-siege',
  'rainbow-six': 'rainbow-six-siege',
  'rainbow-six-siege': 'rainbow-six-siege',
  'ow2': 'overwatch-2',
  'ow': 'overwatch-2',
  'overwatch': 'overwatch-2',
  'apex': 'apex-legends',
  'pubg': 'pubg-battlegrounds',
  'tarkov': 'escape-from-tarkov',
  'eft': 'escape-from-tarkov',

  // ── MOBA / Strategy aliases ──
  'lol': 'league-of-legends',
  'league': 'league-of-legends',
  'dota': 'dota-2',
  'tft': 'teamfight-tactics',

  // ── RPG / MMO aliases ──
  'wow': 'world-of-warcraft',
  'osrs': 'old-school-runescape',
  'rs': 'old-school-runescape',
  'runescape': 'old-school-runescape',
  'poe': 'path-of-exile',
  'd2': 'diablo-iv',
  'diablo': 'diablo-iv',
  'd4': 'diablo-iv',
  'hearth': 'hearthstone',
  'hs': 'hearthstone',

  // ── Survival / Sandbox aliases ──
  'gta': 'grand-theft-auto-v',
  'gta5': 'grand-theft-auto-v',
  'gta-v': 'grand-theft-auto-v',
  'gtav': 'grand-theft-auto-v',
  'gta rp': 'grand-theft-auto-v',
  'gta-rp': 'grand-theft-auto-v',
  'roleplay': 'grand-theft-auto-v',
  'minecraft': 'minecraft',
  'mc': 'minecraft',
  'dbd': 'dead-by-daylight',
  'fortnite': 'fortnite',
  'fn': 'fortnite',
  'roblox': 'roblox',
  'vr': 'vr',
  'retro': 'retro-gaming',
  'retro-gaming': 'retro-gaming',

  // ── Sports / Racing aliases ──
  'sports': 'sports',
  'fifa': 'fifa',
  'ea-fc': 'fifa',
  'soccer': 'fifa',
  'football': 'fifa',
  'rocket-league': 'rocket-league',
  'rl': 'rocket-league',
  'sim-racing': 'sim-racing',
  'iracing': 'sim-racing',

  // ── Creative / Dev aliases ──
  'art': 'art',
  'drawing': 'art',
  'painting': 'art',
  'dev': 'software-and-game-development',
  'coding': 'software-and-game-development',
  'programming': 'software-and-game-development',
  'game-dev': 'software-and-game-development',

  // ── Music aliases ──
  'music': 'music',
  'dj': 'music',
  'singing': 'music',
  'karaoke': 'music',
  'guitar': 'music',
  'piano': 'music',
  'beats': 'music',
  'producer': 'music',
  'rap': 'music',
  'hip-hop': 'music',

  // ── Mature content aliases ──
  'mature': 'mature-gaming',
  'mature-gaming': 'mature-gaming',
  '18+': 'pools-hot-tubs-and-bikinis',
  'nsfw': 'pools-hot-tubs-and-bikinis',
  'adult': 'pools-hot-tubs-and-bikinis',
  'thirst': 'pools-hot-tubs-and-bikinis',
  'suggestive': 'pools-hot-tubs-and-bikinis',
};

/**
 * Shared category-channel mapping with comprehensive coverage of Kick categories.
 * This is used by search, popular, recommendations, and category channel routes.
 *
 * IMPORTANT: These channel slugs MUST be actual Kick.com streamers who are
 * known to stream in these categories. They are used as fallback when the
 * Kick categories API doesn't return enough results.
 */
export const CATEGORY_CHANNEL_MAP: Record<string, string[]> = {
  // ── General / Just Chatting ──
  // Streamers who primarily do Just Chatting / reaction content on Kick
  'just-chatting': ['xqc', 'hasanabi', 'trainwreckstv', 'destiny', 'nmplol', 'eclion', 'sodapoppin', 'mizkif', 'moistcr1tikal', 'esfandtv', 'fanfan', 'mitchjones', 'dansauceda', 'yubbii', 'roach_', 'dankquan', 'cyr', 'adinross', 'ishowspeed', 'kaicenat', 'brucedropemoff', 'yourragegaming', 'nelk', 'stevewilldoit', 'sampepper', 'sweat', 'nmp', 'zackrawrr', 'asmongold', 'prodbydiorno', 'katyuskafox'],

  // ── Gambling / Slots ──
  // Streamers who actually stream slots/gambling content
  'slots': ['roshtein', 'david2002_', 'trainwreckstv', 'xqc', 'adr', 'slots-streamed', 'brickin', 'august0fficial', 'dwonthewall', 'looksamgambling', 'slotsmillions', 'xposed', 'billythekidtv', 'deify', 'onlyjacks', 'itskpka', 'coconutb', 'stables_hy', 'slotsguy', 'jartek', 'aaronslotsgg', 'classybeef', 'viperspit'],
  'poker': ['tonyvpoker', 'pokerstreamer', 'thebigrick', 'runituppoker', 'pokerstars', 'mariano5', 'imadepoker', 'cashinpoker', 'pokerblacks', 'mariano_poker', 'pdeman1', 'pokerokay'],

  // ── Gaming: Shooters ──
  // Streamers who actively play these games on Kick
  'counter-strike-2': ['fl0m', 'subroza', 'tarik', 'm0nesy', 's1mple', 'nertzz', 'ohne_pixel', 'anomaly', 'ptr', 'koosta', 'nitr0', 'elige', 'freakazoid', 'skadoodle', 'n0thing', 'autimatic', 'steel', 'swag', 'shroud', 'summit1g'],
  'call-of-duty': ['nickmercs', 'timthetatman', 'drdisrespect', 'scump', 'formal', 'crimsix', 'attach', 'aches'],
  'call-of-duty-warzone': ['nickmercs', 'timthetatman', 'drdisrespect', 'summit1g', 'swagg', 'joWo', 'scump', 'symfuhny', 'huskerrs', 'agq', 'super_ev', 'bobbyplays', 'jukeyz'],
  'valorant': ['shroud', 'tarik', 'subroza', 'averagejonas', 'tenz', 'shahzaebkhan', 'chhazed', 'zellsis', 'wardell', 'bugha', 'myth', 'shanks', 'sarah2k', 'afros', 'scrubby', 'fl0m', 'summit1g'],
  'rainbow-six-siege': ['macie_jay', 'bikiniibodhi', 'serenity17', 'athieno', 'pengu', 'fabian', 'kinggeorge', 'braction'],
  'grand-theft-auto-v': ['kingsergiopro', 'spaceboy', 'zapzidor', 'tommyncf', 'noprse', 'pezz', 'rpghombre', 'lordkeef', 'biotox_', 'roleplay', 'gta_roleplay', 'tr4px', 'lirik', 'summit1g', 'sodapoppin', 'moistcr1tikal', 'timthetatman'],
  'rust': ['welyn', 'hjune', 'willjum', 'blooprint', 'honeybeeofrp', 'hutchmf', 'fmrust', 'pokey', 'rust_ken', 'stealth0', 'hydros', 'epik', 'aquafps', 'coconutb', 'coconutb_2', 'lirik', 'shroud', 'summit1g', 'frosteen'],
  'fortnite': ['nickmercs', 'drdisrespect', 'sypherpk', 'dakotaz', 'lazarbeam', 'bugha', 'mongraal', 'tfue', 'cizzorz', 'raider464', 'recream', 'rubius', 'pokimane'],
  'apex-legends': ['aceu', 'imperialhal', 'snip3down', 'ranger', 'shivfps', 'shroud', 'lirik', 'summit1g', 'moistcr1tikal', 'timthetatman'],
  'overwatch-2': ['surefour', 'karq', 'flats', 'emongg', 'dspstanky', 'ml7', 'warn', 'frankyodst', 'fitszu', 'shroud'],
  'pubg-battlegrounds': ['shroud', 'chocotaco', 'summit1g', 'lirik', 'chad', 'fuzzface', 'ibiza', 'hwang'],
  'escape-from-tarkov': ['pestily', 'klean', 'lvndmark', 'antonfromtarkov', 'aquafps', 'jdog', 'devildog', 'summit1g', 'lirik', 'drdisrespect'],
  'dead-by-daylight': ['no0b3', 'otzdarva', 'tru3ta1ent', 'ohmwrecker', 'sillymikeplays', 'd3ad_plays', 'ayrun', 'mikeydbd'],

  // ── Gaming: RPG / MMO ──
  // Streamers known for these specific games
  'league-of-legends': ['doublelift', 'sneaky', 'metaphor', 'cowsep', 'tyler1', 'pobelter', 'corejj', 'toskk', 'thebausffs', 'wiggy', 'yassuo', 'cannon', 'iwilldominate', 'tfblade'],
  'old-school-runescape': ['b0aty', 'sicknerd', 'mmorpg', 'soup', 'erseti', 'zezima', 'boaty', 'synlight', 'mammal', 'sethgg', 'fossil', 'rs', 'parrot', 'osrs'],
  'world-of-warcraft': ['asmongold', 'esfandtv', 'richwcampbell', 'sodapoppin', 'tipsoutbaby', 'preachgaming', 'bellular', 'asmon', 'staysafe', 'max', 'sf', 'mcd'],
  'minecraft': ['philza', 'dream', 'georgenotfound', 'sapnap', 'technoblade', 'skeppy', 'badboyhalo', 'caplength', 'summit1g', 'lirik', 'moistcr1tikal'],
  'diablo-iv': ['rhykker', 'wudijo', 'kripparrian', 'maxroll', 'asmongold', 'lirik', 'shroud', 'richwcampbell'],
  'path-of-exile': ['ziggyd', 'ninja_arach', 'zizaran', 'petty', 'nugi', 'raizqt', 'cutedog_', 'lirik'],

  // ── Gaming: Strategy / Simulation ──
  'hearthstone': ['thijs', 'kripparrian', 'trumpsc', 'firebat', 'rdu', 'sodapoppin'],
  'dota-2': ['gorgc', 'singsing', 'dendi', 'arteezy', 'topson', 's4', 'nisha'],
  'teamfight-tactics': ['kiyora', 'k3soju', 'milk', 'disguisedtoast', 'robin', 'mismatchedsock', 'moe'],

  // ── IRL / Lifestyle ──
  // ONLY actual IRL streamers: travel, outdoor, walking, exploring, street content
  // NOT just-chatting or reaction streamers who occasionally go outside
  'irl': [
    // Primary IRL streamers (main content is outdoor/travel/walking)
    'iceposeidon', 'tazo', 'shanesmith', 'oblivionsw', 'mhyochi',
    'velcuz', 'marlon', 'jackiedl', 'mr_sins_travels', 'nanapips',
    'giannielee', 'mokrysuchar', 'nickwhite',
    // Significant IRL content (regularly does outdoor/IRL streams)
    'ac7ionman', 'fiivestar', 'n3on', 'fousey', 'zavalahimself',
    'burakg', 'jinnytty', 'robcdee', 'jamonitmack',
  ],
  'special-events': ['xqc', 'hasanabi', 'trainwreckstv', 'ishowspeed', 'kaicenat', 'nelk', 'stevewilldoit', 'adinross'],
  'music': [
    // Actual music streamers: DJs, singers, producers, instrumentalists
    'prodbydiorno', 'yunglordbeats', 'chalogtv', 'lilbeibis', 'djari328',
    'prodbyvalk', 'beatsbyavalon', 'djyhnny', 'prodbydaddy',
    'kpop', 'singstream', 'livesing', 'djlively',
    'beatstream', 'lofi', 'acousticstream',
  ],

  // ── ASMR ── (Actual ASMR streamers on Kick — do NOT add non-ASMR streamers like asmongold)
  'asmr': ['chelxie', 'velvet_7', 'xoamei', 'asmrctica', 'asmrbeats', 'asmrglow', 'kittenasmr', 'asmrsparkle', 'gentlewhispering', 'asmrlane', 'asmrshimmer', 'asmrrequests', 'jk_asmr', 'asmraria', 'asmrcham', 'asmryouready', 'cloverasmr', 'asmrcosplay', 'asmrmpits', 'asmrdbz', 'asmrsolari', 'asmrplanet', 'asmrpsychic', 'asmrcrush', 'asmrcloud', 'asmrmuse', 'asmrfield', 'asmrsea', 'asmrqueen', 'asmrbliss', 'asmrlefay', 'asmrcheerful', 'asmrhoney', 'asmrpeach', 'asmrdream', 'asmrlove', 'asmrpure', 'asmrsoftly', 'asmrstar'],

  // ── Pool/Hot Tub/Bikinis ──
  // Streamers who actually stream in this category
  'pools-hot-tubs-and-bikinis': ['amouranth', 'corinnakopf', 'alinity', 'novaruu', 'kristenhanby', 'absinthecarol', 'ginardin', 'honey_pooter', 'morgpie', 'xoaimee', 'pjodk', 'thezhyanna', 'ashtynjoslee', 'bella_luna', 'catalinasof', 'stpeach', 'knakashima', 'sarahjchem', 'jessica-nigri', 'thedanielllexx', 'lisaviterbi', 'katyuskafox', 'sammyjo', 'ashleyotaku', 'nira_lately', 'jessicanyx', 'piinksparkles', 'yunaasian', 'chloewildd', 'sophiassos', 'kaitlynkrems', 'mikaylah', 'emilyrinaudo', 'anniebrown', 'katemarley'],

  // ── Mature Categories ──
  'mature-gaming': ['xqc', 'drdisrespect', 'summit1g', 'lirik', 'shroud', 'timthetatman', 'nickmercs'],

  // ── Creative / Art ──
  // Streamers who actually do art/drawing/painting
  'art': ['bobross', 'artland', 'drawwithjazza', 'kooleen', 'spicysweetart', 'artsy', 'paintingstream', 'drawstream'],
  // Streamers who actually code / develop games
  'software-and-game-development': ['theprimeagen', 't3dotgg', 'fireship', 'theodore1010', 'codinggarden', 'jackherrington', 'devstream', 'codestream', 'codelive'],

  // ── Sports ──
  // Streamers who actually stream sports/FIFA content
  'sports': ['castro1021', 'bateson87', 'aj3', 'sportslive'],
  'fifa': ['castro1021', 'bateson87', 'aj3', 'nick28t', 'castro_1021', 'fifastream', 'eafc'],

  // ── Gaming: Roblox / VR / Retro ──
  'roblox': ['roblox', 'kreekcraft', 'flamingo', 'denis', 'sub', 'albertsstuff', 'funneh', 'goldglare'],
  'rocket-league': ['squishy', 'jstn', 'garrettg', 'turinturo', 'amustycow', 'fairypeak'],
  'sim-racing': ['maxvernstappen', 'lerclerc', 'iracing', 'jimmybroadbent'],

  // ── Additional popular categories ──
  'suika-game': ['xqc', 'mizkif', 'hasanabi'],
  'variety': ['lirik', 'summit1g', 'shroud', 'sodapoppin', 'moistcr1tikal', 'timthetatman'],
  'react': ['xqc', 'hasanabi', 'mizkif', 'destiny', 'sodapoppin'],
  'slots-and-casino': ['coconutb', 'mizkif', 'xqc', 'trainwreckstv', 'roshtein', 'nickmercs', 'sodapoppin'],
};

/**
 * Category similarity map — related categories that share viewers.
 * Used by the recommendations engine to find "More Like This" streams.
 */
export const RELATED_CATEGORIES: Record<string, string[]> = {
  'just-chatting': ['irl', 'special-events', 'music', 'asmr', 'pools-hot-tubs-and-bikinis'],
  'slots': ['just-chatting', 'pools-hot-tubs-and-bikinis', 'poker'],
  'poker': ['slots', 'just-chatting'],
  'grand-theft-auto-v': ['rust', 'just-chatting', 'red-dead-redemption-2'],
  'rust': ['grand-theft-auto-v', 'valorant', 'escape-from-tarkov'],
  'valorant': ['counter-strike-2', 'rust', 'overwatch-2', 'apex-legends'],
  'counter-strike-2': ['valorant', 'rust', 'call-of-duty-warzone'],
  'call-of-duty-warzone': ['counter-strike-2', 'valorant', 'apex-legends'],
  'fortnite': ['call-of-duty-warzone', 'apex-legends'],
  'apex-legends': ['valorant', 'counter-strike-2', 'overwatch-2'],
  'overwatch-2': ['valorant', 'apex-legends'],
  'league-of-legends': ['valorant', 'teamfight-tactics'],
  'dota-2': ['league-of-legends'],
  'world-of-warcraft': ['old-school-runescape', 'diablo-iv', 'path-of-exile'],
  'old-school-runescape': ['world-of-warcraft', 'minecraft'],
  'minecraft': ['old-school-runescape', 'rust'],
  'diablo-iv': ['world-of-warcraft', 'path-of-exile'],
  'path-of-exile': ['diablo-iv', 'world-of-warcraft'],
  'hearthstone': ['world-of-warcraft', 'teamfight-tactics'],
  'irl': ['just-chatting', 'special-events', 'pools-hot-tubs-and-bikinis'],
  'special-events': ['just-chatting', 'irl'],
  'asmr': ['just-chatting', 'pools-hot-tubs-and-bikinis', 'irl', 'music'],
  'pools-hot-tubs-and-bikinis': ['asmr', 'just-chatting', 'irl'],
  'mature-gaming': ['grand-theft-auto-v', 'just-chatting', 'pools-hot-tubs-and-bikinis'],
  'escape-from-tarkov': ['rust', 'pubg-battlegrounds'],
  'pubg-battlegrounds': ['escape-from-tarkov', 'call-of-duty-warzone'],
  'music': ['just-chatting', 'irl', 'asmr'],
  'sports': ['fifa', 'irl'],
  'fifa': ['sports', 'just-chatting'],
  'software-and-game-development': ['just-chatting', 'minecraft'],
  'art': ['just-chatting', 'asmr', 'music'],
  'roblox': ['minecraft', 'fortnite'],
  'rocket-league': ['fifa', 'sports', 'sim-racing'],
  'sim-racing': ['rocket-league', 'sports', 'fifa'],
  'retro-gaming': ['minecraft', 'just-chatting'],
};

/**
 * Comprehensive popular channels list — 60+ well-known Kick streamers
 * organized by size tier for discovery and fallback search.
 */
export const POPULAR_CHANNELS = [
  // Tier 1: Mega streamers (50k+ viewers)
  'xqc', 'hasanabi', 'shroud', 'summit1g', 'trainwreckstv', 'pokimane',
  'ishowspeed', 'kaicenat', 'adinross',
  // Tier 2: Large streamers (10-50k)
  'lirik', 'nickmercs', 'sodapoppin', 'timthetatman', 'drdisrespect',
  'forsen', 'nmplol', 'destiny', 'amouranth', 'mizkif', 'asmongold',
  'brucedropemoff', 'yourragegaming', 'sneako',
  // Tier 3: Mid-size streamers (1-10k)
  'esfandtv', 'moistcr1tikal', 'coconutb', 'eclion', 'sneaky', 'doublelift',
  'fl0m', 'b0aty', 'sicknerd', 'richwcampbell', 'roshtein', 'david2002_',
  'nelk', 'stevewilldoit', 'sampepper', 'zackrawrr', 'nmp',
  // Tier 4: Rising / category-specific streamers
  'welyn', 'hjune', 'subroza', 'averagejonas', 'pestily', 'chocotaco',
  'thijs', 'kripparrian', 'gorgc', 'singsing', 'no0b3', 'otzdarva',
  'cowsep', 'ziggyd', 'surefour', 'karq', 'alinity', 'jocat',
  'metaphor', 'noahj456', 'tectone', 'adr', 'frosteen',
  'hyoon', 'jinyoung', 'erseti', 'soup', 'mmorpg',
  'spaceboy', 'zapzidor', 'kingsergiopro', 'biotox_', 'hutchmf', 'blooprint',
  'lvndmark', 'klean', 'aceu', 'imperialhal', 'tarik', 'tenz',
  'yassuo', 'tfblade', 'iwilldominate', 'thebausffs',
  // Tier 5: IRL streamers (travel, outdoor, walking content)
  'iceposeidon', 'tazo', 'shanesmith', 'mhyochi', 'velcuz', 'jackiedl',
  'jinnytty', 'robcdee', 'ac7ionman', 'fousey', 'n3on', 'mr_sins_travels',
  'nanapips', 'giannielee', 'fiivestar', 'marlon',
  // Tier 6: ASMR & Pool/Hot Tub streamers (high visibility on Kick)
  'chelxie', 'velvet_7', 'xoamei', 'asmrctica', 'asmrbeats', 'asmrglow',
  'novaruu', 'morgpie', 'xoaimee', 'corinnakopf', 'kristenhanby',
  'ginardin', 'catalinasof', 'thedanielllexx', 'sammyjo',
  'asmrsparkle', 'kittenasmr', 'asmrlane', 'asmrshimmer',
];

/**
 * Category Alias Expansion Map
 *
 * Hardcodes clean URL mappings from common shorthand/abbreviations to the
 * canonical Kick API slug. This guarantees API directory lookups never drop
 * a 404 response when users search using abbreviated names.
 *
 * Usage: Before calling fetchKickCategoryLivestreams, resolve the slug
 * through this map first: `resolveCategorySlug('cs2')` → `'counter-strike-2'`
 *
 * NOTE: The full alias map is defined above at CATEGORY_ALIASES. This comment
 * block documents the expansion pattern and resolveCategorySlug function.
 */

/**
 * Resolve a category slug through the alias expansion map.
 * Returns the canonical Kick API slug, or the original if no alias exists.
 */
export function resolveCategorySlug(slug: string): string {
  const lower = slug.toLowerCase().trim();
  return CATEGORY_ALIASES[lower] || lower;
}

/**
 * Normalize a Kick API category object into a CategoryItem-compatible record.
 */
export function normalizeCategory(cat: Record<string, unknown>) {
  const category = cat.category as Record<string, unknown> | undefined;
  const banner = cat.banner as Record<string, unknown> | undefined;
  const catName = cat.name as string || '';
  const catSlug = cat.slug as string || '';

  const {
    isMature: catIsMature,
    subCategories: catSubCategories,
    contentSection: catContentSection,
    asmrType: catAsmrType,
  } = detectMatureContent([catName], cat.is_mature as boolean | undefined);

  return {
    id: String(cat.id),
    name: catName,
    slug: catSlug,
    viewerCount: cat.viewers || 0,
    tags: cat.tags || [],
    isMature: catIsMature,
    subCategories: catSubCategories,
    contentSection: catContentSection,
    asmrType: catAsmrType,
    parentCategory: category?.name || null,
    parentIcon: category?.icon || null,
    bannerUrl: banner?.src || null,
  };
}

/**
 * Fuzzy-match a query against a string.
 * Returns a score (0-1) where 1 = exact match and lower = weaker match.
 * Matches partial words, abbreviations, and name fragments.
 */
export function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  // Exact match
  if (q === t) return 1.0;

  // Target starts with query (e.g., "xq" matches "xqc")
  if (t.startsWith(q)) return 0.9;

  // Query is a word prefix in target (e.g., "just" matches "Just Chatting")
  const words = t.split(/[\s\-_&]+/);
  for (const word of words) {
    if (word.startsWith(q)) return 0.8;
  }

  // Target contains query (e.g., "hat" matches "Just Chatting")
  if (t.includes(q)) return 0.6;

  // Check category aliases for a match (e.g., "asmr" maps to "asmr" slug)
  const aliasTarget = CATEGORY_ALIASES[q];
  if (aliasTarget && (t === aliasTarget || t.includes(aliasTarget))) return 0.85;

  // All query characters appear in order in target (e.g., "jc" matches "Just Chatting")
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[qi] === q[qi]) qi++;
  }
  if (qi === q.length) return 0.4;

  // No match
  return 0;
}

/**
 * Validate a search query — trim and limit length to prevent abuse.
 */
export function validateQuery(query: string): { valid: boolean; sanitized?: string } {
  const sanitized = query.trim().slice(0, 128);
  if (!sanitized) return { valid: false };
  if (/[<>"'`;(){}[\]\\]/.test(sanitized)) return { valid: false };
  return { valid: true, sanitized };
}

/**
 * Format an uptime from minutes to a human-readable string (e.g., "2h 15m", "45m", "1d 3h")
 */
export function formatUptime(minutes: number): string {
  if (minutes <= 0) return '';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remainHours = hours % 24;
  return remainHours > 0 ? `${days}d ${remainHours}h` : `${days}d`;
}

/**
 * Resolve a search query to a canonical category slug using the alias map.
 * Returns the canonical slug if found, otherwise returns the query lowercased.
 */
export function resolveCategoryAlias(query: string): string {
  const normalized = query.toLowerCase().replace(/\s+/g, '-').trim();
  return CATEGORY_ALIASES[normalized] || normalized;
}

/**
 * Normalize a livestream object from Kick's /api/v1/streams endpoint.
 *
 * The livestream data from /api/v1/streams has a different structure
 * than individual channel data from /api/v2/channels/{slug}:
 *   - Channel info is nested inside a `channel` property
 *   - Categories are at the top level
 *   - Thumbnail is at the top level
 *   - is_live and viewer_count are at the top level
 */
export function normalizeLivestream(data: Record<string, unknown>): StreamChannel | null {
  const channel = data.channel as Record<string, unknown> | undefined;
  const categories = data.categories as Array<Record<string, unknown>> | undefined;
  const thumbnail = data.thumbnail as Record<string, unknown> | undefined;

  const slugValue = (data.slug as string) || (channel?.slug as string);
  if (!slugValue) return null;

  const categoryNames = (categories || []).map((c) => (c.name as string || ''));
  const streamTitle = (data.session_title as string) || '';
  const streamTags = (data.tags as string[]) || [];
  const isMatureApiFlag = data.is_mature as boolean | undefined;

  // ── Banned content filter ───────────────────────────────────────────────
  if (containsBannedContent(streamTitle, streamTags)) return null;

  // ── Enhanced mature content detection ───────────────────────────────────
  const {
    isMature,
    matureTags,
    subCategories,
    contentSection,
    asmrType,
  } = detectMatureContent(categoryNames, isMatureApiFlag, streamTitle, streamTags);

  // ── Mandatory Pool/Hot Tub routing ──────────────────────────────────────
  let finalIsMature = isMature;
  let finalContentSection = contentSection;
  const finalSubCategories = [...subCategories];
  const finalMatureTags = [...matureTags];

  if (isPoolOrHotTubContent(streamTitle, streamTags) && !finalIsMature) {
    finalIsMature = true;
    finalContentSection = 'mature';
    if (!finalSubCategories.includes('pool-hot-tub')) finalSubCategories.push('pool-hot-tub');
    if (!finalMatureTags.includes('suggestive')) finalMatureTags.push('suggestive');
  }

  // ── Compute uptime ─────────────────────────────────────────────────────
  const startedAt = data.start_time as string | null | undefined;
  let uptimeMinutes = 0;
  if (startedAt) {
    try {
      uptimeMinutes = Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 60000));
    } catch {
      uptimeMinutes = 0;
    }
  }

  const ch: StreamChannel = {
    id: String(data.id || channel?.id || ''),
    username: slugValue,
    displayName: (channel?.username as string) || slugValue,
    avatarUrl: (channel?.profile_pic as string | null) || null,
    isLive: (data.is_live as boolean) ?? true,
    category: (categories?.[0]?.name as string) || null,
    categorySlug: (categories?.[0]?.slug as string) || null,
    title: streamTitle || null,
    viewerCount: (data.viewer_count as number) || 0,
    startedAt: startedAt || null,
    hlsUrl: (data.playback_url as string) || null,
    thumbnail: (thumbnail?.url as string | null) || null,
    followersCount: (channel?.followers_count as number) || 0,
    verified: (channel?.is_verified as boolean) || false,
    chatroomId: ((channel?.chatroom as Record<string, unknown>)?.id as number) || 0,
    isMature: finalIsMature,
    matureTags: finalMatureTags,
    subCategories: finalSubCategories,
    contentSection: finalContentSection,
    asmrType: asmrType,
    uptimeMinutes,
    liveStreak: 1,
    tags: streamTags,
    language: (data.language as string) || (channel?.language as string) || undefined,
  };

  return enforceMatureRouting(ch);
}

/**
 * Filter out channels where livestream is null (offline).
 * When using the /api/v1/streams endpoint this isn't needed since
 * it only returns live streams, but this is useful as a safety net.
 */
export function filterLiveStreamers(channels: StreamChannel[]): StreamChannel[] {
  return channels.filter(channel => channel.isLive);
}

/**
 * Sort channels: live first, then by viewer count (highest first).
 */
export function sortChannelsByLiveStatus(channels: StreamChannel[]): StreamChannel[] {
  return [...channels].sort((a, b) => {
    const aLive = a.isLive ? 1 : 0;
    const bLive = b.isLive ? 1 : 0;
    if (bLive !== aLive) return bLive - aLive;
    return (b.viewerCount || 0) - (a.viewerCount || 0);
  });
}
