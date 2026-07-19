'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, KeyRound, LineChart, RefreshCw, Search } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { MetricCard } from '@/components/ui/MetricCard'
import { OutlierScanPanel } from '@/components/markets/OutlierScanPanel'
import { SECTOR_INFO, type SectorId } from '@/lib/data/equityCatalog'
import { formatCompact, formatCurrency, formatPercent } from '@/lib/utils/format'
import { STALE_TIME_SHORT } from '@/lib/constants'
import type { StockUniverseResponse, UniverseEntry } from '@/app/live-data/stock-universe/route'
import type { SecurityQuotesResponse } from '@/app/live-data/security-quotes/route'

type SortKey = 'symbol' | 'sector' | 'price' | 'marketCap' | 'pe' | 'dividend' | 'beta'
const PAGE_SIZE = 50

// Shared column template so the header and every row line up. 8 columns:
// Company · Sector · Price · Chg% · Mkt Cap · P/E · Yield · Beta
const COLS = 'grid grid-cols-[minmax(0,2.6fr)_1.3fr_1fr_0.8fr_1.1fr_0.7fr_0.7fr_0.7fr] gap-2 px-4'

interface Row extends UniverseEntry {
  livePrice: number
  changePercent: number | null
  liveMarketCap: number
  live: boolean
}

const parseNum = (s: string): number => parseFloat(s)

