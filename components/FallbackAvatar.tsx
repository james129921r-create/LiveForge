'use client';

import { useState } from 'react';

interface FallbackAvatarProps {
  src?: string | null;
  alt: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-7 h-7 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
};

/**
 * Generate a consistent color from a string (username).
 * This ensures the same user always gets the same gradient color.
 */
function stringToGradient(name: string): { from: string; to: string } {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }

  // Pre-defined gradient pairs that look good on dark backgrounds
  const gradients = [
    { from: 'from-violet-500/40', to: 'to-fuchsia-500/20' },
    { from: 'from-blue-500/40', to: 'to-cyan-500/20' },
    { from: 'from-emerald-500/40', to: 'to-teal-500/20' },
    { from: 'from-amber-500/40', to: 'to-orange-500/20' },
    { from: 'from-rose-500/40', to: 'to-pink-500/20' },
    { from: 'from-indigo-500/40', to: 'to-blue-500/20' },
    { from: 'from-cyan-500/40', to: 'to-sky-500/20' },
    { from: 'from-teal-500/40', to: 'to-green-500/20' },
    { from: 'from-orange-500/40', to: 'to-red-500/20' },
    { from: 'from-pink-500/40', to: 'to-rose-500/20' },
  ];

  const idx = Math.abs(hash) % gradients.length;
  return gradients[idx]!;
}

/**
 * Avatar with fallback for broken image URLs.
 * Kick CDN images sometimes fail to load (CORS, expired URLs, null from API, etc.)
 * This component shows a consistent gradient + initial as a fallback.
 */
export function FallbackAvatar({ src, alt, size = 'md', className = '' }: FallbackAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  const initial = alt?.[0]?.toUpperCase() || '?';
  const gradient = stringToGradient(alt || 'default');

  // No URL or error — show gradient + initial
  if (!src || imgError) {
    return (
      <div className={`${sizeClasses[size]} rounded-full bg-gradient-to-br ${gradient.from} ${gradient.to} flex items-center justify-center font-bold shrink-0 overflow-hidden ${className}`}>
        {initial}
      </div>
    );
  }

  return (
    <div className={`${sizeClasses[size]} rounded-full bg-gradient-to-br ${gradient.from} ${gradient.to} flex items-center justify-center font-bold shrink-0 overflow-hidden ${className}`}>
      {!imgLoaded && initial}
      <img
        src={src}
        alt={alt}
        className={`w-full h-full object-cover rounded-full ${imgLoaded ? '' : 'hidden'}`}
        onError={() => setImgError(true)}
        onLoad={() => setImgLoaded(true)}
      />
    </div>
  );
}

/**
 * Thumbnail with fallback for broken image URLs.
 * Used for stream thumbnails which may be null or expired.
 */
export function FallbackThumbnail({ src, alt, className = '' }: { src?: string | null; alt: string; className?: string }) {
  const [imgError, setImgError] = useState(false);

  if (!src || imgError) {
    return (
      <div className={`bg-gradient-to-br from-muted/50 to-muted/20 flex items-center justify-center ${className}`}>
        <svg className="w-8 h-8 text-muted-foreground/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setImgError(true)}
    />
  );
}
