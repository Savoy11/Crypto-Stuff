import { create } from 'zustand'
import { persist } from 'zustand/middleware'

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
    { name: 'fnf-chart-theses' },
  ),
)

/**
 * Risk/reward derived from the entry/target/invalidation text when all three parse
 * as numbers. Returns null when they don't — we never fabricate a ratio.
 */
export function computeRiskReward(entry: string, target: string, invalidation: string): number | null {
  const e = parseFloat(entry.replace(/[^0-9.]/g, ''))
  const t = parseFloat(target.replace(/[^0-9.]/g, ''))
  const i = parseFloat(invalidation.replace(/[^0-9.]/g, ''))
  if (!isFinite(e) || !isFinite(t) || !isFinite(i)) return null
  const reward = Math.abs(t - e)
  const risk = Math.abs(e - i)
  if (risk === 0) return null
  return reward / risk
}
