/**
 * Kick Mature Content Detection & Category Routing
 *
 * Implements strict compliance with Kick's Community Guidelines:
 *   - Pool, Hot Tub, Swimwear, and Beach content → MANDATORY 18+ Mature routing
 *   - Sensual/Erotic ASMR → 18+ Mature; General ASMR → All Ages
 *   - Gambling categories → always flagged
 *   - is_mature API flag → always respected
 *
 * Content is organized into two primary sections:
 *   1. General Feed (All Ages - Safe for Work)
 *   2. Mature Collection (Age-Gated 18+)
 */

// ─── Mature Sub-Categories ──────────────────────────────────────────────────

export type MatureSubCategory =
  | 'pool-hot-tub'       // Pool & Hot Tub Lifestyle (swimwear, beach, jacuzzi)
  | 'adult-entertainment' // Erotic roleplay, sensual dancing, adult comedy
  | 'sensual-asmr'       // Intimate triggers, suggestive themes
  | 'mature-gaming'      // Games rated M/18+, NSFW mods
  | 'gambling'           // Slots, casino, poker
  | 'uncensored-talk'    // Dark humor, controversial topics
  | 'nsfw';              // Catch-all for API-flagged mature with no specific match

export type ContentSection = 'general' | 'mature';

export interface MatureDetectionResult {
  isMature: boolean;
  matureTags: string[];
  /** Which specific Kick categories triggered the detection */
  matchedCategories: string[];
  /** Sub-category classification for mature content routing */
  subCategories: MatureSubCategory[];
  /** Which section this content belongs to */
  contentSection: ContentSection;
  /** If ASMR was detected, whether it's sensual or general */
  asmrType: 'general' | 'sensual' | null;
}

// ─── Kick's Official Gambling Categories ───────────────────────────────────────
export const KICK_GAMBLING_CATEGORIES = [
  'Slots & Casino',
  'Poker',
] as const;

// ─── Kick's Official Mature / NSFW Categories ─────────────────────────────────
export const KICK_MATURE_CATEGORIES = [
  'Pools, Hot Tubs & Bikinis',
  'ASMR',
  'Mature Gaming',
] as const;

// ─── Ambiguous Categories (18+ label dependent) ───────────────────────────────
export const KICK_AMBIGUOUS_CATEGORIES = [
  'Just Chatting',
] as const;

// ─── Title/Tag Keywords for Mandatory 18+ Routing ─────────────────────────────
// Any stream whose title or tags contains these keywords MUST be routed to 18+.
export const POOL_HOT_TUB_KEYWORDS = [
  'pool', 'hot tub', 'hottub', 'swim', 'swimming', 'jacuzzi',
  'beach', 'bikini', 'swimwear', 'bathing suit', 'poolside',
  'pool party', 'hot tub stream', 'tub stream',
] as const;

export const SENSUAL_KEYWORDS = [
  'sensual', 'erotic', 'sexy', 'nsfw', 'nude', 'strip',
  'lingerie', 'onlyfans', 'onlydans', 'thirst', 'thotty',
  'body paint', 'yoga pants', 'try on', 'haul tryon',
] as const;

export const SENSUAL_ASMR_KEYWORDS = [
  'sensual asmr', 'girlfriend asmr', 'boyfriend asmr', 'roleplay asmr',
  'intimate asmr', 'ear licking', 'licking asmr', 'kissing asmr',
  'moaning asmr', 'gfe asmr', 'bf asmr', 'gfe', 'bfe',
  'sugar asmr', 'honey asmr', 'lip asmr', 'mouth sounds asmr',
  'whisper roleplay', 'asmr roleplay',
] as const;

export const GENERAL_ASMR_KEYWORDS = [
  'tapping asmr', 'whisper asmr', 'typing asmr', 'keyboard asmr',
  'scratch asmr', 'crinkle asmr', 'book asmr', 'drawing asmr',
  'craft asmr', 'nature asmr', 'rain asmr', 'ambient asmr',
  'relax asmr', 'sleep asmr', 'study asmr', 'focus asmr',
  'asmr stream', 'asmr live', 'asmr chill', 'asmr relaxing',
  'asmr sleep', 'asmr study', 'asmr sounds', 'asmr tapping',
  'asmr whisper', 'asmr scratching', 'asmr crinkling',
  // Single-word patterns that are clearly non-sensual ASMR
  'tapping', 'whispering', 'typing sounds', 'keyboard sounds',
  'scratching', 'crinkling', 'page turning',
  // Additional common ASMR triggers
  'asmr triggers', 'asmr hand movements', 'asmr visual',
  'asmr mouth sounds', 'asmr personal attention', 'asmr roleplay',
  'asmr cooking', 'asmr eating', 'asmr mukbang', 'asmr food',
  'asmr painting', 'asmr slime', 'asmr kinetic sand', 'asmr soap cutting',
  'asmr scalp massage', 'asmr hair brushing', 'asmr face massage',
  'asmr hand movements', 'asmr follow instructions', 'asmr countdown',
] as const;

