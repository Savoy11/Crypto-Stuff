import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { BiasStrength } from '@/lib/watchlist/bias'
import { migrateStorageKey } from '@/lib/utils/storageMigration'

// One-time key migration for the Finance Now rename — runs before any read below.
migrateStorageKey('caep:feed-bias', 'fn:feed-bias')


// Per-feed watchlist bias settings.
//
// Each news/video surface gets its own strength, because the right answer
// differs by surface: you may want the crypto feed heavily skewed to your coins
// while Headlines stays broad enough to catch market-wide news.

export type BiasFeedId = 'crypto-news' | 'market-news' | 'headlines' | 'videos'

export const BIAS_FEEDS: Array<{ id: BiasFeedId; label: string; description: string }> = [
  { id: 'crypto-news', label: 'Crypto News', description: 'The /news feed' },
  { id: 'market-news', label: 'Market News', description: 'The /equities/news feed' },
  { id: 'headlines', label: 'Headlines', description: 'The cross-module landing feed' },
  { id: 'videos', label: 'Videos', description: 'Channel feed and YouTube search' },
]

interface FeedBiasState {
  strengths: Partial<Record<BiasFeedId, BiasStrength>>
}

interface FeedBiasActions {
  getStrength: (feed: BiasFeedId) => BiasStrength
  setStrength: (feed: BiasFeedId, strength: BiasStrength) => void
  reset: () => void
}

/**
 * Default is 'light' everywhere: watchlist items surface first, but nothing is
 * hidden. Defaulting to 'off' would make the feature invisible; defaulting to
 * 'only' would silently hide market-wide news from anyone with a watchlist.
 */
const DEFAULT_STRENGTH: BiasStrength = 'light'

export const useFeedBiasStore = create<FeedBiasState & FeedBiasActions>()(
  persist(
    (set, get) => ({
      strengths: {},

      getStrength: (feed) => get().strengths[feed] ?? DEFAULT_STRENGTH,

      setStrength: (feed, strength) =>
        set((state) => ({ strengths: { ...state.strengths, [feed]: strength } })),

      reset: () => set({ strengths: {} }),
    }),
    {
      name: 'fn:feed-bias',
      // Same reasoning as the entitlement store: a synchronous localStorage read
      // at creation makes the first client render disagree with the server and
      // costs the whole tree to a hydration mismatch. Rehydrated from Providers.
      skipHydration: true,
    }
  )
)
