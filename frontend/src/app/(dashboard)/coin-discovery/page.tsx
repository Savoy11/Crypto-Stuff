'use client'

/* eslint-disable @next/next/no-img-element --
   Coin icons are remote CoinGecko CDN avatars rendered at 28–36px with an onError
   fallback that hides broken images. next/image would require per-domain
   remotePatterns config and doesn't cleanly support the inline onError fallback,
   for no real benefit at this size. Plain <img> is intentional here. */

import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, Plus, Star, X, ChevronDown, ChevronUp, Coins, Trash2, TrendingUp, AlertTriangle, Eye, ExternalLink, Database, LayoutGrid, Rows3 } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { useCoinDiscoveryStore, type AddedCoin } from '@/store/useCoinDiscoveryStore'
import type { CandidateCoin, CoinDiscoveryResponse } from '@/app/live-data/coin-discovery/route'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 2) { return n.toFixed(decimals) }
function fmtMcap(n: number) {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6)  return `$${(n / 1e6).toFixed(1)}M`
  return `$${n.toLocaleString()}`
}

const RECO_STYLES: Record<string, { label: string; badge: string; dot: string }> = {
  'strong-add':     { label: 'Strong Add',      badge: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', dot: 'bg-emerald-400' },
  'consider':       { label: 'Consider',         badge: 'bg-blue-500/20 text-blue-400 border-blue-500/30',         dot: 'bg-blue-400' },
  'monitor':        { label: 'Monitor',           badge: 'bg-amber-500/20 text-amber-400 border-amber-500/30',     dot: 'bg-amber-400' },
  'too-speculative':{ label: 'Too Speculative',   badge: 'bg-red-500/20 text-red-400 border-red-500/30',           dot: 'bg-red-400' },
}

function RecommendationBadge({ level }: { level: string }) {
  const s = RECO_STYLES[level] ?? RECO_STYLES['monitor']
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${s.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  )
}

function ScoreBar({ score, max = 10, color = 'bg-accent-blue' }: { score: number; max?: number; color?: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-bg-elevated rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${(score / max) * 100}%` }} />
      </div>
      <span className="text-xs text-text-muted w-6 text-right">{score}</span>
    </div>
  )
}

// ─── Candidate card ───────────────────────────────────────────────────────────

function CandidateCard({ coin, compact = false }: { coin: CandidateCoin; compact?: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const [notes, setNotes] = useState('')
  const { addCoin, dismissRecommendation, isAdded, isDismissed } = useCoinDiscoveryStore()
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
      addedBy: 'recommended', score: coin.scores.overall,
      recommendation: coin.recommendation, notes,
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
        <div className="flex-shrink-0 ml-auto"><RecommendationBadge level={coin.recommendation} /></div>
        <span className="text-sm font-bold text-text-primary flex-shrink-0 w-10 text-right">{coin.scores.overall}<span className="text-text-muted text-xs font-normal">/10</span></span>
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
              onClick={() => dismissRecommendation(coin.cgId)}
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
            <RecommendationBadge level={coin.recommendation} />
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
        <div className="text-right flex-shrink-0">
          <div className="text-lg font-bold text-text-primary">{coin.scores.overall}</div>
          <div className="text-xs text-text-muted">/ 10</div>
        </div>
      </div>

      {/* Score bars */}
      <div className="px-4 pb-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
        {[
          { label: 'Market Cap', score: coin.scores.marketCap, color: 'bg-blue-500' },
          { label: 'Utility', score: coin.scores.utility, color: 'bg-purple-500' },
        ].map(({ label, score, color }) => (
          <div key={label}>
            <div className="text-xs text-text-muted mb-1">{label}</div>
            <ScoreBar score={score} color={color} />
          </div>
        ))}
      </div>

      {/* Reasons */}
      {coin.reasons.length > 0 && (
        <div className="px-4 pb-3">
          <ul className="space-y-1">
            {coin.reasons.map((r, i) => (
              <li key={i} className="text-xs text-text-secondary flex gap-2">
                <span className="text-text-muted mt-0.5">•</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Expand toggle */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full px-4 py-2 flex items-center justify-center gap-1 text-xs text-text-muted hover:text-text-secondary border-t border-border transition-colors"
      >
        {expanded ? <><ChevronUp className="w-3 h-3" /> Less detail</> : <><ChevronDown className="w-3 h-3" /> Score breakdown</>}
      </button>

      {expanded && (
        <div className="px-4 pb-3 border-t border-border pt-3 space-y-2">
          {[
            { label: 'Market Cap', reason: coin.scoreReasons.marketCap },
            { label: 'Utility', reason: coin.scoreReasons.utility },
          ].map(({ label, reason }) => (
            <div key={label} className="text-xs">
              <span className="text-text-muted font-medium">{label}: </span>
              <span className="text-text-secondary">{reason}</span>
            </div>
          ))}
          <div className="text-xs text-text-muted">ATH drawdown: {coin.athChangePercent}%</div>
        </div>
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
              onClick={() => dismissRecommendation(coin.cgId)}
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
        <p className="text-xs mt-1">Add coins from Recommendations or Search.</p>
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
                {coin.addedBy === 'recommended' ? 'Recommended' : 'Manual'}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-0.5 text-xs text-text-muted">
              {coin.marketCapRank ? <span>#{coin.marketCapRank}</span> : null}
              {coin.score ? <span>Score: {coin.score}/10</span> : null}
              {coin.recommendation ? <RecommendationBadge level={coin.recommendation} /> : null}
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

const TABS = ['recommendations', 'search', 'added'] as const
type Tab = typeof TABS[number]

const TAB_LABELS: Record<Tab, string> = {
  recommendations: 'Recommendations',
  search:          'Search & Add',
  added:           'Added Coins',
}

const RECO_FILTER_OPTIONS = [
  { value: 'all',             label: 'All' },
  { value: 'strong-add',      label: 'Strong Add' },
  { value: 'consider',        label: 'Consider' },
  { value: 'monitor',         label: 'Monitor' },
  { value: 'too-speculative', label: 'Speculative' },
]

const LIMIT_OPTIONS = [
  { value: 250,  label: 'Top 250' },
  { value: 500,  label: 'Top 500' },
  { value: 750,  label: 'Top 750' },
]

export default function CoinDiscoveryPage() {
  const [tab, setTab]             = useState<Tab>('recommendations')
  const [recoFilter, setRecoFilter] = useState('all')
  const [search, setSearch]       = useState('')
  const [limit, setLimit]         = useState(250)
  const [sourceOpen, setSourceOpen] = useState(false)
  const [viewMode, setViewMode]   = useState<'comfortable' | 'compact'>('comfortable')

  const { addedCoins, clearDismissed, dismissedIds } = useCoinDiscoveryStore()

  const { data, isLoading, error } = useQuery<CoinDiscoveryResponse>({
    queryKey: ['coin-discovery', limit],
    queryFn:  () => fetch(`/live-data/coin-discovery?limit=${limit}`).then(r => r.json()),
    staleTime: 1000 * 60 * 15,
    refetchInterval: 1000 * 60 * 20,
  })

  const candidates = data?.candidates ?? []

  const filtered = candidates.filter(c => {
    if (recoFilter !== 'all' && c.recommendation !== recoFilter) return false
    if (search && !c.name.toLowerCase().includes(search.toLowerCase()) && !c.symbol.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const strongAddCount = candidates.filter(c => c.recommendation === 'strong-add').length
  const considerCount  = candidates.filter(c => c.recommendation === 'consider').length

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <PageHeader
            title="Coin Discovery"
            subtitle="Find new assets to track — ranked by market cap and utility"
            description="Coin Discovery surfaces assets not yet in your registry that may be worth monitoring. Each candidate is scored on market cap and on-chain utility, then given a recommendation: Strong Add, Consider, Monitor, or Too Speculative."
            details={[
              { label: 'Data source', text: 'Candidates are fetched from CoinGecko and filtered to assets above the minimum market cap threshold.' },
              { label: 'Recommendations', text: 'Strong Add — meets all quality criteria. Consider — good fundamentals, minor concerns. Monitor — borderline. Too Speculative — high risk or insufficient history.' },
              { label: 'Adding assets', text: 'Clicking "Add to Registry" saves the asset to your local discovery store for review — it does not modify the main Asset Registry without backend integration.' },
            ]}
          />
        </div>
        {data && (
          <div className="flex gap-3 text-sm">
            <div className="bg-bg-card border border-border rounded-lg px-3 py-2 text-center">
              <div className="text-lg font-bold text-emerald-400">{strongAddCount}</div>
              <div className="text-xs text-text-muted">Strong Add</div>
            </div>
            <div className="bg-bg-card border border-border rounded-lg px-3 py-2 text-center">
              <div className="text-lg font-bold text-blue-400">{considerCount}</div>
              <div className="text-xs text-text-muted">Consider</div>
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

      {/* Recommendations tab */}
      {tab === 'recommendations' && (
        <>
          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex gap-1">
              {RECO_FILTER_OPTIONS.map(opt => (
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
              Failed to load recommendations. CoinGecko may be rate-limiting — try again in a minute.
            </div>
          )}

          {!isLoading && !error && filtered.length === 0 && (
            <div className="text-center py-16 text-text-muted">
              <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No candidates match your current filters.</p>
            </div>
          )}

          {!isLoading && filtered.length > 0 && (
            viewMode === 'compact' ? (
              <div className="flex flex-col gap-1.5">
                {filtered.map(coin => <CandidateCard key={coin.cgId} coin={coin} compact />)}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filtered.map(coin => <CandidateCard key={coin.cgId} coin={coin} />)}
              </div>
            )
          )}

          {data && (
            <p className="text-xs text-text-muted text-center">
              Showing {filtered.length} of {candidates.length} candidates from CoinGecko {LIMIT_OPTIONS.find(o => o.value === limit)?.label.toLowerCase()} · Updated {new Date(data.updatedAt).toLocaleTimeString()}
            </p>
          )}
        </>
      )}

      {tab === 'search' && <SearchTab />}
      {tab === 'added'  && <AddedCoinsTab />}
    </div>
  )
}
