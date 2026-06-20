'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import type { ChatMessage, ChatFilter } from '@/types';

// ─── Types ─────────────────────────────────────────────────────────────────

interface WorkerParsePayload {
  rawEvent: { message?: KickChatMessageRaw };
  filters: ChatFilter[];
}

interface WorkerParseBatchPayload {
  rawEvents: { message?: KickChatMessageRaw }[];
  filters: ChatFilter[];
}

interface WorkerIncomingMessage {
  type: 'parsed';
  payload: ChatMessage | null;
}

interface WorkerIncomingBatchMessage {
  type: 'parsed-batch';
  payload: ChatMessage[];
}

// Raw Kick chat message format (subset used by the worker)
interface KickChatMessageRaw {
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

export type ChatWorkerMessage = WorkerIncomingMessage | WorkerIncomingBatchMessage;

interface UseChatWorkerReturn {
  /** Whether the web worker is available and running */
  isAvailable: boolean;
  /** Post a single raw event to the worker for parsing */
  postParse: (payload: WorkerParsePayload) => void;
  /** Post a batch of raw events to the worker for parsing */
  postParseBatch: (payload: WorkerParseBatchPayload) => void;
  /** Register a callback for parsed messages from the worker */
  onParsed: (callback: (message: ChatMessage | null) => void) => void;
  /** Register a callback for batch-parsed messages from the worker */
  onParsedBatch: (callback: (messages: ChatMessage[]) => void) => void;
}

// ─── Fallback: main-thread parsing ────────────────────────────────────────

function parseKickMessageMainThread(rawEvent: { message?: KickChatMessageRaw }): ChatMessage | null {
  const msg = rawEvent.message;
  if (!msg || !msg.sender) return null;

  const kickEmotes = (msg.emotes || []).map((e) => ({
    id: `kick-${e.emote_id}`,
    name: msg.content.substring(e.start, e.end + 1),
    url: `https://files.kick.com/emotes/${e.emote_id}/fullsize`,
    provider: 'kick' as const,
  }));

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

function applyFiltersMainThread(message: ChatMessage, filters: ChatFilter[]): boolean {
  const enabledFilters = filters.filter((f) => f.enabled);
  if (enabledFilters.length === 0) return true;

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
          return true;
        }
      }
      default:
        return true;
    }
  });
}

// ─── Hook ──────────────────────────────────────────────────────────────────

export function useChatWorker(): UseChatWorkerReturn {
  const workerRef = useRef<Worker | null>(null);
  const [isAvailable, setIsAvailable] = useState(false);
  const parsedCallbackRef = useRef<((message: ChatMessage | null) => void) | null>(null);
  const parsedBatchCallbackRef = useRef<((messages: ChatMessage[]) => void) | null>(null);
  // Track if we're using worker or fallback
  const useFallbackRef = useRef(false);

  useEffect(() => {
    // Try to create the Web Worker
    try {
      if (typeof Worker !== 'undefined') {
        const worker = new Worker(
          new URL('../workers/chat-parser.worker.ts', import.meta.url),
          { type: 'module' }
        );

        worker.onmessage = (event: MessageEvent<ChatWorkerMessage>) => {
          const { type, payload } = event.data;
          if (type === 'parsed') {
            parsedCallbackRef.current?.(payload as ChatMessage | null);
          } else if (type === 'parsed-batch') {
            parsedBatchCallbackRef.current?.(payload as ChatMessage[]);
          }
        };

        worker.onerror = (err) => {
          console.warn('[useChatWorker] Worker error, falling back to main thread:', err);
          useFallbackRef.current = true;
          setIsAvailable(false);
          // Terminate the broken worker
          worker.terminate();
          workerRef.current = null;
        };

        workerRef.current = worker;
        setIsAvailable(true);
        useFallbackRef.current = false;
      } else {
        useFallbackRef.current = true;
        setIsAvailable(false);
      }
    } catch (err) {
      console.warn('[useChatWorker] Worker creation failed, falling back to main thread:', err);
      useFallbackRef.current = true;
      setIsAvailable(false);
    }

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  const postParse = useCallback((payload: WorkerParsePayload) => {
    if (useFallbackRef.current) {
      // Fallback: parse on main thread
      const message = parseKickMessageMainThread(payload.rawEvent);
      if (message && applyFiltersMainThread(message, payload.filters)) {
        parsedCallbackRef.current?.(message);
      } else {
        parsedCallbackRef.current?.(null);
      }
      return;
    }

    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'parse', payload });
    }
  }, []);

  const postParseBatch = useCallback((payload: WorkerParseBatchPayload) => {
    if (useFallbackRef.current) {
      // Fallback: parse on main thread
      const results: ChatMessage[] = [];
      for (const rawEvent of payload.rawEvents) {
        const message = parseKickMessageMainThread(rawEvent);
        if (message && applyFiltersMainThread(message, payload.filters)) {
          results.push(message);
        }
      }
      parsedBatchCallbackRef.current?.(results);
      return;
    }

    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'parse-batch', payload });
    }
  }, []);

  const onParsed = useCallback((callback: (message: ChatMessage | null) => void) => {
    parsedCallbackRef.current = callback;
  }, []);

  const onParsedBatch = useCallback((callback: (messages: ChatMessage[]) => void) => {
    parsedBatchCallbackRef.current = callback;
  }, []);

  return {
    isAvailable,
    postParse,
    postParseBatch,
    onParsed,
    onParsedBatch,
  };
}
