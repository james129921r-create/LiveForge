'use client';

import type { ChatMessage as ChatMessageType, Emote } from '@/types';
import { useChatStore } from '@/stores/chatStore';
import { useMultiStreamStore } from '@/stores/multiStreamStore';
import { useState, useMemo, useCallback } from 'react';
import { escapeHtml, validateEmoteUrl, sanitizeUsername } from '@/lib/security';

interface ChatMessageProps {
  message: ChatMessageType;
  compact?: boolean;
}

export function ChatMessage({ message, compact = false }: ChatMessageProps) {
  const [isHovered, setIsHovered] = useState(false);
  const { emoteSets } = useChatStore();
  const activeChannelUsername = useMultiStreamStore((s) => s.activeChannel?.username);

  // Get third-party emotes for the active channel
  const thirdPartyEmotes = useMemo(() => {
    if (!activeChannelUsername) return [];
    return emoteSets[activeChannelUsername] || [];
  }, [emoteSets, activeChannelUsername]);

  // Parse emotes in message content
  const parseContent = (content: string, emotes?: Emote[]) => {
    // Combine API-provided emotes with third-party emotes
    const allEmotes = [...(emotes || []), ...thirdPartyEmotes];

    if (allEmotes.length === 0) {
      return <span>{escapeHtml(content)}</span>;
    }

    // Build a map of emote name -> emote data
    const emoteMap = new Map<string, Emote>();
    for (const emote of allEmotes) {
      if (!emoteMap.has(emote.name)) {
        emoteMap.set(emote.name, emote);
      }
    }

    // Split content by emote names
    const parts: React.ReactNode[] = [];
    let remaining = content;
    let keyIdx = 0;

    while (remaining.length > 0) {
      let earliestMatch = -1;
      let matchedEmote: Emote | null = null;

      for (const [name, emote] of emoteMap) {
        const idx = remaining.indexOf(name);
        if (idx !== -1 && (earliestMatch === -1 || idx < earliestMatch)) {
          earliestMatch = idx;
          matchedEmote = emote;
        }
      }

      if (earliestMatch === -1 || !matchedEmote) {
        parts.push(<span key={`t-${keyIdx++}`}>{escapeHtml(remaining)}</span>);
        break;
      }

      // Text before the emote
      if (earliestMatch > 0) {
        parts.push(<span key={`t-${keyIdx++}`}>{escapeHtml(remaining.slice(0, earliestMatch))}</span>);
      }

      // Emote image — validate URL before rendering
      const emoteUrl = validateEmoteUrl(matchedEmote.url).valid ? matchedEmote.url : '';
      parts.push(
        <img
          key={`e-${keyIdx++}`}
          src={emoteUrl}
          alt={escapeHtml(matchedEmote.name)}
          title={escapeHtml(matchedEmote.name)}
          className="inline-block h-[1.25em] w-auto align-middle mx-0.5"
          onError={(e) => {
            (e.target as HTMLElement).style.display = 'none';
          }}
        />
      );

      remaining = remaining.slice(earliestMatch + matchedEmote.name.length);
    }

    return <>{parts}</>;
  };

  // Map badge types to display
  const renderBadges = (badges?: string[]) => {
    if (!badges || badges.length === 0) return null;
    return badges.map((badge, i) => {
      switch (badge) {
        case 'subscriber':
          return <span key={i} className="inline-block ml-0.5 px-1 py-0 text-[10px] bg-purple-500/20 text-purple-400 rounded">SUB</span>;
        case 'vip':
          return <span key={i} className="inline-block ml-0.5 px-1 py-0 text-[10px] bg-yellow-500/20 text-yellow-400 rounded">VIP</span>;
        case 'moderator':
          return <span key={i} className="inline-block ml-0.5 px-1 py-0 text-[10px] bg-green-500/20 text-green-400 rounded">MOD</span>;
        case 'owner':
          return <span key={i} className="inline-block ml-0.5 px-1 py-0 text-[10px] bg-red-500/20 text-red-400 rounded">OWNER</span>;
        case 'verified':
          return <span key={i} className="inline-block ml-0.5 px-1 py-0 text-[10px] bg-blue-500/20 text-blue-400 rounded">&#10003;</span>;
        default:
          return <span key={i} className="inline-block ml-0.5 px-1 py-0 text-[10px] bg-muted text-muted-foreground rounded">{badge}</span>;
      }
    });
  };

  return (
    <div
      className={`text-sm leading-relaxed group hover:bg-muted/30 rounded transition-colors ${
        compact ? 'px-1 py-px' : 'px-1 py-0.5'
      } ${isHovered ? 'bg-muted/30' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {!compact && renderBadges(message.badges)}
      <span className="font-semibold ml-0.5" style={{ color: message.color }}>
        {sanitizeUsername(message.displayName)}
      </span>
      <span className="text-muted-foreground mx-1">:</span>
      <span className="text-foreground/90">{parseContent(message.content, message.emotes)}</span>

      {/* Timestamp on hover */}
      {isHovered && !compact && (
        <span className="float-right text-[10px] text-muted-foreground/50 ml-2">
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      )}
    </div>
  );
}
