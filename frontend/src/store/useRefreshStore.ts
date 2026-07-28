import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { migrateStorageKey } from '@/lib/utils/storageMigration'

// One-time key migration for the Finance Now rename — runs before any read below.
migrateStorageKey('caep:refresh', 'fn:refresh')


export const INTERVAL_OPTIONS = [
  { label: 'Off',  ms: null   },
  { label: '30s',  ms: 30_000  },
  { label: '1m',   ms: 60_000  },
  { label: '5m',   ms: 300_000 },
  { label: '10m',  ms: 600_000 },
] as const

interface RefreshState {
  intervalMs: number | null
  isRefreshing: boolean
  lastRefreshedAt: number | null
  setIntervalMs: (ms: number | null) => void
  setRefreshing: (v: boolean) => void
  recordRefresh: () => void
}

export const useRefreshStore = create<RefreshState>()(
  persist(
    (set) => ({
      intervalMs:      60_000,
      isRefreshing:    false,
      lastRefreshedAt: null,
      setIntervalMs:   (ms) => set({ intervalMs: ms }),
      setRefreshing:   (v)  => set({ isRefreshing: v }),
      recordRefresh:   ()   => set({ lastRefreshedAt: Date.now() }),
    }),
    { name: 'fn:refresh', partialize: (s) => ({ intervalMs: s.intervalMs }) },
  ),
)
