// Layout sharing utility — encode/decode workspace state to/from URL-safe strings
// Uses base64 encoding of a compressed JSON representation

export interface SharedLayoutData {
  v: 1; // version
  n: string; // name
  l: string; // layout type
  s: Array<{ p: number; c: string }>; // slots (position + channelSlug)
  a?: Record<string, number>; // audio volumes
  m?: Record<string, boolean>; // muted states
}

export function encodeLayout(data: SharedLayoutData): string {
  try {
    const json = JSON.stringify(data);
    // Use btoa for base64 encoding (works in browser and Node)
    if (typeof window !== 'undefined') {
      return btoa(encodeURIComponent(json));
    }
    return Buffer.from(encodeURIComponent(json)).toString('base64');
  } catch {
    return '';
  }
}

export function decodeLayout(encoded: string): SharedLayoutData | null {
  try {
    let json: string;
    if (typeof window !== 'undefined') {
      json = decodeURIComponent(atob(encoded));
    } else {
      json = decodeURIComponent(Buffer.from(encoded, 'base64').toString('utf-8'));
    }
    const data = JSON.parse(json);
    // Validate basic structure
    if (!data || data.v !== 1 || !data.n || !data.l || !Array.isArray(data.s)) {
      return null;
    }
    return data as SharedLayoutData;
  } catch {
    return null;
  }
}

export function generateShareUrl(data: SharedLayoutData): string {
  const encoded = encodeLayout(data);
  if (!encoded) return '';
  // Use relative URL with query param
  if (typeof window !== 'undefined') {
    const url = new URL(window.location.origin + window.location.pathname);
    url.searchParams.set('layout', encoded);
    return url.toString();
  }
  return `/?layout=${encoded}`;
}

export function parseShareUrl(url: string): SharedLayoutData | null {
  try {
    const urlObj = new URL(url);
    const layoutParam = urlObj.searchParams.get('layout');
    if (!layoutParam) return null;
    return decodeLayout(layoutParam);
  } catch {
    return null;
  }
}