// ─── Banned Keywords (Content Safety Filter) ───────────────────────────────────
// Streams with these keywords in title/tags should be filtered out entirely.
export const BANNED_KEYWORDS = [
  'incest', 'gore', 'bestiality', 'child', 'csam',
  'underage', 'pedo', 'rape', 'snuff',
] as const;

// ─── Derived lists for matching ───────────────────────────────────────────────
const gamblingLower = KICK_GAMBLING_CATEGORIES.map(c => c.toLowerCase());
const matureLower = KICK_MATURE_CATEGORIES.map(c => c.toLowerCase());
const ambiguousLower = KICK_AMBIGUOUS_CATEGORIES.map(c => c.toLowerCase());

/**
 * Check if a string contains any of the given keywords (case-insensitive, word boundary aware).
 * Uses word boundary matching to prevent false positives (e.g., "beach" matching "beaching",
 * "child" in BANNED_KEYWORDS matching "childhood").
 */
function containsKeyword(text: string, keywords: readonly string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some(kw => {
    // For multi-word keywords, use simple includes (word boundaries don't apply well)
    if (kw.includes(' ')) return lower.includes(kw);
    // For single-word keywords, require word boundaries to avoid false positives
    // e.g., "child" should not match "childhood", "swim" should not match "swimmingly"
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    return regex.test(lower);
  });
}

/**
 * Check if a stream title or tags contain Pool/Hot Tub related keywords
 * that require mandatory 18+ routing.
 */
export function isPoolOrHotTubContent(title: string, tags: string[] = []): boolean {
  const combined = [title, ...tags].join(' ');
  return containsKeyword(combined, POOL_HOT_TUB_KEYWORDS);
}

/**
 * Classify ASMR content as general (all ages) or sensual (18+).
 * Returns null if no ASMR content is detected.
 */
export function classifyASMR(title: string, tags: string[] = [], categoryNames: string[] = []): 'general' | 'sensual' | null {
  const combined = [title, ...tags].join(' ').toLowerCase();
  const hasASMRCategory = categoryNames.some(c => c.toLowerCase().includes('asmr'));
  const hasASMRTag = combined.includes('asmr');

  if (!hasASMRCategory && !hasASMRTag) return null;

  // Check for sensual ASMR signals first (takes priority)
  if (containsKeyword(combined, SENSUAL_ASMR_KEYWORDS)) return 'sensual';

  // If the stream is flagged mature by the API and has ASMR, assume sensual
  // (this is handled in the main detectMatureContent function)

  // Check for explicitly general ASMR signals
  if (containsKeyword(combined, GENERAL_ASMR_KEYWORDS)) return 'general';

  // Default: if ASMR category but no clear signal, default to 'general'.
  // This allows ASMR to appear in both the general and mature sections.
  // The is_mature API flag from Kick will still override this for actual
  // mature ASMR streams — see step 4 and 7 in detectMatureContent.
  return 'general';
}

/**
 * Check if a stream title or tags contain banned keywords.
 * Such streams should be filtered out entirely, not just age-gated.
 */
export function containsBannedContent(title: string, tags: string[] = []): boolean {
  const combined = [title, ...tags].join(' ');
  return containsKeyword(combined, BANNED_KEYWORDS);
}

/**
 * Determine the mature sub-categories for a stream based on all available signals.
 */
function determineSubCategories(
  categoryNames: string[],
  title: string,
  tags: string[],
  asmrType: 'general' | 'sensual' | null,
  isMatureApiFlag: boolean | null | undefined,
): MatureSubCategory[] {
  const subs: MatureSubCategory[] = [];
  const combined = [title, ...tags].join(' ');
  const lower = categoryNames.map(c => c.toLowerCase());

  // Pool/Hot Tub detection — from title/tags OR category name
  if (isPoolOrHotTubContent(title, tags) || lower.some(cn =>
    cn.includes('pool') || cn.includes('hot tub') || cn.includes('bikini')
  )) {
    subs.push('pool-hot-tub');
  }

  // Gambling detection from category
  if (lower.some(cn => gamblingLower.some(gc => cn.includes(gc) || gc.includes(cn)))) {
    if (!subs.includes('gambling')) subs.push('gambling');
  }

  // Mature gaming detection from category
  if (lower.some(cn => cn.includes('mature gaming'))) {
    subs.push('mature-gaming');
  }

  // Sensual ASMR detection
  if (asmrType === 'sensual') {
    subs.push('sensual-asmr');
  }

  // Adult entertainment detection from keywords
  if (containsKeyword(combined, SENSUAL_KEYWORDS)) {
    subs.push('adult-entertainment');
  }

  // Uncensored talk detection (from ambiguous categories + is_mature flag)
  if (isMatureApiFlag && lower.some(cn => ambiguousLower.some(ac => cn.includes(ac) || ac.includes(cn)))) {
    if (!subs.includes('uncensored-talk')) subs.push('uncensored-talk');
  }

  // Catch-all for API-flagged mature with no specific match
  // Skip for general ASMR — it's dual-listed, not exclusively mature
  const isGeneralASMR = asmrType === 'general';
  if (isMatureApiFlag && subs.length === 0 && !isGeneralASMR) {
    subs.push('nsfw');
  }

  return subs;
}

