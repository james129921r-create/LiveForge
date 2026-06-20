/**
 * Validate and sanitize a Kick channel/chatroom slug.
 * Returns { valid: false } for invalid slugs, { valid: true, sanitized } for valid ones.
 */
export function validateSlug(slug: string): { valid: boolean; sanitized?: string } {
  const sanitized = slug.toLowerCase().replace(/[^a-z0-9_-]/g, '');
  if (!sanitized || sanitized.length > 64) return { valid: false };
  return { valid: true, sanitized };
}

/**
 * Safely parse a query parameter as an integer, clamped between min and max.
 * Returns `defaultValue` if the value is not a valid finite number.
 */
export function safeParseInt(
  value: string | null | undefined,
  defaultValue: number,
  min?: number,
  max?: number,
): number {
  if (value == null) return defaultValue;
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return defaultValue;
  let result = parsed;
  if (min !== undefined) result = Math.max(result, min);
  if (max !== undefined) result = Math.min(result, max);
  return result;
}
