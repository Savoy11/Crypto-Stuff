'use client'

import { create } from 'zustand'
import { toast } from 'react-hot-toast'
import { INSTRUMENT_BY_KEY } from '@/lib/data/instruments'
import { COINGECKO_IDS } from '@/lib/api/live/coingeckoIds'
import type { WatchlistsResponse } from '@/app/api/user/watchlists/route'

// ─── DB-backed watchlist store ───────────────────────────────────────────────
// Watchlists persist to Postgres via /api/user/watchlists — the last Phase 1
// surface to leave localStorage. Same optimistic pattern as
// usePortfolioStore: mutations update local state at once and sync in the
// background; a failed sync toasts and re-hydrates so the UI converges back
// to the server's truth.
//
// Ids are client-generated UUIDs, accepted by the API on create — the row
// inserted optimistically IS the row the server creates.
//
// localStorage remains in two roles only:
//  - 'fnf:watchlists:v2' (and the older v1 single-list key) are LEGACY,
//    imported once then renamed. Finance Now Free ships with no pre-DB
//    local data, so this import is inert on a fresh install — it is kept so
//    the paths stay identical to the paid edition.
//  - the active-list id stays local — it's a UI preference, not data.

export interface WatchList {
  id: string
  name: string
  keys: string[] // instrument keys (cgId or sec:SYMBOL)
}

interface WatchlistStore {
  lists:      WatchList[]
  activeId:   string | null
  /** True once the first server answer (or failure) has arrived. */
  hydrated:   boolean
  /** Set when the server can't be reached — page shows an honest banner. */
  syncError:  string | null
  createList: (name: string) => string
  deleteList: (id: string) => void
  addKey:     (listId: string, key: string) => void
  removeKey:  (listId: string, key: string) => void
  setActive:  (id: string | null) => void
}

const LEGACY_V2_KEY = 'fnf:watchlists:v2'
const LEGACY_V1_KEY = 'fnf:watchlist:v1'
const KEY_ACTIVE = 'fnf:watchlist-active'

function loadActive(): string | null {
  if (typeof window === 'undefined') return null
  try { const r = localStorage.getItem(KEY_ACTIVE); return r ? JSON.parse(r) : null } catch { return null }
}
function saveActive(v: string | null) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(KEY_ACTIVE, JSON.stringify(v)) } catch { /* quota */ }
}

async function api(path: string, init?: RequestInit): Promise<WatchlistsResponse> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.ok) throw new Error(json.error ?? `Request failed (${res.status})`)
  return json
}

function putList(list: WatchList) {
  api(`/api/user/watchlists/${list.id}`, { method: 'PUT', body: JSON.stringify(list) })
    .catch((e: Error) => {
      toast.error(`Watchlist not saved: ${e.message}`)
      void hydrateWatchlists(true)
    })
}

export const useWatchlistStore = create<WatchlistStore>((set, get) => ({
  lists:     [],
  activeId:  loadActive(),
  hydrated:  false,
  syncError: null,

  createList: (name) => {
    const id = crypto.randomUUID()
    const list: WatchList = { id, name, keys: [] }
    set({ lists: [...get().lists, list], activeId: id })
    saveActive(id)
    api('/api/user/watchlists', { method: 'POST', body: JSON.stringify(list) })
      .catch((e: Error) => {
        toast.error(`Watchlist not saved: ${e.message}`)
        set({ lists: get().lists.filter((l) => l.id !== id) })
      })
    return id
  },

  deleteList: (id) => {
    const next = get().lists.filter((l) => l.id !== id)
    const activeId = get().activeId === id ? (next[0]?.id ?? null) : get().activeId
    set({ lists: next, activeId })
    saveActive(activeId)
    api(`/api/user/watchlists/${id}`, { method: 'DELETE' })
      .catch((e: Error) => {
        toast.error(`Delete not saved: ${e.message}`)
        void hydrateWatchlists(true)
      })
  },

  addKey: (listId, key) => {
    const lists = get().lists.map((l) =>
      l.id === listId && !l.keys.includes(key) ? { ...l, keys: [...l.keys, key] } : l)
    set({ lists })
    const list = lists.find((l) => l.id === listId)
    if (list) putList(list)
  },

  removeKey: (listId, key) => {
    const lists = get().lists.map((l) =>
      l.id === listId ? { ...l, keys: l.keys.filter((k) => k !== key) } : l)
    set({ lists })
    const list = lists.find((l) => l.id === listId)
    if (list) putList(list)
  },

  setActive: (id) => {
    saveActive(id)
    set({ activeId: id })
  },
}))

