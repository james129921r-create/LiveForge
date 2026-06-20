'use client';

import type { GridLayout } from '@/types';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip';

interface LayoutSelectorProps {
  currentLayout: GridLayout;
  onLayoutChange: (layout: GridLayout) => void;
}

/**
 * Visual SVG preview for each layout type.
 * Each preview is a small grid showing the slot arrangement with
 * the master slot highlighted.
 */
function LayoutPreview({ layout }: { layout: GridLayout }) {
  const cellClass = 'fill-current opacity-20';
  const masterClass = 'fill-current opacity-60';

  switch (layout) {
    case '1x1':
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4">
          <rect x="2" y="2" width="20" height="20" rx="2" className={masterClass} />
        </svg>
      );
    case '1+2':
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4">
          <rect x="2" y="2" width="13" height="20" rx="2" className={masterClass} />
          <rect x="17" y="2" width="5" height="9" rx="1" className={cellClass} />
          <rect x="17" y="13" width="5" height="9" rx="1" className={cellClass} />
        </svg>
      );
    case '2+1':
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4">
          <rect x="2" y="2" width="5" height="9" rx="1" className={cellClass} />
          <rect x="2" y="13" width="5" height="9" rx="1" className={cellClass} />
          <rect x="9" y="2" width="13" height="20" rx="2" className={masterClass} />
        </svg>
      );
    case '2x2':
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4">
          <rect x="2" y="2" width="9" height="9" rx="1" className={masterClass} />
          <rect x="13" y="2" width="9" height="9" rx="1" className={cellClass} />
          <rect x="2" y="13" width="9" height="9" rx="1" className={cellClass} />
          <rect x="13" y="13" width="9" height="9" rx="1" className={cellClass} />
        </svg>
      );
    case '1+3':
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4">
          <rect x="2" y="2" width="13" height="20" rx="2" className={masterClass} />
          <rect x="17" y="2" width="5" height="5" rx="1" className={cellClass} />
          <rect x="17" y="9" width="5" height="5" rx="1" className={cellClass} />
          <rect x="17" y="15" width="5" height="5" rx="1" className={cellClass} />
        </svg>
      );
    case '1+1+2':
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4">
          <rect x="2" y="2" width="9" height="11" rx="1" className={masterClass} />
          <rect x="13" y="2" width="9" height="11" rx="1" className={masterClass} />
          <rect x="2" y="15" width="9" height="7" rx="1" className={cellClass} />
          <rect x="13" y="15" width="9" height="7" rx="1" className={cellClass} />
        </svg>
      );
    case '3x3':
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4">
          <rect x="2" y="2" width="6" height="6" rx="1" className={masterClass} />
          <rect x="10" y="2" width="6" height="6" rx="1" className={cellClass} />
          <rect x="18" y="2" width="4" height="6" rx="1" className={cellClass} />
          <rect x="2" y="10" width="6" height="6" rx="1" className={cellClass} />
          <rect x="10" y="10" width="6" height="6" rx="1" className={cellClass} />
          <rect x="18" y="10" width="4" height="6" rx="1" className={cellClass} />
          <rect x="2" y="18" width="6" height="4" rx="1" className={cellClass} />
          <rect x="10" y="18" width="6" height="4" rx="1" className={cellClass} />
          <rect x="18" y="18" width="4" height="4" rx="1" className={cellClass} />
        </svg>
      );
  }
}

const layouts: { value: GridLayout; label: string; description: string }[] = [
  { value: '1x1', label: '1', description: 'Single stream' },
  { value: '1+2', label: '1+2', description: '1 master + 2 side' },
  { value: '2+1', label: '2+1', description: '2 side + 1 master' },
  { value: '2x2', label: '2×2', description: 'Equal quad' },
  { value: '1+3', label: '1+3', description: '1 master + 3 side' },
  { value: '1+1+2', label: '1+1+2', description: '2 large + 2 small' },
  { value: '3x3', label: '3×3', description: 'Nine streams' },
];

export function LayoutSelector({ currentLayout, onLayoutChange }: LayoutSelectorProps) {
  return (
    <div className="flex items-center gap-1">
      {layouts.map(({ value, label, description }) => (
        <Tooltip key={value}>
          <TooltipTrigger asChild>
            <Button
              variant={currentLayout === value ? 'default' : 'ghost'}
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => onLayoutChange(value)}
            >
              <LayoutPreview layout={value} />
              <span className="text-xs hidden sm:inline">{label}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>{description}</p>
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
