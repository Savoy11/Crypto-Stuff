'use client'

import { ModuleGate } from '@/components/layout/ModuleGate'

/* eslint-disable @next/next/no-img-element --
   Coin icons are remote CoinGecko CDN avatars rendered at 28–36px with an onError
   fallback that hides broken images. next/image would require per-domain
   remotePatterns config and doesn't cleanly support the inline onError fallback,
   for no real benefit at this size. Plain <img> is intentional here. */

import { useState, useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, Plus, Star, X, ChevronDown, ChevronUp, Coins, Trash2, TrendingUp, AlertTriangle, Eye, ExternalLink, Database, LayoutGrid, Rows3 } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { SourceLine } from '@/components/ui/SourceLine'
import { DerivedNote } from '@/components/ui/DerivedNote'
import { useCoinDiscoveryStore, type AddedCoin } from '@/store/useCoinDiscoveryStore'
import { CATEGORY_INFO } from '@/lib/data/coinCatalog'
import type { CandidateCoin, CoinDiscoveryResponse } from '@/app/live-data/coin-discovery/route'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 2) { return n.toFixed(decimals) }
function fmtMcap(n: number) {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6)  return `$${(n / 1e6).toFixed(1)}M`
  return `$${n.toLocaleString()}`
}

// W3-1 (2026-08-20): the composite score is GONE. Item 5b renamed the verdicts
// to score bands; the owner's next review cut the score itself — "remove any
// reference to a score because it may imply a recommendation. Replace with
// price, growth, or liquidity." This page now shows only what the feed
// reports, sortable by the reader's own criterion.

/** 24h-volume/market-cap liquidity, rendered as the fact it is. */
function LiquidityBadge({ ratio }: { ratio: number }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-bg-elevated px-2 py-0.5 text-xs text-text-secondary" title="24h volume ÷ market cap">
      liq {(ratio * 100).toFixed(1)}%
    </span>
  )
}

