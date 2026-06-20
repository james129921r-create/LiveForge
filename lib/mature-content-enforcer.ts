/**
 * Mature Content Routing Enforcer
 *
 * Runtime enforcement layer that sits on top of the base detection logic
 * in `mature-content.ts`.  It guarantees three hard rules:
 *
 *   Rule 1 — Mandatory 18+ for Pool/Hot Tub & Gambling categories
 *     These categories MUST always be routed as mature, regardless of any
 *     client-side "general" visibility overrides.
 *
 *   Rule 2 — Dual-Listing for ASMR Content
 *     General ASMR streams must appear in BOTH the general feed AND the
 *     mature section.  The enforcer sets the correct flags for this.
 *
 *   Rule 3 — Content Flagging for Gambling Streams
 *     Gambling streams get custom UI warnings and their thumbnail previews
 *     are blocked/obscured automatically when mature content is hidden.
 */

import {
  detectMatureContent,
  detectMatureFromCategory,
  isPoolOrHotTubContent,
  KICK_GAMBLING_CATEGORIES,
  type ContentSection,
  type MatureSubCategory,
} from '@/lib/mature-content';
import type { StreamChannel } from '@/types';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Check if a channel's category matches any known gambling category.
 */
function isGamblingCategory(category: string | null | undefined): boolean {
  if (!category) return false;
  const lower = category.toLowerCase();
  return KICK_GAMBLING_CATEGORIES.some(
    gc => lower.includes(gc.toLowerCase()) || gc.toLowerCase().includes(lower)
  );
}

/**
 * Check if a channel's subCategories contain gambling.
 */
function hasGamblingSubCategory(subCategories?: string[]): boolean {
  return subCategories?.includes('gambling') ?? false;
}

/**
 * Check if a channel's matureTags contain gambling.
 */
function hasGamblingMatureTag(matureTags?: string[]): boolean {
  return matureTags?.includes('gambling') ?? false;
}

/**
 * Determine if a channel is a gambling stream based on all available signals.
 */
export function isGamblingStream(channel: StreamChannel): boolean {
  // Check explicit flags first
  if (hasGamblingSubCategory(channel.subCategories)) return true;
  if (hasGamblingMatureTag(channel.matureTags)) return true;
  // Check category name
  if (isGamblingCategory(channel.category)) return true;
  // Re-detect from category if flags are missing
  const detection = detectMatureFromCategory(channel.category);
  return detection.subCategories.includes('gambling') || detection.matureTags.includes('gambling');
}

/**
 * Determine if a channel is a Pool/Hot Tub stream based on all available signals.
 */
export function isPoolHotTubStream(channel: StreamChannel): boolean {
  // Check subCategories
  if (channel.subCategories?.includes('pool-hot-tub')) return true;
  // Check from title/tags
  if (isPoolOrHotTubContent(channel.title || '', channel.tags)) return true;
  // Check from category name
  const lower = (channel.category || '').toLowerCase();
  if (lower.includes('pool') || lower.includes('hot tub') || lower.includes('bikini') || lower.includes('swim')) return true;
  // Re-detect from category
  const detection = detectMatureFromCategory(channel.category);
  return detection.subCategories.includes('pool-hot-tub');
}

// ─── Override Attempt Logger ────────────────────────────────────────────────

interface OverrideLogEntry {
  timestamp: number;
  channelUsername: string;
  channelId: string;
  attemptedSection: ContentSection;
  attemptedIsMature: boolean;
  enforcedSection: ContentSection;
  enforcedIsMature: boolean;
  reason: string;
}

const MAX_LOG_ENTRIES = 200;
const overrideLog: OverrideLogEntry[] = [];

/**
 * Log an override attempt when client-side code tries to set mandatory
 * mature content to general.
 */
function logOverrideAttempt(
  channel: StreamChannel,
  attemptedSection: ContentSection,
  attemptedIsMature: boolean,
  enforcedSection: ContentSection,
  enforcedIsMature: boolean,
  reason: string,
): void {
  const entry: OverrideLogEntry = {
    timestamp: Date.now(),
    channelUsername: channel.username,
    channelId: channel.id,
    attemptedSection,
    attemptedIsMature,
    enforcedSection,
    enforcedIsMature,
    reason,
  };

  overrideLog.push(entry);
  // Keep log bounded
  if (overrideLog.length > MAX_LOG_ENTRIES) {
    overrideLog.shift();
  }

  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      `[mature-enforcer] Override blocked: ${channel.username} tried ` +
      `(isMature=${attemptedIsMature}, section=${attemptedSection}) → ` +
      `enforced (isMature=${enforcedIsMature}, section=${enforcedSection}) ` +
      `reason: ${reason}`
    );
  }
}

/**
 * Retrieve the override log (for debugging/admin purposes).
 */
export function getOverrideLog(): readonly OverrideLogEntry[] {
  return overrideLog;
}

// ─── Main Enforcer Function ────────────────────────────────────────────────

/**
 * Enforce mature content routing rules on a StreamChannel.
 *
 * This function takes a channel (possibly with client-provided overrides)
 * and returns a new channel object with the mandatory rules enforced:
 *
 *   1. Pool/Hot Tub & Gambling → ALWAYS `isMature: true`, `contentSection: 'mature'`
 *   2. General ASMR → `isMature: false`, `contentSection: 'general'`, `asmrType: 'general'`
 *      (dual-listed in both general and mature sections by the frontend)
 *   3. Sensual ASMR → `isMature: true`, `contentSection: 'mature'`
 *   4. Gambling streams get `isGambling: true` flag for UI warnings
 */
