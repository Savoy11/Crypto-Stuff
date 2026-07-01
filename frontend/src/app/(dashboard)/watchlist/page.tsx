'use client'

import { useState, useEffect, useMemo } from 'react'
import { Star, Plus, Trash2, Search, Lock } from 'lucide-react'
import { clsx } from 'clsx'
import { PageHeader } from '@/components/ui/PageHeader'
import { RiskScoreBadge } from '@/components/assets/RiskScoreBadge'
import { formatCurrency, formatScore, formatOrNA } from '@/lib/utils/format'
import { getRiskColor } from '@/lib/utils/risk'
import { useAssets } from '@/hooks/useAssets'
import { useTierStore } from '@/store/useTierStore'
import { TIER_LABELS, TIER_COLORS } from '@/lib/tier'

export default function WatchlistPage() {
  const [search, setSearch] = useState('')
  const [showNewList, setShowNewList] = useState(false)
  const [watchlistName] = useState('My Watchlist')
  const [watchedIds, setWatchedIds] = useState<Set<string>>(new Set())
  const [seeded, setSeeded] = useState(false)

  // Live asset catalog with real market figures (risk metrics render as N/A).
  const { data } = useAssets({ pageSize: 100 })
  const allAssets = useMemo(() => data?.data ?? [], [data])

  // Risk columns are a premium feature — unlocked on the Paid (or Custom) tier.
  // The actual paid risk-data source is wired in the Risk Scores work (item 1);
  // here we only gate the UI on tier state.
  const mode = useTierStore((s) => s.mode)
  const setMode = useTierStore((s) => s.setMode)
  const unlocked = mode !== 'free'

  // Seed the watchlist with the first few assets once live data arrives.
  useEffect(() => {
    if (!seeded && allAssets.length > 0) {
      setWatchedIds(new Set(allAssets.slice(0, 5).map(a => a.id)))
      setSeeded(true)
    }
  }, [allAssets, seeded])

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
              title="Watchlists"
              subtitle="Monitor selected assets in one view"
              description="Watchlists let you pin a curated set of assets for quick monitoring without navigating the full Asset Registry. Create multiple lists for different strategies — e.g. 'High Risk' or 'Stable Reserves'."
              details={[
                { label: 'Adding assets', text: 'Search for any tracked asset and click the star icon to add it to your active list.' },
                { label: 'Persistence', text: 'Watchlists are stored in your browser. They persist between sessions but are not synced across devices.' },
              ]}
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={clsx('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium border', TIER_COLORS[mode])}>
            {TIER_LABELS[mode]}
          </span>
          <button
            onClick={() => setShowNewList(true)}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
          >
            <Plus className="h-4 w-4" /> New List
          </button>
        </div>
      </div>

      {/* Paid-tier upgrade prompt for risk data */}
      {!unlocked && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <Lock className="h-5 w-5 text-amber-400 flex-shrink-0" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-medium text-amber-200">Risk scores are a Paid-tier feature</p>
              <p className="text-xs text-slate-400">
                Switch to the Paid tier to route risk data in from premium providers (CoinGecko Pro, Messari, etc.).
                Configure keys in Settings → Integrations.
              </p>
            </div>
          </div>
          <button
            onClick={() => setMode('paid')}
            className="flex-shrink-0 rounded-lg bg-amber-500/90 px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-amber-400 transition-colors"
          >
            Switch to Paid
          </button>
        </div>
      )}

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
                {unlocked ? (
                  <span className={clsx('font-mono font-bold tabular-nums', asset.riskBand ? getRiskColor(asset.riskBand) : 'text-slate-400')}>
                    {formatOrNA(asset.riskScore, formatScore)}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 font-mono text-xs text-slate-600">
                    <Lock size={11} aria-hidden /> Paid
                  </span>
                )}
                {unlocked ? (
                  <RiskScoreBadge band={asset.riskBand} score={asset.riskScore} />
                ) : (
                  <span className="text-xs text-slate-600">—</span>
                )}
                <span className="font-mono text-slate-300 tabular-nums">
                  {formatOrNA(asset.price, (v) => formatCurrency(v, 4))}
                </span>
                <span className="font-mono text-slate-300 tabular-nums text-xs">
                  {formatOrNA(asset.marketCap, (v) => formatCurrency(v))}
                </span>
                <button
                  onClick={() => setWatchedIds(prev => { const s = new Set(prev); s.delete(asset.id); return s })}
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
                onClick={() => setWatchedIds(prev => new Set([...prev, asset.id]))}
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
