'use client'

import { useState, useEffect, useMemo } from 'react'
import { Star, Plus, Trash2, Search } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { RiskScoreBadge } from '@/components/assets/RiskScoreBadge'
import { formatCurrency, formatScore, formatOrNA } from '@/lib/utils/format'
import { getRiskColor } from '@/lib/utils/risk'
import { useAssets } from '@/hooks/useAssets'

// localStorage persistence. `null` = never saved (first visit → seed defaults);
// an empty array is a deliberate user choice and must stay empty.
const WATCHLIST_KEY = 'caep:watchlist:v1'

function loadWatchedIds(): string[] | null {
  if (typeof window === 'undefined') return null
  try {
    const stored = localStorage.getItem(WATCHLIST_KEY)
    return stored ? (JSON.parse(stored) as string[]) : null
  } catch {
    return null
  }
}

function saveWatchedIds(ids: Set<string>) {
  try { localStorage.setItem(WATCHLIST_KEY, JSON.stringify(Array.from(ids))) } catch { /* quota */ }
}

export default function WatchlistPage() {
  const [search, setSearch] = useState('')
  const [watchlistName] = useState('My Watchlist')
  const [watchedIds, setWatchedIds] = useState<Set<string>>(new Set())
  const [hydrated, setHydrated] = useState(false)

  // Live asset catalog with real market figures (risk metrics render as N/A).
  // pageSize must exceed the catalog size or assets at the end become unsearchable.
  const { data } = useAssets({ pageSize: 500 })
  const allAssets = useMemo(() => data?.data ?? [], [data])

  // Restore the saved list on mount; on the very first visit, seed with the
  // top few assets once live data arrives.
  useEffect(() => {
    const stored = loadWatchedIds()
    if (stored !== null) {
      setWatchedIds(new Set(stored))
      setHydrated(true)
    } else if (allAssets.length > 0) {
      const seedIds = new Set(allAssets.slice(0, 5).map(a => a.id))
      setWatchedIds(seedIds)
      saveWatchedIds(seedIds)
      setHydrated(true)
    }
  }, [allAssets])

  const updateWatched = (updater: (prev: Set<string>) => Set<string>) => {
    setWatchedIds(prev => {
      const next = updater(prev)
      if (hydrated) saveWatchedIds(next)
      return next
    })
  }

  const watched = allAssets.filter(a => watchedIds.has(a.id))
  const filtered = allAssets.filter(
    a =>
      !watchedIds.has(a.id) &&
      (a.symbol.toLowerCase().includes(search.toLowerCase()) ||
        a.name.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Star className="h-6 w-6 text-amber-400" />
          <div>
            <PageHeader
              title="Watchlist"
              subtitle="Monitor selected assets in one view"
              description="The watchlist pins a curated set of assets for quick monitoring without navigating the full Asset Registry. Multiple named lists are planned alongside account sync."
              details={[
                { label: 'Adding assets', text: 'Search any tracked asset below and click Add to pin it to the list.' },
                { label: 'Persistence', text: 'The list is saved in this browser (localStorage) and persists between sessions on this device. It is not synced across devices until accounts land.' },
                { label: 'Risk columns', text: 'Score and Band come from the scoring backend and show N/A in live-data mode — no free source exists for them.' },
              ]}
            />
          </div>
        </div>
      </div>

      {/* Active watchlist */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50">
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <h2 className="text-sm font-medium text-slate-300">
            {watchlistName}
            <span className="ml-2 text-xs text-slate-500">({watched.length} assets)</span>
          </h2>
        </div>

        {watched.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            No assets in this watchlist. Add assets below.
          </div>
        ) : (
          <div className="divide-y divide-slate-800/60">
            <div className="grid grid-cols-7 gap-4 px-4 py-2 text-xs font-medium text-slate-500 uppercase">
              <span className="col-span-2">Asset</span>
              <span>Score</span>
              <span>Band</span>
              <span>Price</span>
              <span>Mkt Cap</span>
              <span>Action</span>
            </div>
            {watched.map(asset => (
              <div key={asset.id} className="grid grid-cols-7 gap-4 px-4 py-3 text-sm items-center hover:bg-slate-800/20 transition-colors">
                <div className="col-span-2 flex flex-col">
                  <span className="font-medium text-slate-100">{asset.symbol}</span>
                  <span className="text-xs text-slate-500">{asset.name}</span>
                </div>
                <span className={`font-mono font-bold tabular-nums ${asset.riskBand ? getRiskColor(asset.riskBand) : 'text-slate-400'}`}>
                  {formatOrNA(asset.riskScore, formatScore)}
                </span>
                <RiskScoreBadge band={asset.riskBand} score={asset.riskScore} />
                <span className="font-mono text-slate-300 tabular-nums">
                  {formatOrNA(asset.price, (v) => formatCurrency(v, 4))}
                </span>
                <span className="font-mono text-slate-300 tabular-nums text-xs">
                  {formatOrNA(asset.marketCap, (v) => formatCurrency(v))}
                </span>
                <button
                  onClick={() => updateWatched(prev => { const s = new Set(prev); s.delete(asset.id); return s })}
                  className="text-slate-500 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add assets */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50">
        <div className="border-b border-slate-800 px-4 py-3">
          <h2 className="text-sm font-medium text-slate-300">Add Assets</h2>
          <div className="mt-2 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by symbol or name..."
              className="w-full rounded-lg border border-slate-700 bg-slate-800 pl-9 pr-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>
        <div className="divide-y divide-slate-800/60 max-h-64 overflow-y-auto">
          {filtered.slice(0, 20).map(asset => (
            <div key={asset.id} className="flex items-center justify-between px-4 py-2 text-sm hover:bg-slate-800/20">
              <div className="flex flex-col">
                <span className="font-medium text-slate-200">{asset.symbol}</span>
                <span className="text-xs text-slate-500">{asset.name}</span>
              </div>
              <button
                onClick={() => updateWatched(prev => new Set([...prev, asset.id]))}
                className="flex items-center gap-1 rounded bg-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-blue-600 hover:text-white transition-colors"
              >
                <Plus className="h-3 w-3" /> Add
              </button>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="p-4 text-center text-slate-500 text-sm">No assets match your search.</div>
          )}
        </div>
      </div>
    </div>
  )
}
