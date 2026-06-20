import { create } from 'zustand';
import type { StreamChannel, CategoryItem } from '@/types';

interface SearchState {
  query: string;
  results: StreamChannel[];
  categories: CategoryItem[];
  isSearching: boolean;
  recentSearches: string[];

  setQuery: (query: string) => void;
  setResults: (results: StreamChannel[]) => void;
  setCategories: (categories: CategoryItem[]) => void;
  setSearching: (searching: boolean) => void;
  addRecentSearch: (query: string) => void;
  removeRecentSearch: (query: string) => void;
  clearRecentSearches: () => void;
}

export const useSearchStore = create<SearchState>((set) => ({
  query: '',
  results: [],
  categories: [],
  isSearching: false,
  recentSearches: [],

  setQuery: (query) => set({ query }),
  setResults: (results) => set({ results }),
  setCategories: (categories) => set({ categories }),
  setSearching: (searching) => set({ isSearching: searching }),
  addRecentSearch: (query) =>
    set((s) => ({
      recentSearches: [query, ...s.recentSearches.filter((q) => q !== query)].slice(0, 15),
    })),
  removeRecentSearch: (query) =>
    set((s) => ({
      recentSearches: s.recentSearches.filter((q) => q !== query),
    })),
  clearRecentSearches: () => set({ recentSearches: [] }),
}));
