/**
 * Chat Parser Web Worker
 *
 * Offloads chat message parsing from the main thread. Receives raw Pusher
 * event data, parses the KickChatMessage format, builds emote replacement
 * strings, applies chat filters, and returns processed ChatMessage objects.
 *
 * Message protocol:
 *   MAIN → WORKER:  { type: 'parse', payload: { rawEvent, filters } }
 *   WORKER → MAIN:  { type: 'parsed', payload: ChatMessage | null }
 *   MAIN → WORKER:  { type: 'parse-batch', payload: { rawEvents, filters } }
 *   WORKER → MAIN:  { type: 'parsed-batch', payload: ChatMessage[] }
 */

// ─── Types (duplicated to avoid importing from main thread) ────────────────

interface KickChatMessage {
  id: string;
  chatroom_id: number;
  content: string;
  type: string;
  created_at: string;
  sender: {
    id: number;
    username: string;
    slug: string;
    color: string;
    identity?: {
      badges?: { type: string; text: string; count?: number }[];
    };
  };
  emotes?: {
    id: string;
    emote_id: string;
    start: number;
    end: number;
  }[];
}

interface Emote {
  id: string;
  name: string;
  url: string;
  provider: '7tv' | 'bttv' | 'ffz' | 'kick';
}

interface ChatMessage {
  id: string;
  username: string;
  displayName: string;
  content: string;
  color: string;
  badges?: string[];
  emotes?: Emote[];
  timestamp: number;
  isAction?: boolean;
}

interface ChatFilter {
  id: string;
  type: 'word' | 'user' | 'regex';
  value: string;
  enabled: boolean;
}

// ─── Message parsing ───────────────────────────────────────────────────────

function parseKickEmotes(msg: KickChatMessage): Emote[] {
  if (!msg.emotes || msg.emotes.length === 0) return [];

  return msg.emotes.map((e) => ({
    id: `kick-${e.emote_id}`,
    name: msg.content.substring(e.start, e.end + 1),
    url: `https://files.kick.com/emotes/${e.emote_id}/fullsize`,
    provider: 'kick' as const,
  }));
}

function parseKickMessage(rawEvent: { message?: KickChatMessage }): ChatMessage | null {
  const msg = rawEvent.message;
  if (!msg || !msg.sender) return null;

  const kickEmotes = parseKickEmotes(msg);

  return {
    id: msg.id,
    username: msg.sender.slug || msg.sender.username,
    displayName: msg.sender.username,
    content: msg.content,
    color: msg.sender.color || '#e5e5e5',
    badges: msg.sender.identity?.badges?.map((b) => b.type) || [],
    emotes: kickEmotes,
    timestamp: new Date(msg.created_at).getTime(),
  };
}

// ─── Filter logic ──────────────────────────────────────────────────────────

function applyFilters(message: ChatMessage, filters: ChatFilter[]): boolean {
  const enabledFilters = filters.filter((f) => f.enabled);
  if (enabledFilters.length === 0) return true; // passes

  return enabledFilters.every((filter) => {
    switch (filter.type) {
      case 'word':
        return !message.content.toLowerCase().includes(filter.value.toLowerCase());
      case 'user':
        return message.username.toLowerCase() !== filter.value.toLowerCase();
      case 'regex': {
        try {
          return !new RegExp(filter.value, 'i').test(message.content);
        } catch {
          return true; // Invalid regex — let message pass
        }
      }
      default:
        return true;
    }
  });
}

// ─── Worker message handler ────────────────────────────────────────────────

self.onmessage = (event: MessageEvent) => {
  const { type, payload } = event.data;

  switch (type) {
    case 'parse': {
      const { rawEvent, filters } = payload as { rawEvent: { message?: KickChatMessage }; filters: ChatFilter[] };
      const message = parseKickMessage(rawEvent);
      if (!message) {
        self.postMessage({ type: 'parsed', payload: null });
        return;
      }
      // Apply filters in the worker
      if (!applyFilters(message, filters)) {
        self.postMessage({ type: 'parsed', payload: null });
        return;
      }
      self.postMessage({ type: 'parsed', payload: message });
      break;
    }

    case 'parse-batch': {
      const { rawEvents, filters } = payload as { rawEvents: { message?: KickChatMessage }[]; filters: ChatFilter[] };
      const results: ChatMessage[] = [];
      for (const rawEvent of rawEvents) {
        const message = parseKickMessage(rawEvent);
        if (message && applyFilters(message, filters)) {
          results.push(message);
        }
      }
      self.postMessage({ type: 'parsed-batch', payload: results });
      break;
    }

    default:
      console.warn('[chat-parser.worker] Unknown message type:', type);
  }
};

export {}; // Ensure this is treated as a module
