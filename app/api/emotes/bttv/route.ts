import { NextRequest, NextResponse } from 'next/server';

const BTTV_API = 'https://api.betterttv.net/3';

/**
 * Validate a query string parameter — trim and limit length.
 */
function validateQueryParam(value: string, maxLength = 64): { valid: boolean; sanitized?: string } {
  const sanitized = value.trim().slice(0, maxLength);
  if (!sanitized) return { valid: false };
  // Block HTML/script injection patterns
  if (/[<>"'`;(){}[\]\\]/.test(sanitized)) return { valid: false };
  return { valid: true, sanitized };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q') || '';
  const channel = searchParams.get('channel') || '';

  // Channel-specific emote fetching
  if (channel.trim()) {
    const validation = validateQueryParam(channel, 64);
    if (!validation.valid || !validation.sanitized) {
      return NextResponse.json({ channelEmotes: [], sharedEmotes: [] }, { status: 200 });
    }

    try {
      const res = await fetch(`${BTTV_API}/cached/users/kick?username=${encodeURIComponent(validation.sanitized)}`, {
        headers: { 'Accept': 'application/json' },
        next: { revalidate: 300 },
      });

      if (!res.ok) {
        // Channel not found on BTTV — return empty, not an error
        return NextResponse.json({ channelEmotes: [], sharedEmotes: [] }, { status: 200 });
      }

      const data = await res.json();

      const channelEmotes = (data.channelEmotes || []).map((emote: {
        id: string;
        code: string;
        imageType: string;
        userId?: string;
      }) => ({
        id: emote.id,
        code: emote.code,
        imageType: emote.imageType,
      }));

      const sharedEmotes = (data.sharedEmotes || []).map((emote: {
        id: string;
        code: string;
        imageType: string;
        userId?: string;
      }) => ({
        id: emote.id,
        code: emote.code,
        imageType: emote.imageType,
      }));

      return NextResponse.json({ channelEmotes, sharedEmotes });
    } catch (error) {
      console.error('BTTV channel emote API error:', error);
      return NextResponse.json({ channelEmotes: [], sharedEmotes: [] }, { status: 200 });
    }
  }

  // Search shared emotes
  if (!query.trim()) {
    return NextResponse.json([]);
  }

  const queryValidation = validateQueryParam(query, 64);
  if (!queryValidation.valid || !queryValidation.sanitized) {
    return NextResponse.json([], { status: 400 });
  }

  try {
    const res = await fetch(`${BTTV_API}/emotes/shared/search?query=${encodeURIComponent(queryValidation.sanitized)}&limit=20`, {
      headers: { 'Accept': 'application/json' },
      next: { revalidate: 300 },
    });

    if (!res.ok) {
      return NextResponse.json([], { status: res.status });
    }

    const data = await res.json();

    const emotes = (Array.isArray(data) ? data : []).map((emote: {
      id: string;
      code: string;
      imageType: string;
    }) => ({
      id: emote.id,
      name: emote.code,
      provider: 'bttv',
      url: `https://cdn.betterttv.net/emote/${emote.id}/1x.${emote.imageType === 'gif' ? 'gif' : 'webp'}`,
    }));

    return NextResponse.json(emotes);
  } catch (error) {
    console.error('BTTV emote search API error:', error);
    return NextResponse.json([], { status: 500 });
  }
}
