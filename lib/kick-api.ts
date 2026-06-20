import type { StreamChannel, CategoryItem } from '@/types';

const API_BASE = '/api/kick';

export async function fetchChannel(slug: string): Promise<StreamChannel | null> {
  try {
    const res = await fetch(`${API_BASE}/channel/${encodeURIComponent(slug)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export interface SearchOptions {
  /** Only return live streams */
  liveOnly?: boolean;
  /** Sort order: relevance | viewers | recent */
  sort?: 'relevance' | 'viewers' | 'recent';
  /** Filter by category slug */
  category?: string;
  /** Pagination limit */
  limit?: number;
  /** Pagination offset */
  offset?: number;
}

export interface SearchResult {
  channels: StreamChannel[];
  categories: CategoryItem[];
  total: number;
  limit: number;
  offset: number;
}

export async function searchChannels(query: string, options?: SearchOptions): Promise<SearchResult> {
  try {
    const params = new URLSearchParams();
    params.set('q', query);
    if (options?.liveOnly) params.set('liveOnly', 'true');
    if (options?.sort) params.set('sort', options.sort);
    if (options?.category) params.set('category', options.category);
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));
    const res = await fetch(`${API_BASE}/search?${params.toString()}`);
    if (!res.ok) return { channels: [], categories: [], total: 0, limit: 20, offset: 0 };
    return await res.json();
  } catch {
    return { channels: [], categories: [], total: 0, limit: 20, offset: 0 };
  }
}

export interface CategoriesOptions {
  /** Filter by section: all | general | mature */
  section?: 'all' | 'general' | 'mature';
  /** Include channel count from known map */
  includeChannelCount?: boolean;
}

export async function fetchTopCategories(options?: CategoriesOptions): Promise<CategoryItem[]> {
  try {
    const params = new URLSearchParams();
    if (options?.section && options.section !== 'all') params.set('section', options.section);
    if (options?.includeChannelCount) params.set('includeChannelCount', 'true');
    const qs = params.toString();
    const res = await fetch(`${API_BASE}/categories${qs ? `?${qs}` : ''}`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export interface CategoryChannelsOptions {
  /** Only return live streams */
  liveOnly?: boolean;
  /** Sort order */
  sort?: 'viewers' | 'recent';
  /** Max results */
  limit?: number;
}

export async function fetchCategoryChannels(slug: string, options?: CategoryChannelsOptions): Promise<{
  category: CategoryItem | null;
  channels: StreamChannel[];
  total: number;
}> {
  try {
    const params = new URLSearchParams();
    if (options?.liveOnly) params.set('liveOnly', 'true');
    if (options?.sort) params.set('sort', options.sort);
    if (options?.limit) params.set('limit', String(options.limit));
    const qs = params.toString();
    const res = await fetch(`${API_BASE}/categories/${encodeURIComponent(slug)}/channels${qs ? `?${qs}` : ''}`);
    if (!res.ok) return { category: null, channels: [], total: 0 };
    return await res.json();
  } catch {
    return { category: null, channels: [], total: 0 };
  }
}

export async function fetchLivestream(slug: string): Promise<{
  id: number;
  title: string;
  isLive: boolean;
  viewerCount: number;
  playbackUrl: string | null;
  thumbnail: { src?: string; srcset?: string } | null;
  category: string | null;
  language: string | null;
  startedAt: string | null;
  channel?: StreamChannel;
} | null> {
  try {
    const res = await fetch(`${API_BASE}/livestream/${encodeURIComponent(slug)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data;
  } catch {
    return null;
  }
}

export async function fetchChatroomConfig(slug: string): Promise<{
  id: number;
  slowMode: boolean;
  messageInterval: number;
  followersMode: boolean;
  followersMinDuration: number;
  subscribersMode: boolean;
  emotesMode: boolean;
  pinnedMessage: unknown;
} | null> {
  try {
    const res = await fetch(`${API_BASE}/chatroom/${encodeURIComponent(slug)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function search7tvEmotes(query: string): Promise<import('@/types').Emote[]> {
  try {
    const res = await fetch(`/api/emotes/7tv?q=${encodeURIComponent(query)}`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function searchBttvEmotes(query: string): Promise<import('@/types').Emote[]> {
  try {
    const res = await fetch(`/api/emotes/bttv?q=${encodeURIComponent(query)}`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export interface PopularStreamsOptions {
  limit?: number;
  offset?: number;
  category?: string;
  liveOnly?: boolean;
  sort?: 'viewers' | 'recent';
}

export interface PopularStreamsResult {
  channels: StreamChannel[];
  total: number;
  limit: number;
  offset: number;
  stats?: {
    totalLive: number;
    totalViewers: number;
    totalChannels: number;
  };
}

export async function fetchPopularStreams(options?: PopularStreamsOptions): Promise<PopularStreamsResult> {
  try {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));
    if (options?.category) params.set('category', options.category);
    if (options?.liveOnly) params.set('liveOnly', 'true');
    if (options?.sort) params.set('sort', options.sort);
    const qs = params.toString();
    const res = await fetch(`${API_BASE}/popular${qs ? `?${qs}` : ''}`);
    if (!res.ok) return { channels: [], total: 0, limit: 20, offset: 0 };
    return await res.json();
  } catch {
    return { channels: [], total: 0, limit: 20, offset: 0 };
  }
}

export async function fetchCategoryLivestreams(slug: string, options?: CategoryChannelsOptions): Promise<{
  category: CategoryItem | null;
  channels: StreamChannel[];
  total: number;
}> {
  try {
    const params = new URLSearchParams();
    if (options?.liveOnly) params.set('liveOnly', 'true');
    if (options?.sort) params.set('sort', options.sort);
    if (options?.limit) params.set('limit', String(options.limit));
    const qs = params.toString();
    const res = await fetch(`${API_BASE}/categories/${encodeURIComponent(slug)}/channels${qs ? `?${qs}` : ''}`);
    if (!res.ok) return { category: null, channels: [], total: 0 };
    return await res.json();
  } catch {
    return { category: null, channels: [], total: 0 };
  }
}

export async function fetchRecommendations(options: {
  channel?: string;
  category?: string;
  limit?: number;
}): Promise<{
  channels: StreamChannel[];
  category: CategoryItem | null;
}> {
  try {
    const params = new URLSearchParams();
    if (options.channel) params.set('channel', options.channel);
    if (options.category) params.set('category', options.category);
    if (options.limit) params.set('limit', String(options.limit));
    const qs = params.toString();
    const res = await fetch(`${API_BASE}/recommendations${qs ? `?${qs}` : ''}`);
    if (!res.ok) return { channels: [], category: null };
    return await res.json();
  } catch {
    return { channels: [], category: null };
  }
}

export async function fetchTrendingStreams(): Promise<{
  trending: StreamChannel[];
  rising: StreamChannel[];
  newStreamers: StreamChannel[];
}> {
  try {
    const res = await fetch(`${API_BASE}/trending`);
    if (!res.ok) return { trending: [], rising: [], newStreamers: [] };
    return await res.json();
  } catch {
    return { trending: [], rising: [], newStreamers: [] };
  }
}