export function EquitiesClient() {
  const [sector, setSector] = useState<SectorId | 'all'>('all')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('marketCap')
  const [sortAsc, setSortAsc] = useState(false)
  const [page, setPage] = useState(0)
  // Screener ranges (blank = no bound)
  const [minMcapB, setMinMcapB] = useState('')
  const [maxMcapB, setMaxMcapB] = useState('')
  const [minPe, setMinPe] = useState('')
  const [maxPe, setMaxPe] = useState('')
  const [minYield, setMinYield] = useState('')
  const [maxBeta, setMaxBeta] = useState('')

  // ── Universe (daily-refreshed; server caches 24h) ──
  const { data: universeData, isLoading: uniLoading, refetch, isFetching } = useQuery<StockUniverseResponse>({
    queryKey: ['stock-universe'],
    queryFn: () => fetch('/live-data/stock-universe').then((r) => r.json()),
    staleTime: 1000 * 60 * 30,
  })
  const universe = useMemo(() => universeData?.entries ?? [], [universeData])
  const configured = universeData?.configured ?? false

  // ── Filter + sort the whole universe ──
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    const mcMin = parseNum(minMcapB), mcMax = parseNum(maxMcapB)
    const peMin = parseNum(minPe), peMax = parseNum(maxPe)
    const yMin = parseNum(minYield), bMax = parseNum(maxBeta)
    const subset = universe.filter((e) =>
      (sector === 'all' || e.sector === sector) &&
      (!query || e.symbol.toLowerCase().includes(query) || e.name.toLowerCase().includes(query)) &&
      (!isFinite(mcMin) || e.marketCapB >= mcMin) &&
      (!isFinite(mcMax) || e.marketCapB <= mcMax) &&
      (!isFinite(peMin) || (e.peRatio != null && e.peRatio >= peMin)) &&
      (!isFinite(peMax) || (e.peRatio != null && e.peRatio <= peMax)) &&
      (!isFinite(yMin) || (e.dividendYieldPct != null && e.dividendYieldPct >= yMin)) &&
      (!isFinite(bMax) || e.beta <= bMax)
    )
    const dir = sortAsc ? 1 : -1
    const value = (e: UniverseEntry): number | string => {
      switch (sortKey) {
        case 'symbol':   return e.symbol
        case 'sector':   return `${SECTOR_INFO[e.sector].label} ${e.industry}`
        case 'price':    return e.referencePrice
        case 'pe':       return e.peRatio ?? -Infinity
        case 'dividend': return e.dividendYieldPct ?? -Infinity
        case 'beta':     return e.beta
        default:         return e.marketCapB
      }
    }
    return [...subset].sort((a, b) => {
      const va = value(a), vb = value(b)
      if (typeof va === 'string' && typeof vb === 'string') return va.localeCompare(vb) * dir
      return ((va as number) - (vb as number)) * dir
    })
  }, [universe, sector, search, sortKey, sortAsc, minMcapB, maxMcapB, minPe, maxPe, minYield, maxBeta])

  // Reset to first page whenever the result set changes
  useEffect(() => { setPage(0) }, [sector, search, sortKey, sortAsc, minMcapB, maxMcapB, minPe, maxPe, minYield, maxBeta])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const pageEntries = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)
  const pageSymbols = pageEntries.map((e) => e.symbol)

  // ── Live quotes for the visible page only (bounded regardless of universe size) ──
  const { data: quoteData } = useQuery<SecurityQuotesResponse>({
    queryKey: ['security-quotes', 'page', pageSymbols.join(',')],
    queryFn: () => fetch(`/live-data/security-quotes?symbols=${encodeURIComponent(pageSymbols.join(','))}`).then((r) => r.json()),
    enabled: pageSymbols.length > 0,
    staleTime: STALE_TIME_SHORT,
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  })

  const rows: Row[] = pageEntries.map((e) => {
    const q = quoteData?.quotes?.[e.symbol.toUpperCase()]
    const live = !!q && quoteData?.source !== 'reference' && !q.reference
    return {
      ...e,
      livePrice: q?.price ?? e.referencePrice,
      changePercent: live ? q?.changePercent ?? null : null,
      liveMarketCap: q?.marketCap ?? e.marketCapB * 1e9,
      live,
    }
  })

  // Universe-level KPIs + page breadth from the live quotes we do have
  const sectorsCovered = useMemo(() => new Set(universe.map((e) => e.sector)).size, [universe])
  const largest = universe[0]
  const pageWithChange = rows.filter((r) => r.changePercent != null)
  const advancers = pageWithChange.filter((r) => (r.changePercent ?? 0) > 0).length
  const decliners = pageWithChange.filter((r) => (r.changePercent ?? 0) < 0).length

  const anyFilter = !!(search || minMcapB || maxMcapB || minPe || maxPe || minYield || maxBeta || sector !== 'all')

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((a) => !a)
    else { setSortKey(key); setSortAsc(key === 'symbol' || key === 'sector') }
  }

  const SortHeader = ({ label, colKey, align = 'end' }: { label: string; colKey: SortKey; align?: 'start' | 'end' }) => (
    <button
      onClick={() => toggleSort(colKey)}
      className={clsx('flex items-center gap-1 text-xs font-medium uppercase tracking-wider transition-colors',
        align === 'end' ? 'justify-end' : 'justify-start',
        sortKey === colKey ? 'text-accent-blue' : 'text-text-muted hover:text-text-secondary')}
    >
      {label}
      {sortKey === colKey
        ? (sortAsc ? <ArrowUp size={11} aria-hidden /> : <ArrowDown size={11} aria-hidden />)
        : <ArrowUpDown size={11} className="opacity-40" aria-hidden />}
    </button>
  )

  return (
    <div className="space-y-6 max-w-screen-2xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title="Stock Registry"
          subtitle={configured
            ? `${universe.length.toLocaleString()} equities across ${sectorsCovered} sectors · refreshed daily`
            : `${universe.length} curated equities · add an FMP key for the full daily universe`}
          icon={<LineChart size={20} aria-hidden />}
          description="The universe is sourced daily from Financial Modeling Prep (all actively-traded common stocks, sector-tagged) and cached for 24h; live quotes for the visible page ladder through FMP and Yahoo. Without an FMP key it falls back to a curated large-cap list."
        />
        <div className="flex items-center gap-3 shrink-0">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search symbol or name…"
              className="w-64 rounded border border-border bg-bg-elevated pl-8 pr-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-blue/50 focus:outline-none"
            />
          </div>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-border bg-bg-elevated text-xs text-text-secondary hover:text-text-primary transition-colors"
          >
            <RefreshCw size={12} className={isFetching ? 'animate-spin' : undefined} aria-hidden /> Refresh
          </button>
        </div>
      </div>

      {/* Not-configured notice */}
      {universeData && !configured && (
        <div className="flex items-start gap-2.5 rounded-card border border-amber-500/20 bg-amber-500/5 px-4 py-3">
          <KeyRound size={16} className="text-amber-400/70 mt-0.5 shrink-0" aria-hidden />
          <p className="text-xs text-text-secondary leading-relaxed">
            Showing the curated large-cap list.{' '}
            {universeData.error?.includes('paid')
              ? <>The full daily-refreshed universe (thousands of stocks) comes from FMP’s stock-screener endpoint, which requires a <span className="text-text-primary">paid FMP plan</span>. Your free key still powers per-stock quotes, profiles, charts, and earnings — and any ticker resolves on its detail page.</>
              : <>Add a Financial Modeling Prep key in <Link href="/settings" className="text-accent-blue hover:underline">Settings → Integrations → Equity Market Data</Link>. Note: the broad universe list needs FMP’s <span className="text-text-primary">paid</span> screener endpoint; a free key still powers per-stock data.</>}
          </p>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard title="Universe" loading={uniLoading} value={universe.length.toLocaleString()}
          subtitle={configured ? 'live via FMP · daily' : 'curated fallback'} accentColor="#3b82f6" />
        <MetricCard title="Matches" loading={uniLoading} value={filtered.length.toLocaleString()}
          subtitle={anyFilter ? 'after filters' : 'no filters applied'} accentColor="#8b5cf6" />
        <MetricCard title="Sectors" loading={uniLoading} value={String(sectorsCovered)}
          subtitle="represented in the universe" accentColor="#14b8a6" />
        <MetricCard title="Largest" loading={uniLoading} value={largest ? largest.symbol : '—'}
          subtitle={largest ? largest.name : '—'} accentColor="#10b981" />
      </div>

      {/* AI outlier scan */}
      <OutlierScanPanel />

      {/* Sector filter */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setSector('all')}
          className={clsx('px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
            sector === 'all' ? 'bg-accent-blue/15 text-accent-blue border-accent-blue/30'
              : 'text-text-muted border-border hover:text-text-secondary hover:bg-bg-elevated')}
        >
          All Sectors
        </button>
        {(Object.entries(SECTOR_INFO) as Array<[SectorId, { label: string; color: string }]>).map(([id, info]) => (
          <button
            key={id}
            onClick={() => setSector(sector === id ? 'all' : id)}
            className={clsx('flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
              sector === id ? 'bg-accent-blue/15 text-accent-blue border-accent-blue/30'
                : 'text-text-muted border-border hover:text-text-secondary hover:bg-bg-elevated')}
          >
            <span className="size-1.5 rounded-full" style={{ backgroundColor: info.color }} aria-hidden />
            {info.label}
          </button>
        ))}
      </div>

      {/* Screener — range filters */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-card border border-border bg-bg-card px-4 py-3">
        <span className="text-xs font-medium uppercase tracking-wider text-text-muted">Screener</span>
        <RangeFilter label="Mkt cap $B" min={minMcapB} max={maxMcapB} setMin={setMinMcapB} setMax={setMaxMcapB} />
        <RangeFilter label="P/E" min={minPe} max={maxPe} setMin={setMinPe} setMax={setMaxPe} />
        <label className="flex items-center gap-1.5 text-xs text-text-muted">
          Min yield %
          <NumInput value={minYield} onChange={setMinYield} placeholder="2" />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-text-muted">
          Max beta
          <NumInput value={maxBeta} onChange={setMaxBeta} placeholder="1.2" />
        </label>
        {anyFilter && (
          <button
            onClick={() => { setMinMcapB(''); setMaxMcapB(''); setMinPe(''); setMaxPe(''); setMinYield(''); setMaxBeta(''); setSearch(''); setSector('all') }}
            className="text-xs text-accent-blue hover:underline"
          >
            Clear all
          </button>
        )}
        <span className="ml-auto text-[11px] text-text-muted">{filtered.length.toLocaleString()} match{filtered.length !== 1 ? 'es' : ''}</span>
      </div>

      {/* Table */}
      <div className="rounded-card border border-border bg-bg-card overflow-hidden">
        <div className={clsx(COLS, 'py-2.5 border-b border-border bg-bg-elevated/40')}>
          <SortHeader label="Company" colKey="symbol" align="start" />
          <SortHeader label="Sector" colKey="sector" align="start" />
          <SortHeader label="Price" colKey="price" />
          <span className="text-xs font-medium uppercase tracking-wider text-text-muted text-right">Chg %</span>
          <SortHeader label="Mkt Cap" colKey="marketCap" />
          <SortHeader label="P/E" colKey="pe" />
          <SortHeader label="Yield" colKey="dividend" />
          <SortHeader label="Beta" colKey="beta" />
        </div>

        <div className="divide-y divide-border/60">
          {uniLoading && universe.length === 0
            ? Array.from({ length: 12 }, (_, i) => (
                <div key={i} className="h-12 animate-shimmer bg-shimmer-gradient bg-[length:200%_100%]" />
              ))
            : rows.map((row) => {
                const info = SECTOR_INFO[row.sector]
                const change = row.changePercent
                return (
                  <Link
                    key={row.symbol}
                    href={`/equities/${row.symbol.toLowerCase()}`}
                    className={clsx(COLS, 'py-2.5 text-sm items-center hover:bg-bg-elevated/40 transition-colors')}
                  >
                    <div className="min-w-0">
                      <span className="font-mono font-semibold text-text-primary">{row.symbol}</span>
                      <span className="ml-2 text-xs text-text-muted truncate">{row.name}</span>
                    </div>
                    <div className="min-w-0">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium border border-border text-text-secondary truncate">
                        <span className="size-1.5 rounded-full shrink-0" style={{ backgroundColor: info.color }} aria-hidden />
                        <span className="truncate">{info.label}</span>
                      </span>
                    </div>
                    <div className="text-right font-mono tabular-nums text-text-primary">
                      {formatCurrency(row.livePrice)}
                      {!row.live && <span className="ml-1 text-[9px] text-amber-400/80 align-top" title="Reference price — live source unreachable">ref</span>}
                    </div>
                    <div className={clsx('text-right font-mono tabular-nums text-xs',
                      change == null ? 'text-text-muted' : change >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                      {change == null ? '—' : formatPercent(change, 2)}
                    </div>
                    <div className="text-right font-mono tabular-nums text-text-secondary">{formatCompact(row.liveMarketCap)}</div>
                    <div className="text-right font-mono tabular-nums text-xs text-text-secondary">{row.peRatio ?? '—'}</div>
                    <div className="text-right font-mono tabular-nums text-xs text-text-secondary">{row.dividendYieldPct != null ? `${row.dividendYieldPct.toFixed(1)}%` : '—'}</div>
                    <div className="text-right font-mono tabular-nums text-xs text-text-secondary">{row.beta ? row.beta.toFixed(2) : '—'}</div>
                  </Link>
                )
              })}
          {!uniLoading && filtered.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-text-muted">No equities match the current filters.</p>
          )}
        </div>

        {/* Pagination */}
        {filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-between gap-4 px-4 py-2.5 border-t border-border bg-bg-elevated/40">
            <span className="text-[11px] text-text-muted">
              {(safePage * PAGE_SIZE + 1).toLocaleString()}–{Math.min((safePage + 1) * PAGE_SIZE, filtered.length).toLocaleString()} of {filtered.length.toLocaleString()}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={safePage === 0}
                className="flex items-center gap-1 px-2 py-1 rounded border border-border text-xs text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors disabled:opacity-40 disabled:pointer-events-none"
              >
                <ChevronLeft size={13} aria-hidden /> Prev
              </button>
              <span className="text-[11px] text-text-muted tabular-nums">Page {safePage + 1} / {totalPages.toLocaleString()}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={safePage >= totalPages - 1}
                className="flex items-center gap-1 px-2 py-1 rounded border border-border text-xs text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors disabled:opacity-40 disabled:pointer-events-none"
              >
                Next <ChevronRight size={13} aria-hidden />
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="text-[11px] text-text-muted text-center">
        {configured ? 'Universe live via Financial Modeling Prep · refreshed daily' : 'Curated fallback universe'}
        {quoteData?.updatedAt && ` · quotes updated ${new Date(quoteData.updatedAt).toLocaleTimeString()}`}
        {' · '}live quotes cover the visible page; P/E &amp; beta are reference values
      </p>
    </div>
  )
}

// ─── Small inputs ─────────────────────────────────────────────────────────────

function NumInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-16 rounded border border-border bg-bg-elevated px-2 py-1 text-xs font-mono text-text-primary placeholder:text-text-muted/60 focus:border-accent-blue/50 focus:outline-none"
    />
  )
}

function RangeFilter({ label, min, max, setMin, setMax }: { label: string; min: string; max: string; setMin: (v: string) => void; setMax: (v: string) => void }) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-text-muted">
      {label}
      <NumInput value={min} onChange={setMin} placeholder="min" />
      <span className="text-text-muted/50">–</span>
      <NumInput value={max} onChange={setMax} placeholder="max" />
    </label>
  )
}
