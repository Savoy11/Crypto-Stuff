'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Plus, Search, Star, Trash2, X } from 'lucide-react'
import Link from 'next/link'
import { PageHeader } from '@/components/ui/PageHeader'
import { INSTRUMENTS, INSTRUMENT_BY_KEY, CLASS_LABELS, isSecurityKey, securitySymbol } from '@/lib/data/instruments'
import { COINGECKO_IDS, ASSET_ID_BY_COINGECKO } from '@/lib/api/live/coingeckoIds'
import { fetchInstrumentPrices } from '@/lib/api/instrumentPrices'
import { formatCurrency } from '@/lib/utils/format'
import { STALE_TIME_SHORT } from '@/lib/constants'

// Multi-list, cross-module watchlists: any coin, stock, ETF, or mutual fund
// in any number of named lists, with live prices. Stored in localStorage
// (per-device) until account sync lands.

interface WatchList {
  id: string
  name: string
  keys: string[] // instrument keys (cgId or sec:SYMBOL)
}

const STORE_KEY = 'caep:watchlists:v2'
const LEGACY_KEY = 'caep:watchlist:v1'

function load(): { lists: WatchList[]; activeId: string | null } {
  if (typeof window === 'undefined') return { lists: [], activeId: null }
  try {
    const stored = localStorage.getItem(STORE_KEY)
    if (stored) return JSON.parse(stored)
  } catch { /* fall through */ }
  // Migrate the v1 single crypto list (registry asset ids → CoinGecko keys)
  try {
    const legacy = localStorage.getItem(LEGACY_KEY)
    if (legacy) {
      const ids: string[] = JSON.parse(legacy)
      const keys = ids.map((id) => COINGECKO_IDS[id]).filter((k): k is string => !!k && !!INSTRUMENT_BY_KEY[k])
      const list: WatchList = { id: 'migrated', name: 'My Watchlist', keys }
      return { lists: [list], activeId: list.id }
    }
  } catch { /* ignore */ }
  return { lists: [], activeId: null }
}

function save(state: { lists: WatchList[]; activeId: string | null }) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)) } catch { /* quota */ }
}

function detailHref(key: string): string {
  if (isSecurityKey(key)) {
    const inst = INSTRUMENT_BY_KEY[key]
    const sym = securitySymbol(key).toLowerCase()
    return inst?.class === 'equity' ? `/equities/${sym}` : `/funds/${sym}`
  }
  const assetId = ASSET_ID_BY_COINGECKO[key]
  return assetId ? `/assets/${assetId}` : '/assets'
}

