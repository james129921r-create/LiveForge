import { NextRequest, NextResponse } from 'next/server';
import { fetchKickChannel } from '@/lib/kick-fetch';
import { normalizeChannel } from '@/lib/normalize-channel';
import { validateSlug } from '@/lib/parse-utils';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  // Validate and sanitize slug
  const validation = validateSlug(slug);
  if (!validation.valid || !validation.sanitized) {
    return NextResponse.json(
      { error: 'Invalid channel slug' },
      { status: 400 }
    );
  }

  try {
    const res = await fetchKickChannel(validation.sanitized);
    if (!res.ok) {
      return NextResponse.json(
        { error: 'Channel not found' },
        { status: res.status }
      );
    }

    const data = res.data as Record<string, unknown>;

    // Use shared normalizer — handles mature content, pool/hot tub, ASMR, banned content, uptime
    const channel = normalizeChannel(data);

    if (!channel) {
      // normalizeChannel returns null for banned content or missing slug
      const slugValue = data.slug as string | undefined;
      if (!slugValue) {
        return NextResponse.json(
          { error: 'Channel data unavailable' },
          { status: 502 }
        );
      }
      // Banned content filtered out
      return NextResponse.json(
        { error: 'Channel content violates safety policy' },
        { status: 451 }
      );
    }

    // Add bio field (not in the shared normalizer since it's only used here)
    const user = data.user as Record<string, unknown> | undefined;
    const result = {
      ...channel,
      bio: user?.bio || null,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('Kick channel API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch channel' },
      { status: 500 }
    );
  }
}
