import { NextRequest, NextResponse } from 'next/server';
import { fetchKickChatroomMessages } from '@/lib/kick-fetch';

/**
 * Validate a chatroom ID — must be numeric only.
 */
function validateChatroomId(id: string): { valid: boolean; sanitized?: string } {
  const sanitized = id.replace(/[^0-9]/g, '');
  if (!sanitized || sanitized.length > 20) {
    return { valid: false };
  }
  return { valid: true, sanitized };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  // Validate chatroom ID (must be numeric)
  const validation = validateChatroomId(slug);
  if (!validation.valid || !validation.sanitized) {
    return NextResponse.json(
      { data: [], error: 'Invalid chatroom ID' },
      { status: 400 }
    );
  }

  try {
    // Fetch recent messages from Kick chatroom API
    const res = await fetchKickChatroomMessages(validation.sanitized);
    if (!res.ok) {
      return NextResponse.json(
        { data: [], error: 'Failed to fetch messages' },
        { status: res.status }
      );
    }

    // Pass through the data as-is — it contains the messages array
    return NextResponse.json({ data: res.data });
  } catch (error) {
    console.error('Kick chatroom messages API error:', error);
    return NextResponse.json(
      { data: [], error: 'Failed to fetch messages' },
      { status: 500 }
    );
  }
}
