import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { migrateStorageKey } from '@/lib/utils/storageMigration'

// One-time key migration for the Finance Now rename — runs before any read below.
migrateStorageKey('caep-chart-theses', 'fn-chart-theses')


// A saved trading/investment thesis attached to a coin + timeframe. Stored locally
// (localStorage) — no backend. The "snapshot" is the lightweight context at save
// time (price, range, signal), not an image, so it stays small and serialisable.
export interface ChartThesis {
  id: string
  assetId: string
  symbol: string
  range: string
  priceAtSave: number | null
  signalAtSave: string | null
  entryThesis: string
  invalidation: string
  target: string
  notes: string
  createdAt: string
}

interface ThesisState {
  theses: ChartThesis[]
  addThesis: (t: Omit<ChartThesis, 'id' | 'createdAt'>) => void
  removeThesis: (id: string) => void
}

export const useThesisStore = create<ThesisState>()(
  persist(
    (set) => ({
      theses: [],
      addThesis: (t) =>
        set((s) => ({
          theses: [
            { ...t, id: `thesis_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, createdAt: new Date().toISOString() },
            ...s.theses,
          ],
        })),
      removeThesis: (id) => set((s) => ({ theses: s.theses.filter((t) => t.id !== id) })),
    }),
    { name: 'fn-chart-theses' },
  ),
)

export { computeRiskReward } from '@/lib/utils/riskReward'