export default function WatchlistPage() {
  const [lists, setLists] = useState<WatchList[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [search, setSearch] = useState('')
  const [newListName, setNewListName] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    const state = load()
    if (state.lists.length === 0) {
      const starter: WatchList = { id: 'default', name: 'My Watchlist', keys: ['bitcoin', 'ethereum', 'sec:VOO', 'sec:AAPL'] }
      state.lists = [starter]; state.activeId = starter.id
      save(state)
    }
    setLists(state.lists)
    setActiveId(state.activeId ?? state.lists[0]?.id ?? null)
    setHydrated(true)
  }, [])

  const update = (nextLists: WatchList[], nextActive = activeId) => {
    setLists(nextLists)
    if (hydrated) save({ lists: nextLists, activeId: nextActive })
  }

  const active = lists.find((l) => l.id === activeId) ?? lists[0] ?? null
  const keys = useMemo(() => active?.keys ?? [], [active])

  const { data: priceData } = useQuery({
    queryKey: ['watchlist-prices', keys],
    queryFn: () => fetchInstrumentPrices(keys),
    enabled: keys.length > 0,
    staleTime: STALE_TIME_SHORT,
    refetchInterval: 60_000,
  })

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return []
    return INSTRUMENTS
      .filter((i) => !keys.includes(i.key) && (i.symbol.toLowerCase().includes(q) || i.name.toLowerCase().includes(q)))
      .slice(0, 10)
  }, [search, keys])

  const addKey = (key: string) => {
    if (!active) return
    update(lists.map((l) => l.id === active.id ? { ...l, keys: [...l.keys, key] } : l))
    setSearch('')
  }
  const removeKey = (key: string) => {
    if (!active) return
    update(lists.map((l) => l.id === active.id ? { ...l, keys: l.keys.filter((k) => k !== key) } : l))
  }
  const createList = () => {
    const name = newListName.trim()
    if (!name) return
    const list: WatchList = { id: Math.random().toString(36).slice(2, 10), name, keys: [] }
    const next = [...lists, list]
    setActiveId(list.id)
    update(next, list.id)
    setNewListName(''); setCreating(false)
  }
  const deleteList = (id: string) => {
    const next = lists.filter((l) => l.id !== id)
    const nextActive = next[0]?.id ?? null
    setActiveId(nextActive)
    update(next, nextActive)
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <Star className="h-6 w-6 text-amber-400" aria-hidden />
        <PageHeader
          title="Watchlists"
          subtitle="Any coin, stock, ETF, or fund — in as many named lists as you need"
          description="Watchlists are cross-module: mix crypto, stocks, ETFs, and mutual funds in one list with live prices. Create separate lists per strategy — e.g. 'Dividend picks' or 'High risk'."
          details={[
            { label: 'Persistence', text: 'Lists are saved in this browser (localStorage) and persist between sessions on this device. Account sync arrives with the database backend.' },
            { label: 'Prices', text: 'Live via CoinGecko (crypto) and the FMP→Yahoo ladder (securities); unavailable prices show — rather than stale values.' },
          ]}
        />
      </div>

      {/* List tabs */}
      <div className="flex flex-wrap items-center gap-1.5">
        {lists.map((l) => (
          <button
            key={l.id}
            onClick={() => { setActiveId(l.id); save({ lists, activeId: l.id }) }}
            className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors',
              l.id === active?.id
                ? 'bg-accent-blue/15 text-accent-blue border-accent-blue/30'
                : 'text-text-muted border-border hover:text-text-secondary hover:bg-bg-elevated')}
          >
            {l.name}
            <span className="text-[10px] font-mono opacity-70">{l.keys.length}</span>
          </button>
        ))}
        {creating ? (
          <form className="flex items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); createList() }}>
            <input
              autoFocus
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              placeholder="List name…"
              className="w-40 rounded-lg border border-border bg-bg-elevated px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-blue/50 focus:outline-none"
            />
            <button type="submit" className="px-2.5 py-1.5 rounded-lg bg-accent-blue text-xs font-medium text-white hover:bg-blue-500">Add</button>
            <button type="button" onClick={() => setCreating(false)} className="p-1.5 text-text-muted hover:text-text-secondary"><X size={14} aria-hidden /></button>
          </form>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-text-muted border border-dashed border-border hover:text-text-secondary hover:bg-bg-elevated transition-colors"
          >
            <Plus size={14} aria-hidden /> New list
          </button>
        )}
        {active && lists.length > 1 && (
          <button
            onClick={() => deleteList(active.id)}
            className="ml-auto flex items-center gap-1 text-xs text-text-muted hover:text-red-400 transition-colors"
          >
            <Trash2 size={12} aria-hidden /> Delete “{active.name}”
          </button>
        )}
      </div>

      {/* Active list */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50">
        <div className="border-b border-slate-800 px-4 py-3">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" aria-hidden />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Add coin, stock, ETF, or fund…"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 pl-9 pr-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
            />
            {matches.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 rounded-lg border border-border bg-bg-card shadow-xl shadow-black/40 z-20 overflow-hidden">
                {matches.map((i) => (
                  <button
                    key={i.key}
                    onClick={() => addKey(i.key)}
                    className="w-full flex items-center justify-between px-3 py-2 text-left text-sm text-text-secondary hover:bg-bg-elevated hover:text-text-primary transition-colors"
                  >
                    <span className="truncate"><span className="font-mono font-medium">{i.symbol}</span> — {i.name}</span>
                    <span className="text-[10px] text-text-muted flex-shrink-0 ml-2">{CLASS_LABELS[i.class]}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {keys.length === 0 ? (
          <p className="p-8 text-center text-slate-500 text-sm">This list is empty — search above to add instruments.</p>
        ) : (
          <div className="divide-y divide-slate-800/60">
            <div className="grid grid-cols-8 gap-4 px-4 py-2 text-xs font-medium text-slate-500 uppercase">
              <span className="col-span-3">Instrument</span>
              <span>Class</span>
              <span className="col-span-2 text-right">Price</span>
              <span className="col-span-2 text-right">Action</span>
            </div>
            {keys.map((key) => {
              const inst = INSTRUMENT_BY_KEY[key]
              const price = priceData?.prices?.[key]
              return (
                <div key={key} className="grid grid-cols-8 gap-4 px-4 py-3 text-sm items-center hover:bg-slate-800/20 transition-colors">
                  <Link href={detailHref(key)} className="col-span-3 flex flex-col group">
                    <span className="font-medium text-slate-100 group-hover:text-accent-blue transition-colors">{inst?.symbol ?? key}</span>
                    <span className="text-xs text-slate-500">{inst?.name ?? 'Unknown instrument'}</span>
                  </Link>
                  <span className="text-xs text-slate-400">{inst ? CLASS_LABELS[inst.class] : '—'}</span>
                  <span className="col-span-2 text-right font-mono text-slate-300 tabular-nums">
                    {price != null ? formatCurrency(price, price < 1 ? 4 : 2) : <span className="text-slate-600">—</span>}
                  </span>
                  <div className="col-span-2 flex justify-end">
                    <button onClick={() => removeKey(key)} className="text-slate-500 hover:text-red-400 transition-colors" aria-label={`Remove ${inst?.symbol ?? key}`}>
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {priceData && priceData.source !== 'live' && keys.length > 0 && (
        <p className="text-[11px] text-text-muted text-center">
          Some prices are unavailable right now (source: {priceData.source}) — they show “—” rather than stale values.
        </p>
      )}
    </div>
  )
}