export function enforceMatureRouting(channel: StreamChannel): StreamChannel {
  // Clone to avoid mutating the original
  const enforced: StreamChannel = { ...channel };

  // Run fresh detection if the channel lacks detection data
  if (!channel.subCategories?.length && !channel.matureTags?.length && channel.category) {
    const detection = detectMatureContent(
      [channel.category],
      channel.isMature,
      channel.title,
      channel.tags,
    );
    enforced.subCategories = detection.subCategories;
    enforced.matureTags = detection.matureTags;
    enforced.contentSection = detection.contentSection;
    enforced.asmrType = detection.asmrType;
    if (detection.isMature && !enforced.isMature) {
      enforced.isMature = detection.isMature;
    }
  }

  // ─── Rule 1: Mandatory 18+ for Pool/Hot Tub & Gambling ──────────────
  const isPoolHotTub = isPoolHotTubStream(channel);
  const isGambling = isGamblingStream(channel);

  if (isPoolHotTub || isGambling) {
    const attemptedIsMature = enforced.isMature ?? false;
    const attemptedSection = enforced.contentSection || 'general';

    // Force mature routing
    enforced.isMature = true;
    enforced.contentSection = 'mature';

    // Ensure proper subCategories
    if (isPoolHotTub && !enforced.subCategories?.includes('pool-hot-tub')) {
      enforced.subCategories = [...(enforced.subCategories || []), 'pool-hot-tub'];
    }
    if (isGambling && !enforced.subCategories?.includes('gambling')) {
      enforced.subCategories = [...(enforced.subCategories || []), 'gambling'];
    }

    // Ensure proper matureTags
    if (!enforced.matureTags?.includes('gambling') && isGambling) {
      enforced.matureTags = [...(enforced.matureTags || []), 'gambling'];
    }
    if (!enforced.matureTags?.includes('suggestive') && isPoolHotTub) {
      enforced.matureTags = [...(enforced.matureTags || []), 'suggestive'];
    }

    // Log if an override was attempted (client tried to set to general)
    if (!attemptedIsMature || attemptedSection !== 'mature') {
      const reason = isPoolHotTub
        ? 'Pool/Hot Tub content is mandatory 18+ per Kick Community Guidelines'
        : 'Gambling content is mandatory 18+ per Kick Community Guidelines';
      logOverrideAttempt(
        channel,
        attemptedSection,
        attemptedIsMature,
        'mature',
        true,
        reason,
      );
    }
  }

  // ─── Rule 2: Dual-Listing for ASMR Content ─────────────────────────
  if (channel.category) {
    const detection = detectMatureFromCategory(channel.category);
    const asmrType = channel.asmrType ?? detection.asmrType;

    if (asmrType === 'general') {
      // General ASMR: set flags for dual-listing
      // isMature = false, contentSection = 'general' so it appears in general feed
      // The frontend additionally shows it in mature section for discoverability
      const attemptedIsMature = enforced.isMature ?? false;
      const attemptedSection = enforced.contentSection || 'general';

      enforced.asmrType = 'general';
      enforced.isMature = false;
      enforced.contentSection = 'general';

      // Clear any mature tags for general ASMR
      enforced.matureTags = [];
      // Keep subCategories but remove nsfw
      enforced.subCategories = (enforced.subCategories || []).filter(
        s => s !== 'nsfw' && s !== 'sensual-asmr'
      );

      // Log if someone tried to force general ASMR into mature-only
      if (attemptedIsMature && attemptedSection === 'mature') {
        logOverrideAttempt(
          channel,
          attemptedSection,
          attemptedIsMature,
          'general',
          false,
          'General ASMR must be dual-listed (general + mature), not mature-only',
        );
      }
    } else if (asmrType === 'sensual') {
      // Sensual ASMR: mature-only
      enforced.asmrType = 'sensual';
      enforced.isMature = true;
      enforced.contentSection = 'mature';

      if (!enforced.subCategories?.includes('sensual-asmr')) {
        enforced.subCategories = [...(enforced.subCategories || []), 'sensual-asmr'];
      }
    }
  }

  // ─── Rule 3: Content Flagging for Gambling Streams ──────────────────
  // Add a custom `isGambling` flag for UI components to detect gambling
  // streams and render appropriate warnings/blurred overlays.
  if (isGambling) {
    enforced.isGambling = true;
  }

  return enforced;
}

/**
 * Enforce mature routing on an array of channels.
 * Convenience wrapper around `enforceMatureRouting`.
 */
export function enforceMatureRoutingBatch(channels: StreamChannel[]): StreamChannel[] {
  return channels.map(enforceMatureRouting);
}

/**
 * Check if a channel's thumbnail should be obscured when mature content
 * is hidden.  Returns true for gambling streams when showMatureContent is false.
 */
export function shouldObscureThumbnail(
  channel: StreamChannel,
  showMatureContent: boolean,
): boolean {
  if (showMatureContent) return false;
  return isGamblingStream(channel);
}

/**
 * Check if a channel card should show a gambling warning badge.
 */
export function shouldShowGamblingWarning(channel: StreamChannel): boolean {
  return isGamblingStream(channel);
}
