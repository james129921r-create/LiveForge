'use client';

import { useChatStore } from '@/stores/chatStore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { X, Plus, Filter } from 'lucide-react';
import { useState } from 'react';
import { validateRegexFilter } from '@/lib/security';

export function ChatFilterPanel() {
  const { filters, addFilter, removeFilter, toggleFilter } = useChatStore();
  const [newFilter, setNewFilter] = useState('');
  const [filterType, setFilterType] = useState<'word' | 'user' | 'regex'>('word');

  const [filterError, setFilterError] = useState<string | null>(null);

  const handleAdd = () => {
    if (!newFilter.trim()) return;

    // Validate regex filters for ReDoS protection
    if (filterType === 'regex') {
      const validation = validateRegexFilter(newFilter.trim());
      if (!validation.valid) {
        setFilterError(validation.reason ?? 'Invalid regex');
        return;
      }
    }

    setFilterError(null);
    addFilter({
      id: `filter-${Date.now()}`,
      type: filterType,
      value: newFilter.trim(),
      enabled: true,
    });
    setNewFilter('');
  };

  return (
    <div className="p-2 border-b bg-muted/20 space-y-2">
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Filter className="h-3 w-3" />
        Chat Filters
      </div>

      {/* Existing Filters */}
      {filters.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {filters.map((filter) => (
            <Badge
              key={filter.id}
              variant={filter.enabled ? 'default' : 'outline'}
              className="text-xs flex items-center gap-1"
            >
              <span className="text-[10px] opacity-70 uppercase">{filter.type}</span>
              {filter.value}
              <button onClick={() => toggleFilter(filter.id)}>
                <span className={`w-1.5 h-1.5 rounded-full ${filter.enabled ? 'bg-green-400' : 'bg-gray-400'}`} />
              </button>
              <button onClick={() => removeFilter(filter.id)}>
                <X className="h-2.5 w-2.5" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Add Filter */}
      <div className="flex gap-1">
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as 'word' | 'user' | 'regex')}
          className="h-8 rounded-md border bg-background px-2 text-xs"
        >
          <option value="word">Word</option>
          <option value="user">User</option>
          <option value="regex">Regex</option>
        </select>
        <Input
          placeholder="Add filter..."
          value={newFilter}
          onChange={(e) => setNewFilter(e.target.value)}
          className="h-8 text-xs"
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={handleAdd}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      {filterError && (
        <div className="text-[10px] text-red-500">{filterError}</div>
      )}
    </div>
  );
}
