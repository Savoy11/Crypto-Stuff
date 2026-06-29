import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { TierMode } from '@/lib/tier'

interface TierState {
  mode: TierMode
  // Per-category source overrides (used in 'custom' mode)
  customSources: Record<string, string>
  setMode: (mode: TierMode) => void
  setCustomSource: (category: string, source: string) => void
  resetCustom: () => void
}

export const useTierStore = create<TierState>()(
  persist(
    (set) => ({
      mode: 'free',
      customSources: {},
      setMode: (mode) => set({ mode }),
      setCustomSource: (category, source) =>
        set((state) => ({ customSources: { ...state.customSources, [category]: source } })),
      resetCustom: () => set({ customSources: {} }),
    }),
    { name: 'caep:tier' },
  ),
)
