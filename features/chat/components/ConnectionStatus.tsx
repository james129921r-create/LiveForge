'use client';

import type { ConnectionStatus as ConnectionStatusType } from '@/stores/chatStore';
import { RefreshCw } from 'lucide-react';

interface ConnectionStatusProps {
  status: ConnectionStatusType;
  size?: 'sm' | 'md';
}

export function ConnectionStatus({ status, size = 'sm' }: ConnectionStatusProps) {
  const dotSize = size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5';

  switch (status) {
    case 'connected':
      return (
        <span className="relative flex items-center justify-center" title="Connected">
          <span className={`absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75 animate-ping`} />
          <span className={`relative inline-flex rounded-full ${dotSize} bg-green-500`} />
        </span>
      );
    case 'connecting':
      return (
        <span className="relative flex items-center justify-center" title="Connecting...">
          <span className={`absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75 animate-ping`} />
          <span className={`relative inline-flex rounded-full ${dotSize} bg-amber-500`} />
        </span>
      );
    case 'error':
      return (
        <span className="relative flex items-center justify-center" title="Disconnected — click to retry">
          <span className={`relative inline-flex rounded-full ${dotSize} bg-red-500`} />
          <RefreshCw className="absolute h-2 w-2 text-red-300" />
        </span>
      );
    case 'disconnected':
    default:
      return (
        <span className="relative flex items-center justify-center" title="Disconnected">
          <span className={`relative inline-flex rounded-full ${dotSize} bg-muted-foreground/40`} />
        </span>
      );
  }
}
