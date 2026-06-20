'use client';

import { useState, useCallback, useRef } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { EmoteAutocomplete, type EmoteAutocompleteHandle } from './EmoteAutocomplete';
import { Send, Lock } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

interface ChatInputProps {
  channelName: string;
}

export function ChatInput({ channelName }: ChatInputProps) {
  const [value, setValue] = useState('');
  const { addMessageForChannel } = useChatStore();
  const emoteAutocompleteRef = useRef<EmoteAutocompleteHandle>(null);
  const isMobile = useIsMobile();

  const handleSend = () => {
    if (!value.trim()) return;
    // Note: Sending to Kick requires authentication.
    // For now, we add the message locally only.
    addMessageForChannel(channelName, {
      id: `msg-self-${Date.now()}`,
      username: 'You',
      displayName: 'You',
      content: value,
      color: '#4ECDC4',
      timestamp: Date.now(),
    });
    setValue('');
  };

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Let EmoteAutocomplete handle navigation keys first
    if (emoteAutocompleteRef.current?.handleKeyDown(e)) {
      return;
    }

    // If Enter was not consumed by autocomplete, let the form submit
  }, []);

  return (
    <div className="p-2 border-t bg-muted/20">
      <EmoteAutocomplete
        ref={emoteAutocompleteRef}
        value={value}
        onValueChange={setValue}
        channelName={channelName}
      >
        <form
          onSubmit={(e) => {
            // Don't submit if the emote autocomplete is open
            if (emoteAutocompleteRef.current?.isOpen) {
              e.preventDefault();
              return;
            }
            e.preventDefault();
            handleSend();
          }}
          className="flex gap-2"
        >
          <div className="relative flex-1">
            <Input
              placeholder={`Message ${channelName}...`}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              className={`text-sm pr-8 ${isMobile ? 'h-10' : ''}`}
            />
            <span title="Sign in to Kick to send messages">
              <Lock className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/50" />
            </span>
          </div>
          <Button type="submit" size="icon" className="shrink-0">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </EmoteAutocomplete>
      <div className="text-[10px] text-muted-foreground/60 mt-1 text-center">
        Viewing only — sign in to Kick to send messages · Type : for emotes
      </div>
    </div>
  );
}
