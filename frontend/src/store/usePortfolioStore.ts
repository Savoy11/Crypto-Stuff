'use client'

import { create } from 'zustand'
import type { Portfolio, PortfolioHolding } from '@/lib/data/portfolioUtils'

interface PortfolioStore {
  portfolios:      Portfolio[]
  activeId:        string | null
  createPortfolio: (p: Omit<Portfolio, 'id' | 'createdAt' | 'updatedAt'>) => string
  updatePortfolio: (id: string, updates: Partial<Omit<Portfolio, 'id' | 'createdAt'>>) => void
  deletePortfolio: (id: string) => void
  setActive:       (id: string | null) => void
  active:          () => Portfolio | null
}

const KEY = 'caep:portfolios'
const KEY_ACTIVE = 'caep:portfolio-active'

function load<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback } catch { return fallback }
}
function save(key: string, v: unknown) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* quota */ }
}
function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36) }

export const usePortfolioStore = create<PortfolioStore>((set, get) => ({
  portfolios: load<Portfolio[]>(KEY, []),
  activeId:   load<string | null>(KEY_ACTIVE, null),

  createPortfolio: (data) => {
    const id  = uid()
    const now = new Date().toISOString()
    const p: Portfolio = { ...data, id, createdAt: now, updatedAt: now }
    const next = [...get().portfolios, p]
    save(KEY, next)
    save(KEY_ACTIVE, id)
    set({ portfolios: next, activeId: id })
    return id
  },

  updatePortfolio: (id, updates) => {
    const next = get().portfolios.map(p =>
      p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p
    )
    save(KEY, next)
    set({ portfolios: next })
  },

  deletePortfolio: (id) => {
    const next = get().portfolios.filter(p => p.id !== id)
    save(KEY, next)
    const activeId = get().activeId === id ? (next[0]?.id ?? null) : get().activeId
    save(KEY_ACTIVE, activeId)
    set({ portfolios: next, activeId })
  },

  setActive: (id) => {
    save(KEY_ACTIVE, id)
    set({ activeId: id })
  },

  active: () => {
    const { portfolios, activeId } = get()
    return portfolios.find(p => p.id === activeId) ?? null
  },
}))