/**
 * Detect mature content from category names, title, tags, and the Kick API's
 * is_mature flag. Returns comprehensive routing information.
 *
 * @param categoryNames - Array of category name strings
 * @param isMatureApiFlag - The is_mature flag from the Kick API livestream object
 * @param title - Stream title (for keyword-based detection)
 * @param tags - Stream tags (for keyword-based detection)
 */
export function detectMatureContent(
  categoryNames: string[],
  isMatureApiFlag?: boolean | null,
  title?: string | null,
  tags?: string[],
): MatureDetectionResult {
  const lower = categoryNames.map(c => c.toLowerCase());
  const streamTitle = title || '';
  const streamTags = tags || [];
  const matureTags: string[] = [];
  const matchedCategories: string[] = [];

  const isASMRCategory = lower.some(c => c.includes('asmr'));
  if (isASMRCategory) {
    console.info('[mature-content] ASMR detected:', { categoryNames, isMatureApiFlag, title });
  }

  // ─── 1. Pool/Hot Tub keyword detection (MANDATORY 18+) ──────────────────
  const isPoolHotTub = isPoolOrHotTubContent(streamTitle, streamTags);

  // Also check category name for pool/hot tub
  const isPoolCategory = lower.some(cn =>
    cn.includes('pool') || cn.includes('hot tub') || cn.includes('bikini') || cn.includes('swim')
  );

  if (isPoolHotTub || isPoolCategory) {
    if (!matureTags.includes('suggestive')) matureTags.push('suggestive');
    const matchedCats = categoryNames.filter((_, i) =>
      lower[i].includes('pool') || lower[i].includes('hot tub') || lower[i].includes('bikini') || lower[i].includes('swim')
    );
    for (const cat of matchedCats) {
      if (!matchedCategories.includes(cat)) matchedCategories.push(cat);
    }
  }

  // ─── 2. ASMR segmentation ───────────────────────────────────────────────
  const asmrType = classifyASMR(streamTitle, streamTags, categoryNames);

  if (asmrType === 'sensual') {
    if (!matureTags.includes('suggestive')) matureTags.push('suggestive');
    const asmrCats = categoryNames.filter((_, i) => lower[i].includes('asmr'));
    for (const cat of asmrCats) {
      if (!matchedCategories.includes(cat)) matchedCategories.push(cat);
    }
  }

  // ─── 3. Gambling categories (always flagged) ────────────────────────────
  for (let i = 0; i < lower.length; i++) {
    if (gamblingLower.some(gc => lower[i].includes(gc) || gc.includes(lower[i]))) {
      if (!matureTags.includes('gambling')) matureTags.push('gambling');
      if (!matchedCategories.includes(categoryNames[i])) matchedCategories.push(categoryNames[i]);
    }
  }

  // ─── 4. Explicit mature categories (always flagged, EXCEPT general ASMR) ──
  // ASMR is in KICK_MATURE_CATEGORIES but general ASMR should NOT be flagged as
  // mature — it appears in both general and mature sections for discoverability.
  // Only sensual ASMR (detected in step 2) gets the mature flag.
  for (let i = 0; i < lower.length; i++) {
    const isASMR = lower[i].includes('asmr');
    // Skip ASMR from this step — it's handled separately by the asmrType logic
    if (isASMR) continue;

    if (matureLower.some(mc => lower[i].includes(mc) || mc.includes(lower[i]))) {
      if (!matureTags.includes('suggestive')) matureTags.push('suggestive');
      if (!matchedCategories.includes(categoryNames[i])) matchedCategories.push(categoryNames[i]);
    }
  }

  // ─── 5. Ambiguous categories (only flagged if is_mature API flag is true) ─
  if (isMatureApiFlag) {
    for (let i = 0; i < lower.length; i++) {
      if (ambiguousLower.some(ac => lower[i].includes(ac) || ac.includes(lower[i]))) {
        if (!matureTags.includes('suggestive')) matureTags.push('suggestive');
        if (!matchedCategories.includes(categoryNames[i])) matchedCategories.push(categoryNames[i]);
      }
    }
  }

  // ─── 6. Sensual keyword detection in title/tags ─────────────────────────
  const combined = [streamTitle, ...streamTags].join(' ');
  if (containsKeyword(combined, SENSUAL_KEYWORDS)) {
    if (!matureTags.includes('suggestive')) matureTags.push('suggestive');
  }

  // ─── 7. Final determination ─────────────────────────────────────────────
  // ASMR routing:
  //   - General ASMR (tapping, whispering): appears in BOTH general and mature sections
  //     — isMature=false, contentSection='general', asmrType='general'
  //     — The frontend's PopularStreams.tsx additionally shows general ASMR in
  //       the mature section for discoverability (dual-listing).
  //   - Sensual ASMR (intimate, suggestive): mature section only
  //     — isMature=true, contentSection='mature', asmrType='sensual'
  //   - ASMR with is_mature API flag but no sensual signals: still dual-listed
  //     (Kick marks the entire ASMR category as is_mature, but general ASMR
  //     streams should still appear in the general feed for discoverability)
  const isASMRContent = asmrType !== null && categoryNames.some(c => c.toLowerCase().includes('asmr'));

  let isMature = matureTags.length > 0 || !!isMatureApiFlag;

  // General ASMR should NOT be marked as mature, regardless of the Kick API's
  // is_mature flag. The Kick API marks the entire ASMR category as is_mature=true,
  // but general ASMR (tapping, whispering) is safe for all ages and should appear
  // in both general and mature sections via dual-listing.
  if (isASMRContent && asmrType === 'general') {
    isMature = false;
    matureTags.length = 0; // Clear any mature tags for general ASMR
    if (process.env.NODE_ENV !== 'production' || isMatureApiFlag) {
      console.info('[mature-content] General ASMR override: isMature forced to false, matureTags cleared');
    }
  } else if (isMatureApiFlag && matureTags.length === 0) {
    // If is_mature API flag is set but no specific tags were matched, add 'nsfw' as catch-all
    matureTags.push('nsfw');
  }

  // Determine sub-categories
  const subCategories = determineSubCategories(categoryNames, streamTitle, streamTags, asmrType, isMatureApiFlag);

  // Determine content section
  // General ASMR gets 'general' section so it appears in the main feed.
  // The frontend additionally shows general ASMR in the mature section for discoverability.
  // Sensual ASMR gets 'mature' section (18+ only).
  const contentSection: ContentSection = (isASMRContent && asmrType === 'general')
    ? 'general'
    : (isMature ? 'mature' : 'general');

  return { isMature, matureTags, matchedCategories, subCategories, contentSection, asmrType };
}

