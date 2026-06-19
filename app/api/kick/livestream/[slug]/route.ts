import { NextRequest, NextResponse } from 'next/server';
import { fetchKickLivestream, fetchKickChannel } from '@/lib/kick-fetch';
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
    // Fetch livestream data from the livestream endpoint
    const res = await fetchKickLivestream(validation.sanitized);
    // Also try the channel endpoint as fallback — it has playback_url at top level
    let channelData: Record<string, unknown> | null = null;
    let hlsUrl: string | null = null;

    try {
      const channelRes = await fetchKickChannel(validation.sanitized);
      if (channelRes.ok && channelRes.data) {
        channelData = channelRes.data as Record<string, unknown>;
        // The Kick API v2 channel endpoint returns playback_url at the top level
        hlsUrl = (channelData.playback_url as string) || null;
      }
    } catch {
      // Channel fetch failed, continue with livestream data only
    }

    if (!res.ok && !channelData) {
      return NextResponse.json(
        { error: 'Livestream not found' },
        { status: res.status || 404 }
      );
    }

    const data = res.data as Record<string, unknown> | null;
    const dataData = data?.data as Record<string, unknown> | undefined;
    const category = dataData?.category as Record<string, unknown> | undefined;
    const thumbnail = dataData?.thumbnail as Record<string, unknown> | undefined;

    // Resolve HLS playback URL from multiple sources:
    // 1. Channel endpoint top-level playback_url (most reliable)
    // 2. Livestream endpoint data.data.playback_url
    // 3. Livestream endpoint top-level playback_url
    const resolvedHlsUrl = hlsUrl ||
      (dataData?.playback_url as string) ||
      (data?.playback_url as string) ||
      null;

    // Build the response
    const result: Record<string, unknown> = {
      id: dataData?.id || channelData?.id,
      title: dataData?.session_title || (channelData?.livestream as Record<string, unknown>)?.session_title || null,
      isLive: !!dataData?.is_live || !!(channelData?.livestream as Record<string, unknown>)?.is_live,
      viewerCount: dataData?.viewers || (channelData?.livestream as Record<string, unknown>)?.viewer_count || 0,
      playbackUrl: resolvedHlsUrl,
      thumbnail: thumbnail || null,
      category: category?.name || ((channelData?.livestream as Record<string, unknown>)?.categories as Array<Record<string, unknown>>)?.[0]?.name || null,
      language: dataData?.language || null,
      startedAt: dataData?.created_at || (channelData?.livestream as Record<string, unknown>)?.start_time || null,
    };

    // If we have channel data, also return the normalized channel info
    if (channelData) {
      const normalized = normalizeChannel(channelData);
      if (normalized) {
        result.channel = normalized;
        // Override the HLS URL if the normalized channel has one
        if (!result.playbackUrl && normalized.hlsUrl) {
          result.playbackUrl = normalized.hlsUrl;
        }
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Kick livestream API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch livestream' },
      { status: 500 }
    );
  }
}