// ─── Hydration + one-time legacy import ──────────────────────────────────────

let hydrating: Promise<void> | null = null

/**
 * Read whatever this browser saved before persistence landed: the v2
 * multi-list blob, or failing that the v1 single crypto list (registry asset
 * ids → CoinGecko keys — the same migration the page used to run inline).
 */
function readLegacy(): Array<{ name: string; keys: string[] }> {
  try {
    const v2 = JSON.parse(localStorage.getItem(LEGACY_V2_KEY) ?? 'null') as
      { lists?: Array<{ name?: string; keys?: string[] }> } | null
    if (v2?.lists?.length) {
      return v2.lists.map((l) => ({
        name: typeof l.name === 'string' && l.name ? l.name : 'My Watchlist',
        keys: (l.keys ?? []).filter((k): k is string => typeof k === 'string'),
      }))
    }
  } catch { /* fall through */ }
  try {
    const v1 = JSON.parse(localStorage.getItem(LEGACY_V1_KEY) ?? 'null')
    if (Array.isArray(v1) && v1.length > 0) {
      const keys = (v1 as string[])
        .map((id) => COINGECKO_IDS[id])
        .filter((k): k is string => !!k && !!INSTRUMENT_BY_KEY[k])
      return [{ name: 'My Watchlist', keys }]
    }
  } catch { /* ignore */ }
  return []
}

function retireLegacyKeys() {
  for (const key of [LEGACY_V2_KEY, LEGACY_V1_KEY]) {
    const val = localStorage.getItem(key)
    if (val != null) {
      localStorage.setItem(`${key}:imported`, val)
      localStorage.removeItem(key)
    }
  }
}

/** First-ever visit with nothing to import gets the same starter list the page always seeded. */
const STARTER: { name: string; keys: string[] } = {
  name: 'My Watchlist',
  keys: ['bitcoin', 'ethereum', 'sec:VOO', 'sec:AAPL'],
}

/**
 * Load watchlists from the server. Call from any consumer's mount effect —
 * concurrent calls share one request; force=true re-fetches (used to
 * converge after a failed mutation).
 *
 * On first hydration, lists saved to this browser before persistence landed
 * are imported once (server assigns fresh UUIDs — legacy ids weren't UUIDs),
 * then the keys are renamed so the import can never repeat. The import runs
 * even when the account already has lists — each browser's legacy lists are
 * merged in additively, since another device (or the seeded starter) having
 * written first must not silently discard this browser's saved lists. A truly
 * empty account with nothing to import gets the starter list. Neither happens
 * when the server is unreachable — seeding on error would fork the data.
 */
export function hydrateWatchlists(force = false): Promise<void> {
  const store = useWatchlistStore
  if (hydrating) return hydrating
  if (store.getState().hydrated && !force) return Promise.resolve()

  hydrating = (async () => {
    try {
      let { watchlists } = await api('/api/user/watchlists')
      const legacy = readLegacy()
      if (legacy.length > 0) {
        ;({ watchlists } = await api('/api/user/watchlists', {
          method: 'POST',
          body: JSON.stringify({ watchlists: legacy }),
        }))
        retireLegacyKeys()
        toast.success(`Imported ${legacy.length} watchlist${legacy.length > 1 ? 's' : ''} saved in this browser`)
      } else if ((watchlists?.length ?? 0) === 0) {
        ;({ watchlists } = await api('/api/user/watchlists', {
          method: 'POST',
          body: JSON.stringify({ watchlists: [STARTER] }),
        }))
      }
      const lists = watchlists ?? []
      const activeId = lists.some((l) => l.id === store.getState().activeId)
        ? store.getState().activeId
        : (lists[0]?.id ?? null)
      store.setState({ lists, activeId, hydrated: true, syncError: null })
    } catch (e) {
      store.setState({ hydrated: true, syncError: e instanceof Error ? e.message : 'Watchlists unavailable' })
    } finally {
      hydrating = null
    }
  })()
  return hydrating
}
