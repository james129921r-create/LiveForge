import { create } from 'zustand';
import type { DownloadItem } from '@/types';

interface DownloadState {
  downloads: DownloadItem[];

  addDownload: (item: DownloadItem) => void;
  updateDownload: (id: string, updates: Partial<DownloadItem>) => void;
  removeDownload: (id: string) => void;
  clearCompleted: () => void;
}

export const useDownloadStore = create<DownloadState>((set) => ({
  downloads: [],

  addDownload: (item) => set((s) => ({ downloads: [...s.downloads, item] })),
  updateDownload: (id, updates) =>
    set((s) => ({
      downloads: s.downloads.map((d) => (d.id === id ? { ...d, ...updates } : d)),
    })),
  removeDownload: (id) =>
    set((s) => ({ downloads: s.downloads.filter((d) => d.id !== id) })),
  clearCompleted: () =>
    set((s) => ({ downloads: s.downloads.filter((d) => d.status !== 'completed') })),
}));
