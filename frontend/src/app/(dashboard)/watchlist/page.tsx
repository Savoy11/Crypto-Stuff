'use client'

import { useState } from 'react'
import { Star, Plus, Trash2, Search } from 'lucide-react'
import { useAssetStore } from '@/store/useAssetStore'
import { RiskScoreBadge } from '@/components/assets/RiskScoreBadge'
import { formatCurrency, formatPercent, formatScore } from '@/lib/utils/format'
import { getRiskColor } from '@/lib/utils/risk'
import { MOCK_ASSETS } from '@/lib/api/mock/mockAssets'

export default function WatchlistPage() {
  const [search, setSearch] = useState('')
  const [newListName, setNewListName] = useState('')
  const [showNewList, setShowNewList] = useState(false)
  const [watchlistName, setWatchlistName] = useState('My Watchlist')
  const [watchedIds, setWatchedIds] = useState<Set<string>>(
    new Set(MOCK_ASSETS.slice(0, 5).map(a => a.id))
  )

  const watched = MOCK_ASSETS.filter(a => watchedIds.has(a.id))
  const filtered = MOCK_ASSETS.filter(
    a =>
      !watchedIds.has(a.id) &&
      (a.symbol.toLowerCase().includes(search.toLowerCase()) ||
        a.name.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Star className="h-6 w-6 text-amber-400" />
          <div>
            <h1 className="text-xl font-semibold text-slate-100">Watchlists</h1>
            <p className="text-sm text-slate-400">Monitor selected assets in one view</p>
          </div>
        </div>
        <button
          onClick={() => setShowNewList(true)}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
        >
          <Plus className="h-4 w-4" /> New List
        </button>
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
          <div className="overflow-x-auto">
          <div className="min-w-[640px] divide-y divide-slate-800/60">
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
                <span className={`font-mono font-bold tabular-nums ${getRiskColor(asset.riskBand)}`}>
                  {formatScore(asset.riskScore)}
                </span>
                <RiskScoreBadge band={asset.riskBand} score={asset.riskScore} />
                <span className="font-mono text-slate-300 tabular-nums">
                  {formatCurrency(asset.price, 4)}
                </span>
                <span className="font-mono text-slate-300 tabular-nums text-xs">
                  {formatCurrency(asset.marketCap)}
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