function CandidateCard({ coin, compact = false }: { coin: CandidateCoin; compact?: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const [notes, setNotes] = useState('')
  const { addCoin, dismissCandidate, isAdded, isDismissed } = useCoinDiscoveryStore()
  const added     = isAdded(coin.cgId)
  const dismissed = isDismissed(coin.cgId)

  if (dismissed) return null

  const change = coin.priceChange24h
  const changeColor = change >= 0 ? 'text-emerald-400' : 'text-red-400'

  function handleAdd() {
    addCoin({
      cgId: coin.cgId, symbol: coin.symbol, name: coin.name, image: coin.image,
      category: coin.category, price: coin.price, marketCap: coin.marketCap,
      marketCapRank: coin.marketCapRank, addedAt: new Date().toISOString(),
      addedBy: 'candidate', notes,
    })
  }

  // ── Compact row ──────────────────────────────────────────────────────────
  if (compact) {
    return (
      <div className="bg-bg-card border border-border rounded-lg flex items-center gap-3 px-3 py-2">
        <img src={coin.image} alt={coin.name} className="w-7 h-7 rounded-full flex-shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
        <a
          href={`https://www.coingecko.com/en/coins/${coin.cgId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-sm text-text-primary hover:text-accent-blue transition-colors truncate min-w-0 max-w-[160px]"
        >
          {coin.name}
        </a>
        <span className="text-xs text-text-muted flex-shrink-0">{coin.symbol}</span>
        {coin.marketCapRank && <span className="text-xs text-text-muted flex-shrink-0 hidden sm:inline">#{coin.marketCapRank}</span>}
        <span className="text-xs text-text-muted flex-shrink-0 hidden md:inline">{fmtMcap(coin.marketCap)}</span>
        <span className={`text-xs flex-shrink-0 hidden lg:inline ${changeColor}`}>{change >= 0 ? '+' : ''}{fmt(change)}%</span>
        <div className="flex-shrink-0 ml-auto"><LiquidityBadge ratio={coin.liquidityRatio} /></div>
        {added ? (
          <span className="text-xs text-emerald-400 flex items-center gap-1 flex-shrink-0"><Star className="w-3 h-3" /></span>
        ) : (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={handleAdd}
              className="px-2 py-1 bg-accent-blue hover:bg-blue-600 text-white text-xs rounded font-medium flex items-center gap-1 transition-colors"
              title="Add to list"
            >
              <Plus className="w-3 h-3" />
            </button>
            <button
              onClick={() => dismissCandidate(coin.cgId)}
              className="p-1 text-text-muted hover:text-text-secondary rounded transition-colors"
              title="Dismiss"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    )
  }

  // ── Full card ────────────────────────────────────────────────────────────
  return (
    <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
      {/* Header row */}
      <div className="p-4 flex items-start gap-3">
        <img src={coin.image} alt={coin.name} className="w-9 h-9 rounded-full flex-shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={`https://www.coingecko.com/en/coins/${coin.cgId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-text-primary hover:text-accent-blue transition-colors flex items-center gap-1 group"
            >
              {coin.name}
              <ExternalLink size={11} className="text-text-muted group-hover:text-accent-blue shrink-0" />
            </a>
            <span className="text-xs text-text-muted">{coin.symbol}</span>
            {coin.marketCapRank && <span className="text-xs text-text-muted">#{coin.marketCapRank}</span>}
          </div>
          <div className="flex items-center gap-3 mt-1 text-sm">
            <span className="text-text-secondary">${coin.price < 0.01 ? coin.price.toFixed(6) : coin.price < 1 ? coin.price.toFixed(4) : coin.price.toLocaleString()}</span>
            <span className={changeColor}>{change >= 0 ? '+' : ''}{fmt(change)}%</span>
            <span className="text-text-muted">{fmtMcap(coin.marketCap)}</span>
            <span className="px-1.5 py-0.5 rounded text-xs" style={{ backgroundColor: coin.categoryColor + '22', color: coin.categoryColor }}>
              {coin.categoryLabel}
            </span>
          </div>
        </div>
      </div>

      {/* The facts (W3-1) — what the feed reports, nothing derived. */}
      <div className="px-4 pb-3 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-xs">
        <div>
          <div className="text-text-muted mb-0.5">7d change</div>
          <div className={coin.priceChange7d == null ? 'text-text-muted' : coin.priceChange7d >= 0 ? 'text-emerald-400' : 'text-red-400'}>
            {coin.priceChange7d == null ? '—' : `${coin.priceChange7d >= 0 ? '+' : ''}${fmt(coin.priceChange7d)}%`}
          </div>
        </div>
        <div>
          <div className="text-text-muted mb-0.5">24h volume</div>
          <div className="text-text-secondary">{fmtMcap(coin.volume24h)}</div>
        </div>
        <div>
          <div className="text-text-muted mb-0.5" title="24h volume ÷ market cap">Liquidity</div>
          <div className="text-text-secondary">{(coin.liquidityRatio * 100).toFixed(1)}%</div>
        </div>
        <div>
          <div className="text-text-muted mb-0.5">From ATH</div>
          <div className="text-text-secondary">{coin.athChangePercent}%</div>
        </div>
      </div>
      {coin.utilityNote && (
        <div className="px-4 pb-3 text-xs text-text-secondary">{coin.utilityNote}</div>
      )}

      {/* Actions */}
      <div className="px-4 pb-4 border-t border-border pt-3 flex items-center gap-2">
        {added ? (
          <span className="text-xs text-emerald-400 flex items-center gap-1"><Star className="w-3 h-3" /> Added to list</span>
        ) : (
          <>
            <input
              type="text" placeholder="Notes (optional)" value={notes}
              onChange={e => setNotes(e.target.value)}
              className="flex-1 text-xs bg-bg-elevated border border-border rounded px-2 py-1.5 text-text-secondary placeholder:text-text-muted focus:outline-none focus:border-accent-blue"
            />
            <button
              onClick={handleAdd}
              className="px-3 py-1.5 bg-accent-blue hover:bg-blue-600 text-white text-xs rounded font-medium flex items-center gap-1 transition-colors"
            >
              <Plus className="w-3 h-3" /> Add
            </button>
            <button
              onClick={() => dismissCandidate(coin.cgId)}
              className="p-1.5 text-text-muted hover:text-text-secondary rounded transition-colors"
              title="Dismiss"
            >
              <X className="w-3 h-3" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Search tab ───────────────────────────────────────────────────────────────

interface SearchResult { cgId: string; name: string; symbol: string; marketCapRank: number | null; thumb: string; image: string }

function SearchTab() {
  const [query, setQuery]   = useState('')
  const [debouncedQ, setDQ] = useState('')
  const { addCoin, isAdded } = useCoinDiscoveryStore()

  const debounce = useCallback((v: string) => {
    setQuery(v)
    clearTimeout((debounce as any)._t)
    ;(debounce as any)._t = setTimeout(() => setDQ(v), 400)
  }, [])

  const { data, isFetching } = useQuery<{ coins: SearchResult[] }>({
    queryKey: ['coin-search', debouncedQ],
    queryFn:  () => fetch(`/live-data/coin-search?q=${encodeURIComponent(debouncedQ)}`).then(r => r.json()),
    enabled:  debouncedQ.length >= 2,
    staleTime: 60_000,
  })

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <input
          type="text" placeholder="Search for any coin by name or ticker…" value={query}
          onChange={e => debounce(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 bg-bg-elevated border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue"
        />
        {isFetching && <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />}
      </div>

      {data?.coins && data.coins.length > 0 && (
        <div className="space-y-2">
          {data.coins.map(coin => {
            const added = isAdded(coin.cgId)
            return (
              <div key={coin.cgId} className="flex items-center gap-3 p-3 bg-bg-card border border-border rounded-lg">
                <img src={coin.thumb} alt={coin.name} className="w-8 h-8 rounded-full flex-shrink-0" onError={e => { (e.target as HTMLImageElement).src = '' }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-text-primary text-sm">{coin.name}</span>
                    <span className="text-xs text-text-muted">{coin.symbol}</span>
                    {coin.marketCapRank && <span className="text-xs text-text-muted">#{coin.marketCapRank}</span>}
                  </div>
                  <div className="text-xs text-text-muted">{coin.cgId}</div>
                </div>
                {added ? (
                  <span className="text-xs text-emerald-400 flex items-center gap-1"><Star className="w-3 h-3" /> Added</span>
                ) : (
                  <button
                    onClick={() => addCoin({
                      cgId: coin.cgId, symbol: coin.symbol, name: coin.name, image: coin.image,
                      category: 'unknown', price: 0, marketCap: 0,
                      marketCapRank: coin.marketCapRank ?? 0,
                      addedAt: new Date().toISOString(), addedBy: 'manual', notes: '',
                    })}
                    className="px-3 py-1 bg-accent-blue hover:bg-blue-600 text-white text-xs rounded font-medium flex items-center gap-1 transition-colors"
                  >
                    <Plus className="w-3 h-3" /> Add
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {debouncedQ.length >= 2 && !isFetching && data?.coins?.length === 0 && (
        <p className="text-sm text-text-muted text-center py-8">No coins found for &quot;{debouncedQ}&quot;</p>
      )}

      {debouncedQ.length < 2 && (
        <p className="text-sm text-text-muted text-center py-12">Type at least 2 characters to search <span className="text-text-secondary font-medium">CoinGecko</span></p>
      )}
    </div>
  )
}

// ─── Added coins tab ──────────────────────────────────────────────────────────

function AddedCoinsTab() {
  const { addedCoins, removeCoin } = useCoinDiscoveryStore()

  if (addedCoins.length === 0) {
    return (
      <div className="text-center py-16 text-text-muted">
        <Coins className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p className="text-sm">No coins added yet.</p>
        <p className="text-xs mt-1">Add coins from Candidates or Search.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {addedCoins.map(coin => (
        <div key={coin.cgId} className="flex items-center gap-3 p-3 bg-bg-card border border-border rounded-xl">
          <img src={coin.image} alt={coin.name} className="w-9 h-9 rounded-full flex-shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <a
                href={`https://www.coingecko.com/en/coins/${coin.cgId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-text-primary text-sm hover:text-accent-blue transition-colors flex items-center gap-1 group"
              >
                {coin.name}
                <ExternalLink size={10} className="text-text-muted group-hover:text-accent-blue shrink-0" />
              </a>
              <span className="text-xs text-text-muted">{coin.symbol}</span>
              <span className="text-xs px-1.5 py-0.5 rounded bg-bg-elevated text-text-muted">
                {coin.addedBy === 'manual' ? 'Manual' : 'From candidates'}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-0.5 text-xs text-text-muted">
              {coin.marketCapRank ? <span>#{coin.marketCapRank}</span> : null}
              {/* Legacy fields from coins saved before W3-1 removed scoring —
                  shown as inert text, never re-styled as a verdict. */}
              {coin.score ? <span>saved with score {coin.score}/10 (legacy)</span> : null}
              <span>Added {new Date(coin.addedAt).toLocaleDateString()}</span>
            </div>
            {coin.notes && <p className="text-xs text-text-secondary mt-1 italic">&quot;{coin.notes}&quot;</p>}
          </div>
          <button onClick={() => removeCoin(coin.cgId)} className="p-1.5 text-text-muted hover:text-red-400 rounded transition-colors" title="Remove">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

const TABS = ['candidates', 'search', 'added'] as const
type Tab = typeof TABS[number]

const TAB_LABELS: Record<Tab, string> = {
  candidates: 'Candidates',
  search:          'Search & Add',
  added:           'Added Coins',
}

// W3-1: liquidity replaces the score bands as the primary filter — it is the
// dimension the owner asked to search by, and it is a fact from the feed.
const LIQUIDITY_FILTER_OPTIONS = [
  { value: 'all',  label: 'Any liquidity' },
  { value: 'high', label: 'High (>15%/day)' },
  { value: 'mid',  label: 'Moderate (5–15%)' },
  { value: 'low',  label: 'Thin (<5%)' },
] as const

// Coin type is `category` on every candidate (CATEGORY_INFO in coinCatalog.ts),
// already computed server-side and already rendered as the badge on each card —
// it was simply never something you could organize the list by.
const TYPE_OPTIONS = [
  { value: 'all', label: 'All types' },
  ...Object.entries(CATEGORY_INFO).map(([value, info]) => ({ value, label: info.label })),
]

const SORT_OPTIONS = [
  { value: 'market-cap', label: 'Market cap' },
  { value: 'price', label: 'Price' },
  { value: 'growth-24h', label: '24h growth' },
  { value: 'growth-7d', label: '7d growth' },
  { value: 'liquidity', label: 'Liquidity' },
  { value: 'type', label: 'Coin type' },
] as const
type SortKey = typeof SORT_OPTIONS[number]['value']

const LIMIT_OPTIONS = [
  { value: 250,  label: 'Top 250' },
  { value: 500,  label: 'Top 500' },
  { value: 750,  label: 'Top 750' },
]

function CoinDiscoveryPageInner() {
  const [tab, setTab]             = useState<Tab>('candidates')
  const [recoFilter, setRecoFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [sortBy, setSortBy]       = useState<SortKey>('market-cap')
  const [search, setSearch]       = useState('')
  const [limit, setLimit]         = useState(250)
  const [sourceOpen, setSourceOpen] = useState(false)
  const [viewMode, setViewMode]   = useState<'comfortable' | 'compact'>('comfortable')

  const { addedCoins, clearDismissed, dismissedIds } = useCoinDiscoveryStore()

  const { data, isLoading, error } = useQuery<CoinDiscoveryResponse>({
    queryKey: ['coin-discovery', limit],
    queryFn:  async () => {
      const r = await fetch(`/live-data/coin-discovery?limit=${limit}`)
      const j: CoinDiscoveryResponse = await r.json()
      if (!r.ok || !j.ok) throw new Error(j.error ?? `HTTP ${r.status}`)
      return j
    },
    staleTime: 1000 * 60 * 15,
    refetchInterval: 1000 * 60 * 20,
  })

  const candidates = data?.candidates ?? []

  const filtered = candidates.filter(c => {
    if (recoFilter === 'high' && c.liquidityRatio <= 0.15) return false
    if (recoFilter === 'mid' && (c.liquidityRatio <= 0.05 || c.liquidityRatio > 0.15)) return false
    if (recoFilter === 'low' && c.liquidityRatio > 0.05) return false
    if (typeFilter !== 'all' && c.category !== typeFilter) return false
    if (search && !c.name.toLowerCase().includes(search.toLowerCase()) && !c.symbol.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  // Identity of the current result set, so the sort memo re-runs when the
  // filters change without depending on a freshly-allocated array each render.
  const filteredKey = filtered.map(c => c.cgId).join(',')

  // Every sort is over a FACT from the feed (W3-1). The route's own order is
  // market cap, so that one is a pass-through.
  const sorted = useMemo(() => {
    if (sortBy === 'market-cap') return filtered
    const rows = [...filtered]
    if (sortBy === 'price') return rows.sort((a, b) => b.price - a.price)
    if (sortBy === 'growth-24h') return rows.sort((a, b) => b.priceChange24h - a.priceChange24h)
    if (sortBy === 'growth-7d') return rows.sort((a, b) => (b.priceChange7d ?? -Infinity) - (a.priceChange7d ?? -Infinity))
    if (sortBy === 'liquidity') return rows.sort((a, b) => b.liquidityRatio - a.liquidityRatio)
    return rows.sort((a, b) =>
      a.categoryLabel.localeCompare(b.categoryLabel) || b.marketCap - a.marketCap,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredKey, sortBy])

  const liquidCount = candidates.filter(c => c.liquidityRatio > 0.15).length
  const risingCount = candidates.filter(c => (c.priceChange7d ?? 0) > 0).length

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <PageHeader
            title="Coin Discovery"
            subtitle="Assets not yet in your registry, profiled on market cap and utility"
            description="Coin Discovery lists assets not yet in your registry with the market facts the feed reports — price, growth, volume, liquidity, market cap — plus a factual category tag. Nothing here is scored or ranked by us: sort by whichever fact matters to you."
            details={[
              { label: 'Data source', text: 'Candidates are fetched from CoinGecko and filtered to assets above the minimum market cap threshold.' },
              { label: 'Liquidity', text: '24h volume divided by market cap. Above 15%/day is deep; under 5% is thin — a figure from the feed, not a judgment about the coin.' },
              { label: 'Adding assets', text: 'Clicking "Add" saves the asset to your local discovery store for review — it does not modify the main Asset Registry without backend integration.' },
            ]}
          />
        </div>
        {data && (
          <div className="flex gap-3 text-sm">
            <div className="bg-bg-card border border-border rounded-lg px-3 py-2 text-center" title="24h volume over 15% of market cap">
              <div className="text-lg font-bold text-emerald-400">{liquidCount}</div>
              <div className="text-xs text-text-muted">Highly liquid</div>
            </div>
            <div className="bg-bg-card border border-border rounded-lg px-3 py-2 text-center">
              <div className="text-lg font-bold text-blue-400">{risingCount}</div>
              <div className="text-xs text-text-muted">Up on 7d</div>
            </div>
            <div className="bg-bg-card border border-border rounded-lg px-3 py-2 text-center">
              <div className="text-lg font-bold text-text-primary">{addedCoins.length}</div>
              <div className="text-xs text-text-muted">Added</div>
            </div>
            {data.alreadyTracked > 0 && (
              <div className="bg-bg-card border border-border rounded-lg px-3 py-2 text-center">
                <div className="text-lg font-bold text-text-secondary">{data.alreadyTracked}</div>
                <div className="text-xs text-text-muted">Already Tracked</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Data provenance */}
      <SourceLine id="coin-discovery" />

      {/* Source selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <button
            onClick={() => setSourceOpen(v => !v)}
            className="flex items-center gap-2 px-3 py-1.5 bg-bg-card border border-border rounded-lg text-xs text-text-secondary hover:border-accent-blue transition-colors"
          >
            <Database size={12} className="text-accent-blue" />
            <span className="font-medium text-text-primary">CoinGecko</span>
            <span className="text-text-muted">·</span>
            <span>{LIMIT_OPTIONS.find(o => o.value === limit)?.label ?? `Top ${limit}`}</span>
            <ChevronDown size={12} className={`text-text-muted transition-transform ${sourceOpen ? 'rotate-180' : ''}`} />
          </button>
          {sourceOpen && (
            <div className="absolute left-0 top-full mt-1 z-20 bg-bg-card border border-border rounded-lg shadow-lg overflow-hidden min-w-[220px]">
              <div className="px-3 py-2 border-b border-border">
                <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wide">Data Source</p>
              </div>
              <div className="px-3 py-2 border-b border-border">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="text-xs font-medium text-text-primary">CoinGecko</span>
                  <a href="https://www.coingecko.com" target="_blank" rel="noopener noreferrer">
                    <ExternalLink size={10} className="text-text-muted hover:text-accent-blue" />
                  </a>
                </div>
                <p className="text-[11px] text-text-muted mt-1 ml-4">Free public API · ranked by market cap</p>
              </div>
              <div className="px-3 py-2">
                <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wide mb-2">Range</p>
                {LIMIT_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => { setLimit(opt.value); setSourceOpen(false) }}
                    className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs transition-colors ${
                      limit === opt.value
                        ? 'bg-accent-blue/15 text-accent-blue font-medium'
                        : 'text-text-secondary hover:bg-bg-elevated'
                    }`}
                  >
                    <span>{opt.label}</span>
                    {limit === opt.value && <span className="text-[10px]">✓</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <p className="text-xs text-text-muted">
          {isLoading
            ? `Searching CoinGecko ${LIMIT_OPTIONS.find(o => o.value === limit)?.label.toLowerCase()} coins by market cap…`
            : `Ranked from CoinGecko ${LIMIT_OPTIONS.find(o => o.value === limit)?.label.toLowerCase()} coins by market cap`}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-bg-elevated p-1 rounded-lg w-fit">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === t ? 'bg-bg-card text-text-primary shadow-sm' : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            {TAB_LABELS[t]}
            {t === 'added' && addedCoins.length > 0 && (
              <span className="ml-1.5 bg-accent-blue text-white text-xs rounded-full w-4 h-4 inline-flex items-center justify-center">
                {addedCoins.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Candidates tab */}
      {tab === 'candidates' && (
        <>
          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex gap-1">
              {LIQUIDITY_FILTER_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setRecoFilter(opt.value)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
                    recoFilter === opt.value
                      ? 'bg-accent-blue border-accent-blue text-white'
                      : 'border-border text-text-muted hover:text-text-secondary'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-1.5 text-xs text-text-muted">
              Type
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
                className="bg-bg-elevated border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent-blue"
              >
                {TYPE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-1.5 text-xs text-text-muted">
              Sort
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as SortKey)}
                className="bg-bg-elevated border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent-blue"
              >
                {SORT_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>

            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
              <input
                type="text" placeholder="Filter by name…" value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-bg-elevated border border-border rounded-lg text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue"
              />
            </div>
            {dismissedIds.length > 0 && (
              <button onClick={clearDismissed} className="text-xs text-text-muted hover:text-text-secondary flex items-center gap-1">
                <Eye className="w-3 h-3" /> Show {dismissedIds.length} dismissed
              </button>
            )}

            {/* View toggle */}
            <div className="ml-auto flex items-center gap-0.5 bg-bg-elevated border border-border rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('comfortable')}
                className={`p-1.5 rounded-md transition-colors ${
                  viewMode === 'comfortable' ? 'bg-bg-card text-text-primary' : 'text-text-muted hover:text-text-secondary'
                }`}
                title="Comfortable view — full cards"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode('compact')}
                className={`p-1.5 rounded-md transition-colors ${
                  viewMode === 'compact' ? 'bg-bg-card text-text-primary' : 'text-text-muted hover:text-text-secondary'
                }`}
                title="Compact view — condensed rows"
              >
                <Rows3 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {isLoading && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-bg-card border border-border rounded-xl h-52 animate-pulse" />
              ))}
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-2 text-red-400 text-sm">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              Failed to load candidates. CoinGecko may be rate-limiting — try again in a minute.
            </div>
          )}

          {!isLoading && !error && sorted.length === 0 && (
            <div className="text-center py-16 text-text-muted">
              <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No candidates match your current filters.</p>
            </div>
          )}

          {!isLoading && sorted.length > 0 && (
            viewMode === 'compact' ? (
              <div className="flex flex-col gap-1.5">
                {sorted.map(coin => <CandidateCard key={coin.cgId} coin={coin} compact />)}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {sorted.map(coin => <CandidateCard key={coin.cgId} coin={coin} />)}
              </div>
            )
          )}

          {data && (
            <p className="text-xs text-text-muted text-center">
              Showing {sorted.length} of {candidates.length} candidates{typeFilter !== 'all' ? ` · ${TYPE_OPTIONS.find(o => o.value === typeFilter)?.label}` : ''} from CoinGecko {LIMIT_OPTIONS.find(o => o.value === limit)?.label.toLowerCase()} · Updated {new Date(data.updatedAt).toLocaleTimeString()}
            </p>
          )}
        </>
      )}

      {tab === 'search' && <SearchTab />}
      {tab === 'added'  && <AddedCoinsTab />}
    </div>
  )
}

// Entitlement gate. Wrapping here rather than inside CoinDiscoveryPageInner's JSX is
// deliberate: a disabled module must not mount the component at all, so its
// queries and stores never run for a user who cannot see the results.
export default function CoinDiscoveryPage() {
  return (
    <ModuleGate module="crypto">
      <CoinDiscoveryPageInner />
    </ModuleGate>
  )
}
