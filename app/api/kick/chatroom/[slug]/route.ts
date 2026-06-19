import { NextRequest, NextResponse } from 'next/server';
import { fetchKickChatroom } from '@/lib/kick-fetch';

/**
 * Validate a channel slug — only allow alphanumeric, underscore, hyphen.
 */
function validateSlug(slug: string): { valid: boolean; sanitized?: string } {
  const sanitized = slug.toLowerCase().replace(/[^a-z0-9_-]/g, '');
  if (!sanitized || sanitized.length > 64) {
    return { valid: false };
  }
  return { valid: true, sanitized };
}

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
    const res = await fetchKickChatroom(validation.sanitized);
    if (!res.ok) {
      return NextResponse.json(
        { error: 'Chatroom not found' },
        { status: res.status }
      );
    }

    const data = res.data as Record<string, unknown>;

    return NextResponse.json({
      id: data.id,
      slowMode: data.slow_mode || false,
      messageInterval: data.message_interval || 0,
      followersMode: data.followers_mode || false,
      followersMinDuration: data.following_min_duration || 0,
      subscribersMode: data.subscribers_mode || false,
      emotesMode: data.emotes_mode || false,
      pinnedMessage: data.pinned_message || null,
    });
  } catch (error) {
    console.error('Kick chatroom API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch chatroom' },
      { status: 500 }
    );
  }
}
