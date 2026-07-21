'use client'

import { create } from 'zustand'
import { toast } from 'react-hot-toast'
import type { Portfolio } from '@/lib/data/portfolioUtils'
import type { PortfoliosResponse } from '@/app/api/user/portfolios/route'

// ─── DB-backed portfolio store ───────────────────────────────────────────────
// Portfolios persist to Postgres via /api/user/portfolios. The store keeps
// the same synchronous interface consumers always had (create/update/delete
// return immediately) by being optimistic: mutations update local state at
// once and sync in the background; a failed sync toasts and re-hydrates so
// the UI converges back to the server's truth.
//
// Ids are client-generated UUIDs, accepted by the API on create — the row
// inserted optimistically IS the row the server creates, which also makes
// portfolio ids valid FK targets (builder_plans.linked_portfolio_id).
//
// localStorage remains in two roles only:
//  - 'caep:portfolios' is the LEGACY key, imported once then renamed.
//  - the active-portfolio id stays local — it's a UI preference, not data.

interface PortfolioStore {
  portfolios:      Portfolio[]
  activeId:        string | null
  /** True once the first server answer (or failure) has arrived. */
  hydrated:        boolean
  /** Set when the server can't be reached — page shows an honest banner. */
  syncError:       string | null
  createPortfolio: (p: Omit<Portfolio, 'id' | 'createdAt' | 'updatedAt'>) => string
  updatePortfolio: (id: string, updates: Partial<Omit<Portfolio, 'id' | 'createdAt'>>) => void
  deletePortfolio: (id: string) => void
  setActive:       (id: string | null) => void
  active:          () => Portfolio | null
}

const LEGACY_KEY = 'caep:portfolios'
const KEY_ACTIVE = 'caep:portfolio-active'

function loadActive(): string | null {
  if (typeof window === 'undefined') return null
  try { const r = localStorage.getItem(KEY_ACTIVE); return r ? JSON.parse(r) : null } catch { return null }
}
function saveActive(v: string | null) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(KEY_ACTIVE, JSON.stringify(v)) } catch { /* quota */ }
}

async function api(path: string, init?: RequestInit): Promise<PortfoliosResponse> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.ok) throw new Error(json.error ?? `Request failed (${res.status})`)
  return json
}

export const usePortfolioStore = create<PortfolioStore>((set, get) => ({
  portfolios: [],
  activeId:   loadActive(),
  hydrated:   false,
  syncError:  null,

  createPortfolio: (data) => {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const p: Portfolio = { ...data, id, createdAt: now, updatedAt: now }
    set({ portfolios: [p, ...get().portfolios], activeId: id })
    saveActive(id)
    api('/api/user/portfolios', { method: 'POST', body: JSON.stringify(p) })
      .catch((e: Error) => {
        toast.error(`Portfolio not saved: ${e.message}`)
        set({ portfolios: get().portfolios.filter((x) => x.id !== id) })
      })
    return id
  },

  updatePortfolio: (id, updates) => {
    const merged = get().portfolios.map((p) =>
      p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p)
    set({ portfolios: merged })
    const full = merged.find((p) => p.id === id)
    if (!full) return
    api(`/api/user/portfolios/${id}`, { method: 'PUT', body: JSON.stringify(full) })
      .catch((e: Error) => {
        toast.error(`Changes not saved: ${e.message}`)
        void hydratePortfolios(true)
      })
  },

  deletePortfolio: (id) => {
    const next = get().portfolios.filter((p) => p.id !== id)
    const activeId = get().activeId === id ? (next[0]?.id ?? null) : get().activeId
    set({ portfolios: next, activeId })
    saveActive(activeId)
    api(`/api/user/portfolios/${id}`, { method: 'DELETE' })
      .catch((e: Error) => {
        toast.error(`Delete not saved: ${e.message}`)
        void hydratePortfolios(true)
      })
  },

  setActive: (id) => {
    saveActive(id)
    set({ activeId: id })
  },

  active: () => {
    const { portfolios, activeId } = get()
    return portfolios.find((p) => p.id === activeId) ?? null
  },
}))

// ─── Hydration + one-time legacy import ──────────────────────────────────────

let hydrating: Promise<void> | null = null

function readLegacy(): Portfolio[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

/**
 * Load portfolios from the server. Call from any consumer's mount effect —
 * concurrent calls share one request; force=true re-fetches (used to
 * converge after a failed mutation).
 *
 * On first hydration, portfolios saved to this browser before persistence
 * landed are imported once (server assigns fresh UUIDs — legacy ids weren't
 * UUIDs — while original timestamps are preserved), then the key is renamed
 * so the import can never repeat.
 */
export function hydratePortfolios(force = false): Promise<void> {
  const store = usePortfolioStore
  if (hydrating) return hydrating
  if (store.getState().hydrated && !force) return Promise.resolve()

  hydrating = (async () => {
    try {
      let { portfolios } = await api('/api/user/portfolios')
      const legacy = readLegacy()
      if (legacy.length > 0 && (portfolios?.length ?? 0) === 0) {
        await api('/api/user/portfolios', {
          method: 'POST',
          body: JSON.stringify({
            portfolios: legacy.map((p) => ({
              name: p.name, description: p.description, startingCapital: p.startingCapital,
              holdings: p.holdings, createdAt: p.createdAt, updatedAt: p.updatedAt,
            })),
          }),
        })
        localStorage.setItem(`${LEGACY_KEY}:imported`, localStorage.getItem(LEGACY_KEY) ?? '[]')
        localStorage.removeItem(LEGACY_KEY)
        toast.success(`Imported ${legacy.length} portfolio${legacy.length > 1 ? 's' : ''} saved in this browser`)
        ;({ portfolios } = await api('/api/user/portfolios'))
      }
      store.setState({ portfolios: portfolios ?? [], hydrated: true, syncError: null })
    } catch (e) {
      store.setState({ hydrated: true, syncError: e instanceof Error ? e.message : 'Portfolios unavailable' })
    } finally {
      hydrating = null
    }
  })()
  return hydrating
}
