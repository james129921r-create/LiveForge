import { NextRequest, NextResponse } from 'next/server';

const SEVENTV_API = 'https://7tv.io/v3';

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
      return NextResponse.json([], { status: 200 });
    }

    try {
      const res = await fetch(`${SEVENTV_API}/users/kick?username=${encodeURIComponent(validation.sanitized)}`, {
        headers: { 'Accept': 'application/json' },
        next: { revalidate: 300 },
      });

      if (!res.ok) {
        return NextResponse.json([], { status: 200 });
      }

      const data = await res.json();

      const emoteSet = data.emote_set;
      const rawEmotes = emoteSet?.emotes || [];

      const emotes = rawEmotes.map((entry: {
        id: string;
        name: string;
        flags?: number;
        data?: {
          id: string;
          name: string;
          host?: { url: string; files?: { name: string; width: number; height: number; format: string }[] };
        };
        host?: { url: string; files?: { name: string; width: number; height: number; format: string }[] };
      }) => {
        const emoteData = entry.data || entry;
        const host = 'host' in emoteData ? (emoteData as { host?: { url: string; files?: { name: string; width: number; height: number; format: string }[] } }).host : undefined;
        const webpFile = host?.files?.find((f: { format: string }) => f.format === 'WEBP');
        const file2x = host?.files?.find((f: { name: string }) => f.name?.startsWith('2x'));
        const emoteId = ('id' in emoteData ? emoteData.id : entry.id) || entry.id;
        const emoteName = ('name' in emoteData ? emoteData.name : entry.name) || entry.name;

        return {
          id: emoteId,
          name: emoteName,
          provider: '7tv',
          url: host
            ? `https:${host.url}/${webpFile?.name || file2x?.name || host.files?.[0]?.name || '2x.webp'}`
            : `https://cdn.7tv.app/emote/${emoteId}/2x.webp`,
          width: webpFile?.width || file2x?.width || host?.files?.[0]?.width,
          height: webpFile?.height || file2x?.height || host?.files?.[0]?.height,
        };
      });

      return NextResponse.json(emotes);
    } catch (error) {
      console.error('7TV channel emote API error:', error);
      return NextResponse.json([], { status: 200 });
    }
  }

  // Search emotes
  if (!query.trim()) {
    return NextResponse.json([]);
  }

  const queryValidation = validateQueryParam(query, 64);
  if (!queryValidation.valid || !queryValidation.sanitized) {
    return NextResponse.json([], { status: 400 });
  }

  try {
    const res = await fetch(`${SEVENTV_API}/emote/search?query=${encodeURIComponent(queryValidation.sanitized)}&limit=20`, {
      headers: { 'Accept': 'application/json' },
      next: { revalidate: 300 },
    });

    if (!res.ok) {
      return NextResponse.json([], { status: res.status });
    }

    const data = await res.json();

    const emotes = (data.emotes || data || []).map((emote: {
      id: string;
      name: string;
      flags?: number;
      host?: { url: string; files?: { name: string; width: number; height: number; format: string }[] };
    }) => ({
      id: emote.id,
      name: emote.name,
      provider: '7tv',
      url: emote.host
        ? `https:${emote.host.url}/${emote.host.files?.find((f: { format: string }) => f.format === 'WEBP')?.name || emote.host.files?.[0]?.name || '1x.webp'}`
        : null,
      width: emote.host?.files?.[0]?.width,
      height: emote.host?.files?.[0]?.height,
    }));

    return NextResponse.json(emotes);
  } catch (error) {
    console.error('7TV emote search API error:', error);
    return NextResponse.json([], { status: 500 });
  }
}
