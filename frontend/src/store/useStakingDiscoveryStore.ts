'use client'

import { create } from 'zustand'
import type { CustomStakingProvider } from '@/lib/data/stakingDiscovery'

interface StakingDiscoveryStore {
  savedProviders:  CustomStakingProvider[]
  dismissedIds:    string[]   // DefiLlama pool IDs or manual slugs
  saveProvider:    (p: CustomStakingProvider) => void
  removeProvider:  (id: string) => void
  dismiss:         (id: string) => void
  clearDismissed:  () => void
  isSaved:         (id: string) => boolean
  isDismissed:     (id: string) => boolean
}

const KEY_SAVED     = 'fn:staking-saved'
const KEY_DISMISSED = 'fn:staking-dismissed'

function load<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback } catch { return fallback }
}
function save(key: string, v: unknown) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* quota */ }
}

export const useStakingDiscoveryStore = create<StakingDiscoveryStore>((set, get) => ({
  savedProviders: load<CustomStakingProvider[]>(KEY_SAVED, []),
  dismissedIds:   load<string[]>(KEY_DISMISSED, []),

  saveProvider: (p) => {
    const next = [...get().savedProviders.filter(x => x.id !== p.id), p]
    save(KEY_SAVED, next)
    set({ savedProviders: next })
  },

  removeProvider: (id) => {
    const next = get().savedProviders.filter(x => x.id !== id)
    save(KEY_SAVED, next)
    set({ savedProviders: next })
  },

  dismiss: (id) => {
    const next = [...new Set([...get().dismissedIds, id])]
    save(KEY_DISMISSED, next)
    set({ dismissedIds: next })
  },

  clearDismissed: () => { save(KEY_DISMISSED, []); set({ dismissedIds: [] }) },

  isSaved:     (id) => get().savedProviders.some(p => p.id === id),
  isDismissed: (id) => get().dismissedIds.includes(id),
}))