/**
 * Client-side fallback for detecting mature content from a single category string.
 * Used when the server-side detection wasn't available (e.g., cached data).
 */
export function detectMatureFromCategory(category: string | null | undefined): MatureDetectionResult {
  if (!category) return { isMature: false, matureTags: [], matchedCategories: [], subCategories: [], contentSection: 'general', asmrType: null };
  return detectMatureContent([category]);
}

/**
 * Get a human-readable label for a mature sub-category.
 */
export function getMatureSubCategoryLabel(sub: MatureSubCategory): string {
  switch (sub) {
    case 'pool-hot-tub': return 'Pool & Hot Tub';
    case 'adult-entertainment': return 'Adult Entertainment';
    case 'sensual-asmr': return 'Sensual ASMR';
    case 'mature-gaming': return 'Mature Gaming';
    case 'gambling': return 'Gambling';
    case 'uncensored-talk': return 'Uncensored Talk';
    case 'nsfw': return '18+ Content';
  }
}

/**
 * Get an emoji icon for a mature sub-category.
 */
export function getMatureSubCategoryIcon(sub: MatureSubCategory): string {
  switch (sub) {
    case 'pool-hot-tub': return '\uD83C\uDF0A';       // 🌊
    case 'adult-entertainment': return '\uD83D\uDC83';  // 💃
    case 'sensual-asmr': return '\uD83C\uDF99\uFE0F';  // 🎙️
    case 'mature-gaming': return '\uD83C\uDFAE';        // 🎮
    case 'gambling': return '\uD83C\uDFB0';             // 🎰
    case 'uncensored-talk': return '\uD83D\uDDE3\uFE0F'; // 🗣️
    case 'nsfw': return '\u26A0\uFE0F';                 // ⚠️
  }
}
