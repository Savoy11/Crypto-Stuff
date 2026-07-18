'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronLeft, ChevronRight, Clock, Landmark, RefreshCw, Search, SlidersHorizontal } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { MetricCard } from '@/components/ui/MetricCard'
import {
  FUND_CATALOG, FUND_CATEGORY_INFO, FUND_RISK_INFO, FUND_STRATEGY_INFO,
  type FundCategoryId, type FundRiskLevel, type FundStrategy, type FundType,
} from '@/lib/data/fundCatalog'
import { SECTOR_INFO } from '@/lib/data/equityCatalog'
import { formatCompact, formatCurrency, formatPercent } from '@/lib/utils/format'
import { STALE_TIME_SHORT } from '@/lib/constants'
import type { SecurityQuotesResponse } from '@/app/live-data/security-quotes/route'
import type { SecurityReturnsResponse } from '@/app/live-data/security-returns/route'
import type { FundUniverseEntry, FundUniverseResponse } from '@/app/live-data/fund-universe/route'

type SortKey = 'symbol' | 'category' | 'price' | 'expense' | 'aum' | 'yield' | 'm1' | 'm3' | 'ytd' | 'y1'
type ColumnTab = 'overview' | 'returns'
type FundStyle = 'all' | 'index' | 'active'

const PAGE_SIZE = 50

/** Sort/display label for the category column — sector funds carry their specific sector. */
function categoryLabel(row: FundUniverseEntry): string {
  if (!row.category) return '—'
  const base = FUND_CATEGORY_INFO[row.category].label
  return row.focusSector ? `${base} · ${SECTOR_INFO[row.focusSector].label}` : base
}

const SOURCE_LABELS: Record<string, string> = {
  fmp: 'Live via Financial Modeling Prep',
  yahoo: 'Live via Yahoo Finance',
  stooq: 'Live via Stooq (intraday change)',
  reference: 'Reference prices — no live source reachable',
}

function expenseColor(pct: number): string {
  if (pct <= 0.1) return 'text-emerald-400'
  if (pct <= 0.35) return 'text-amber-400'
  return 'text-orange-400'
}

// ─── ETFdb-style range screener ───────────────────────────────────────────────

/** Every numeric dimension the screener can bound with a min/max pair. */
type RangeKey = 'expense' | 'aum' | 'age' | 'price' | 'yield' | 'm1' | 'm3' | 'ytd' | 'y1'
type Ranges = Record<RangeKey, { min: string; max: string }>
const RETURN_KEYS: RangeKey[] = ['m1', 'm3', 'ytd', 'y1']

const EMPTY_RANGES: Ranges = {
  expense: { min: '', max: '' }, aum: { min: '', max: '' }, age: { min: '', max: '' },
  price: { min: '', max: '' }, yield: { min: '', max: '' },
  m1: { min: '', max: '' }, m3: { min: '', max: '' }, ytd: { min: '', max: '' }, y1: { min: '', max: '' },
}

function rangeActive(r: { min: string; max: string }): boolean {
  return r.min.trim() !== '' || r.max.trim() !== ''
}

/** Null values fail an active bound (like ETFdb: no data = excluded from that screen). */
function inRange(value: number | null | undefined, r: { min: string; max: string }): boolean {
  if (!rangeActive(r)) return true
  if (value == null) return false
  const min = parseFloat(r.min); const max = parseFloat(r.max)
  if (isFinite(min) && value < min) return false
  if (isFinite(max) && value > max) return false
  return true
}

/** Collapsible filter group, ETFdb-sidebar style. */
function FilterGroup({ title, defaultOpen = false, active = 0, children }: {
  title: string; defaultOpen?: boolean; active?: number; children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-border/60 last:border-0">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-1.5 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-text-secondary hover:text-text-primary transition-colors"
      >
        {open ? <ChevronDown size={12} aria-hidden /> : <ChevronRight size={12} aria-hidden />}
        {title}
        {active > 0 && (
          <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-accent-blue/20 text-accent-blue text-[10px] font-bold flex items-center justify-center border border-accent-blue/30">
            {active}
          </span>
        )}
      </button>
      {open && <div className="px-3 pb-3 space-y-2.5">{children}</div>}
    </div>
  )
}

/** Min/max pair input for one screener dimension. */
function RangeField({ label, unit, range, onChange }: {
  label: string; unit?: string; range: { min: string; max: string }
  onChange: (next: { min: string; max: string }) => void
}) {
  const inputClass = 'w-full min-w-0 rounded border border-border bg-bg-elevated px-2 py-1 text-xs font-mono text-text-primary placeholder:text-text-muted/50 focus:border-accent-blue/50 focus:outline-none'
  return (
    <div>
      <p className={clsx('text-[11px] mb-1', rangeActive(range) ? 'text-accent-blue' : 'text-text-muted')}>
        {label}{unit && <span className="text-text-muted/70"> ({unit})</span>}
      </p>
      <div className="flex items-center gap-1.5">
        <input type="number" value={range.min} placeholder="Min"
          onChange={(e) => onChange({ ...range, min: e.target.value })} className={inputClass} />
        <span className="text-text-muted/50 text-xs flex-shrink-0">–</span>
        <input type="number" value={range.max} placeholder="Max"
          onChange={(e) => onChange({ ...range, max: e.target.value })} className={inputClass} />
      </div>
    </div>
  )
}

// ─── Client ───────────────────────────────────────────────────────────────────

export function FundsClient() {
  const [type, setType] = useState<FundType | 'all'>('all')
  const [category, setCategory] = useState<FundCategoryId | 'all'>('all')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('aum')
  const [sortAsc, setSortAsc] = useState(false)
  const [columnTab, setColumnTab] = useState<ColumnTab>('overview')
  const [page, setPage] = useState(0)
  // Screener filters (reference values; blank = no filter)
  const [issuer, setIssuer] = useState('all')
  const [style, setStyle] = useState<FundStyle>('all')
  const [industry, setIndustry] = useState<string>('all')
  const [riskLevel, setRiskLevel] = useState<FundRiskLevel | 'all'>('all')
  const [strategy, setStrategy] = useState<FundStrategy | 'all'>('all')
  const [curatedOnly, setCuratedOnly] = useState(false)
  const [ranges, setRanges] = useState<Ranges>(EMPTY_RANGES)
  const setRange = (key: RangeKey) => (next: { min: string; max: string }) =>
    setRanges((prev) => ({ ...prev, [key]: next }))

  const returnsFilterActive = RETURN_KEYS.some((k) => rangeActive(ranges[k]))
  const activeFilterCount =
    (type !== 'all' ? 1 : 0) + (issuer !== 'all' ? 1 : 0) + (style !== 'all' ? 1 : 0) + (curatedOnly ? 1 : 0) +
    (industry !== 'all' ? 1 : 0) + (riskLevel !== 'all' ? 1 : 0) + (strategy !== 'all' ? 1 : 0) +
    (Object.keys(ranges) as RangeKey[]).filter((k) => rangeActive(ranges[k])).length
  const clearFilters = () => {
    setType('all'); setIssuer('all'); setStyle('all'); setCuratedOnly(false)
    setIndustry('all'); setRiskLevel('all'); setStrategy('all'); setRanges(EMPTY_RANGES)
  }

  // ── Universe: every US-listed ETF (NASDAQ directory) + curated catalog ──
  const { data: universeData, isLoading, refetch, isFetching } = useQuery<FundUniverseResponse>({
    queryKey: ['fund-universe'],
    queryFn: () => fetch('/live-data/fund-universe').then((r) => r.json()),
    staleTime: 1000 * 60 * 30,
  })
  const universe = useMemo(() => universeData?.entries ?? [], [universeData])

  // Trailing returns for the curated catalog — powers the return-range screens.
  const { data: returnsFilterData } = useQuery<SecurityReturnsResponse>({
    queryKey: ['security-returns', 'funds'],
    queryFn: () => fetch('/live-data/security-returns?universe=funds').then((r) => r.json()),
    staleTime: 1000 * 60 * 15,
    enabled: returnsFilterActive || columnTab === 'returns',
  })

  // ── Filter + sort the whole universe (facts-based; quotes are page-scoped) ──
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    const nowYear = new Date().getFullYear()
    const ret = (row: FundUniverseEntry) => returnsFilterData?.returns?.[row.symbol]
    const subset = universe.filter((row) =>
      (!curatedOnly || row.inCatalog) &&
      (type === 'all' || row.type === type) &&
      (category === 'all' || row.category === category) &&
      (industry === 'all' || row.focusIndustry === industry) &&
      (riskLevel === 'all' || row.riskLevel === riskLevel) &&
      (strategy === 'all' || row.strategy === strategy) &&
      (issuer === 'all' || row.issuer === issuer) &&
      (style === 'all' || (row.inCatalog && (style === 'active' ? row.indexTracked == null : row.indexTracked != null))) &&
      inRange(row.expenseRatioPct, ranges.expense) &&
      inRange(row.aumB, ranges.aum) &&
      inRange(row.inceptionYear != null ? nowYear - row.inceptionYear : null, ranges.age) &&
      inRange(row.referencePrice, ranges.price) &&
      inRange(row.yieldPct, ranges.yield) &&
      inRange(ret(row)?.m1, ranges.m1) &&
      inRange(ret(row)?.m3, ranges.m3) &&
      inRange(ret(row)?.ytd, ranges.ytd) &&
      inRange(ret(row)?.y1, ranges.y1) &&
      (!query ||
        row.symbol.toLowerCase().includes(query) ||
        row.name.toLowerCase().includes(query) ||
        (row.issuer?.toLowerCase().includes(query) ?? false) ||
        categoryLabel(row).toLowerCase().includes(query) ||
        (row.focusIndustry?.toLowerCase().includes(query) ?? false))
    )
    const dir = sortAsc ? 1 : -1
    const value = (row: FundUniverseEntry): number | string => {
      switch (sortKey) {
        case 'symbol':   return row.symbol
        case 'category': return categoryLabel(row)
        case 'price':    return row.referencePrice ?? -Infinity
        case 'expense':  return row.expenseRatioPct ?? (sortAsc ? Infinity : -Infinity)
        case 'yield':    return row.yieldPct ?? -Infinity
        case 'm1':       return ret(row)?.m1 ?? -Infinity
        case 'm3':       return ret(row)?.m3 ?? -Infinity
        case 'ytd':      return ret(row)?.ytd ?? -Infinity
        case 'y1':       return ret(row)?.y1 ?? -Infinity
        default:         return row.aumB ?? -Infinity
      }
    }
    return [...subset].sort((a, b) => {
      const va = value(a); const vb = value(b)
      if (typeof va === 'string' && typeof vb === 'string') return va.localeCompare(vb) * dir
      return ((va as number) - (vb as number)) * dir
    })
  }, [universe, type, category, industry, riskLevel, strategy, issuer, style, curatedOnly, ranges, search, sortKey, sortAsc, returnsFilterData])

  // Reset to first page whenever the result set changes
  useEffect(() => { setPage(0) }, [type, category, industry, riskLevel, strategy, issuer, style, curatedOnly, ranges, search, sortKey, sortAsc])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const pageEntries = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)
  const pageSymbols = pageEntries.map((e) => e.symbol)

  // ── Live quotes for the visible page only ──
  const { data: quoteData } = useQuery<SecurityQuotesResponse>({
    queryKey: ['security-quotes', 'funds-page', pageSymbols.join(',')],
    queryFn: () => fetch(`/live-data/security-quotes?symbols=${encodeURIComponent(pageSymbols.join(','))}`).then((r) => r.json()),
    enabled: pageSymbols.length > 0,
    staleTime: STALE_TIME_SHORT,
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  })

  // Returns for the visible page (display); merged with the catalog-wide set.
  const { data: pageReturnsData } = useQuery<SecurityReturnsResponse>({
    queryKey: ['security-returns', 'funds-page', pageSymbols.join(',')],
    queryFn: () => fetch(`/live-data/security-returns?symbols=${encodeURIComponent(pageSymbols.join(','))}`).then((r) => r.json()),
    enabled: columnTab === 'returns' && pageSymbols.length > 0,
    staleTime: 1000 * 60 * 15,
    placeholderData: keepPreviousData,
  })
  const displayReturns = (symbol: string) =>
    pageReturnsData?.returns?.[symbol] ?? returnsFilterData?.returns?.[symbol]

  const rows = pageEntries.map((e) => {
    const quote = quoteData?.quotes?.[e.symbol.toUpperCase()]
    const live = !!quote && quoteData?.source !== 'reference' && !quote.reference
    return {
      ...e,
      price: quote?.price ?? e.referencePrice,
      changePercent: live ? quote?.changePercent ?? null : null,
      live,
    }
  })

  const curated = filtered.filter((f) => f.inCatalog)
  const avgExpense = curated.length
    ? curated.reduce((s, f) => s + (f.expenseRatioPct ?? 0), 0) / curated.length
    : 0
  const cheapest = curated.length
    ? curated.reduce((best, f) => ((f.expenseRatioPct ?? Infinity) < (best.expenseRatioPct ?? Infinity) ? f : best))
    : null

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((a) => !a)
    else { setSortKey(key); setSortAsc(key === 'symbol' || key === 'category' || key === 'expense') }
  }

  const issuers = useMemo(() => Array.from(new Set(FUND_CATALOG.map((f) => f.issuer))).sort(), [])
  const industries = useMemo(
    () => Array.from(new Set(FUND_CATALOG.map((f) => f.focusIndustry).filter((i): i is string => !!i))).sort(),
    [],
  )
  const returnsMissing = columnTab === 'returns' && pageReturnsData != null && pageReturnsData.source === 'none'

  const SortHeader = ({ label, colKey }: { label: string; colKey: SortKey }) => (
    <button
      onClick={() => toggleSort(colKey)}
      className={clsx('flex items-center gap-1 text-xs font-medium uppercase tracking-wider transition-colors',
        sortKey === colKey ? 'text-accent-blue' : 'text-text-muted hover:text-text-secondary')}
    >
      {label}
      {sortKey === colKey
        ? (sortAsc ? <ArrowUp size={11} aria-hidden /> : <ArrowDown size={11} aria-hidden />)
        : <ArrowUpDown size={11} className="opacity-40" aria-hidden />}
    </button>
  )

  const discovered = universeData?.discovered ?? 0

  return (
    <div className="space-y-6 max-w-screen-2xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <PageHeader
          title="Fund Registry"
          subtitle={discovered > 0
            ? `${universe.length.toLocaleString()} funds — ${(universeData?.discoveredEtfs ?? 0).toLocaleString()} listed ETFs + ${(universeData?.discoveredMutual ?? 0).toLocaleString()} mutual fund classes + ${FUND_CATALOG.length} curated`
            : `${FUND_CATALOG.length} curated ETFs and mutual funds`}
          icon={<Landmark size={20} aria-hidden />}
          description="Every US-listed ETF (NASDAQ symbol directory) and SEC-registered mutual fund share class (SEC series/class dataset), plus a curated set carrying expense ratios, AUM, categories, and yields. Live quotes load for the visible page; any fund's detail page pulls its full portfolio from SEC N-PORT filings."
          details={[
            { label: 'Universe', text: universeData ? (discovered > 0 ? `${universeData.discoveredEtfs.toLocaleString()} listed ETFs (NASDAQ) + ${universeData.discoveredMutual.toLocaleString()} mutual fund classes (SEC) discovered beyond the catalog.` : 'Live directories unreachable — curated catalog only.') : 'Loading…' },
            { label: 'Fund facts', text: 'Expense ratio, AUM, yield, and category exist for curated funds; facts-based screens exclude funds without data.' },
          ]}
        />
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search symbol, name, issuer…"
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

      {/* Per-directory outage notices — a silent half-universe looks like a bug */}
      {universeData?.etfError && (
        <div className="flex items-start gap-2 rounded border border-amber-500/20 bg-amber-500/5 px-4 py-2.5">
          <p className="text-xs text-text-muted leading-relaxed">
            <span className="font-medium text-amber-400">ETF directory unreachable</span> — only curated ETFs
            are searchable right now. <span className="text-text-muted/80">{universeData.etfError}</span>{' '}
            Hit Refresh to retry.
          </p>
        </div>
      )}
      {universeData?.mutualError && (
        <div className="flex items-start gap-2 rounded border border-amber-500/20 bg-amber-500/5 px-4 py-2.5">
          <p className="text-xs text-text-muted leading-relaxed">
            <span className="font-medium text-amber-400">SEC mutual fund dataset unreachable</span> — only curated
            mutual funds are searchable right now. <span className="text-text-muted/80">{universeData.mutualError}</span>{' '}
            Hit Refresh to retry.
          </p>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard title="Funds Shown" loading={isLoading} value={filtered.length.toLocaleString()} subtitle={`of ${universe.length.toLocaleString()} in universe`} accentColor="#3b82f6" />
        <MetricCard title="Curated Matches" loading={isLoading} value={String(curated.length)} subtitle="with full reference facts" accentColor="#14b8a6" />
        <MetricCard title="Avg Expense Ratio" loading={isLoading} value={curated.length ? `${avgExpense.toFixed(2)}%` : '—'} subtitle="curated matches" accentColor="#f59e0b" />
        <MetricCard title="Cheapest Curated" loading={isLoading} value={cheapest?.symbol ?? '—'} subtitle={cheapest?.expenseRatioPct != null ? `${cheapest.expenseRatioPct}% expense ratio` : undefined} accentColor="#10b981" />
      </div>

      {/* Category filter chips */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setCategory('all')}
            className={clsx('px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
              category === 'all'
                ? 'bg-accent-blue/15 text-accent-blue border-accent-blue/30'
                : 'text-text-muted border-border hover:text-text-secondary hover:bg-bg-elevated')}
          >
            All Categories
          </button>
          {(Object.entries(FUND_CATEGORY_INFO) as Array<[FundCategoryId, { label: string; color: string }]>).map(([id, info]) => (
            <button
              key={id}
              onClick={() => setCategory(category === id ? 'all' : id)}
              className={clsx('flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                category === id
                  ? 'bg-accent-blue/15 text-accent-blue border-accent-blue/30'
                  : 'text-text-muted border-border hover:text-text-secondary hover:bg-bg-elevated')}
            >
              <span className="size-1.5 rounded-full" style={{ backgroundColor: info.color }} aria-hidden />
              {info.label}
            </button>
          ))}
        </div>
      </div>

      {/* Screener sidebar + results (ETFdb-style) */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <aside className="w-full lg:w-64 flex-shrink-0 rounded-card border border-border bg-bg-card overflow-hidden lg:sticky lg:top-[calc(theme(spacing.topbar)+1rem)]">
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border bg-bg-elevated/40">
            <SlidersHorizontal size={13} className="text-text-muted" aria-hidden />
            <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">Screener</span>
            {activeFilterCount > 0 && (
              <>
                <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-accent-blue/20 text-accent-blue text-[10px] font-bold flex items-center justify-center border border-accent-blue/30">
                  {activeFilterCount}
                </span>
                <button onClick={clearFilters} className="ml-auto text-[11px] text-accent-blue hover:underline">
                  Clear all
                </button>
              </>
            )}
          </div>

          <FilterGroup title="Structure" defaultOpen active={(type !== 'all' ? 1 : 0) + (style !== 'all' ? 1 : 0) + (issuer !== 'all' ? 1 : 0) + (curatedOnly ? 1 : 0)}>
            <div>
              <p className="text-[11px] text-text-muted mb-1">Fund type</p>
              <div className="flex items-center gap-0.5 bg-bg-elevated border border-border rounded p-0.5">
                {([['all', 'All'], ['etf', 'ETFs'], ['mutual', 'Mutual']] as Array<[FundType | 'all', string]>).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setType(value)}
                    className={clsx('flex-1 px-2 py-1 rounded text-[11px] font-medium transition-colors',
                      type === value ? 'bg-accent-blue/20 text-accent-blue' : 'text-text-muted hover:text-text-secondary')}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[11px] text-text-muted mb-1">Management style</p>
              <div className="flex items-center gap-0.5 bg-bg-elevated border border-border rounded p-0.5">
                {([['all', 'All'], ['index', 'Index'], ['active', 'Active']] as Array<[FundStyle, string]>).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setStyle(value)}
                    className={clsx('flex-1 px-2 py-1 rounded text-[11px] font-medium transition-colors',
                      style === value ? 'bg-accent-blue/20 text-accent-blue' : 'text-text-muted hover:text-text-secondary')}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[11px] text-text-muted mb-1">Issuer</p>
              <select
                value={issuer}
                onChange={(e) => setIssuer(e.target.value)}
                className="w-full rounded border border-border bg-bg-elevated px-2 py-1.5 text-xs text-text-primary focus:border-accent-blue/50 focus:outline-none"
              >
                <option value="all">All issuers</option>
                {issuers.map((i) => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 text-[11px] text-text-muted cursor-pointer">
              <input
                type="checkbox"
                checked={curatedOnly}
                onChange={(e) => setCuratedOnly(e.target.checked)}
                className="accent-blue-500"
              />
              Curated funds only (full reference facts)
            </label>
          </FilterGroup>

          <FilterGroup title="Classification" defaultOpen active={(industry !== 'all' ? 1 : 0) + (riskLevel !== 'all' ? 1 : 0) + (strategy !== 'all' ? 1 : 0)}>
            <div>
              <p className="text-[11px] text-text-muted mb-1">Industry focus</p>
              <select
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                className="w-full rounded border border-border bg-bg-elevated px-2 py-1.5 text-xs text-text-primary focus:border-accent-blue/50 focus:outline-none"
              >
                <option value="all">All industries</option>
                {industries.map((i) => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div>
              <p className="text-[11px] text-text-muted mb-1">Risk profile</p>
              <select
                value={riskLevel}
                onChange={(e) => setRiskLevel(e.target.value as FundRiskLevel | 'all')}
                className="w-full rounded border border-border bg-bg-elevated px-2 py-1.5 text-xs text-text-primary focus:border-accent-blue/50 focus:outline-none"
              >
                <option value="all">All risk profiles</option>
                {(Object.entries(FUND_RISK_INFO) as Array<[FundRiskLevel, { label: string }]>).map(([id, info]) => (
                  <option key={id} value={id}>{info.label}</option>
                ))}
              </select>
            </div>
            <div>
              <p className="text-[11px] text-text-muted mb-1">Strategy</p>
              <select
                value={strategy}
                onChange={(e) => setStrategy(e.target.value as FundStrategy | 'all')}
                className="w-full rounded border border-border bg-bg-elevated px-2 py-1.5 text-xs text-text-primary focus:border-accent-blue/50 focus:outline-none"
                title={strategy !== 'all' ? FUND_STRATEGY_INFO[strategy].description : undefined}
              >
                <option value="all">All strategies</option>
                {(Object.entries(FUND_STRATEGY_INFO) as Array<[FundStrategy, { label: string }]>).map(([id, info]) => (
                  <option key={id} value={id}>{info.label}</option>
                ))}
              </select>
            </div>
            <p className="text-[10px] text-text-muted/80 leading-relaxed">
              Risk profile is derived from category + strategy (leveraged/inverse and crypto rank Speculative).
              Classification screens cover the curated set; non-catalog funds are excluded while one is set.
            </p>
          </FilterGroup>

          <FilterGroup title="Expenses & Size" defaultOpen active={['expense', 'aum', 'age'].filter((k) => rangeActive(ranges[k as RangeKey])).length}>
            <RangeField label="Expense ratio" unit="%" range={ranges.expense} onChange={setRange('expense')} />
            <RangeField label="Assets (AUM)" unit="$B" range={ranges.aum} onChange={setRange('aum')} />
            <RangeField label="Fund age" unit="years" range={ranges.age} onChange={setRange('age')} />
          </FilterGroup>

          <FilterGroup title="Trading" active={rangeActive(ranges.price) ? 1 : 0}>
            <RangeField label="Price / NAV" unit="$" range={ranges.price} onChange={setRange('price')} />
          </FilterGroup>

          <FilterGroup title="Dividend" active={rangeActive(ranges.yield) ? 1 : 0}>
            <RangeField label="Distribution yield" unit="%" range={ranges.yield} onChange={setRange('yield')} />
          </FilterGroup>

          <FilterGroup title="Returns" active={RETURN_KEYS.filter((k) => rangeActive(ranges[k])).length}>
            <RangeField label="1 month return" unit="%" range={ranges.m1} onChange={setRange('m1')} />
            <RangeField label="3 month return" unit="%" range={ranges.m3} onChange={setRange('m3')} />
            <RangeField label="YTD return" unit="%" range={ranges.ytd} onChange={setRange('ytd')} />
            <RangeField label="1 year return" unit="%" range={ranges.y1} onChange={setRange('y1')} />
            <p className="text-[10px] text-text-muted/80 leading-relaxed">
              Price returns from daily closes, excl. distributions. Return screens cover the curated set; other funds are excluded while a bound is set.
              {returnsFilterActive && returnsFilterData?.source === 'none' && (
                <span className="text-amber-400/80"> Price-history source unreachable — return screens exclude all funds.</span>
              )}
            </p>
          </FilterGroup>
        </aside>

        <div className="flex-1 min-w-0 space-y-4 w-full">
          {/* Column set tabs + match count */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-0.5 bg-bg-elevated border border-border rounded p-0.5 w-fit">
              {([['overview', 'Overview'], ['returns', 'Returns']] as Array<[ColumnTab, string]>).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setColumnTab(value)}
                  className={clsx('px-2.5 py-1 rounded text-xs font-medium transition-colors',
                    columnTab === value ? 'bg-accent-blue/20 text-accent-blue' : 'text-text-muted hover:text-text-secondary')}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="text-[11px] text-text-muted">{filtered.length.toLocaleString()} match{filtered.length !== 1 ? 'es' : ''}</span>
          </div>

          {/* Table */}
          <div className="rounded-card border border-border bg-bg-card overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-4 py-2.5 border-b border-border bg-bg-elevated/40">
              <div className="col-span-4"><SortHeader label="Fund" colKey="symbol" /></div>
              <div className="col-span-2"><SortHeader label="Category" colKey="category" /></div>
              <div className="col-span-2 flex justify-end"><SortHeader label="Price / NAV" colKey="price" /></div>
              {columnTab === 'overview' ? (
                <>
                  <div className="col-span-1 flex justify-end"><span className="text-xs font-medium uppercase tracking-wider text-text-muted">Chg %</span></div>
                  <div className="col-span-1 flex justify-end"><SortHeader label="Expense" colKey="expense" /></div>
                  <div className="col-span-1 flex justify-end"><SortHeader label="AUM" colKey="aum" /></div>
                  <div className="col-span-1 flex justify-end"><SortHeader label="Yield" colKey="yield" /></div>
                </>
              ) : (
                <>
                  <div className="col-span-1 flex justify-end"><SortHeader label="1M" colKey="m1" /></div>
                  <div className="col-span-1 flex justify-end"><SortHeader label="3M" colKey="m3" /></div>
                  <div className="col-span-1 flex justify-end"><SortHeader label="YTD" colKey="ytd" /></div>
                  <div className="col-span-1 flex justify-end"><SortHeader label="1Y" colKey="y1" /></div>
                </>
              )}
            </div>

            <div className="divide-y divide-border/60">
              {isLoading && rows.length === 0
                ? Array.from({ length: 10 }, (_, i) => (
                    <div key={i} className="h-12 animate-shimmer bg-shimmer-gradient bg-[length:200%_100%]" />
                  ))
                : rows.map((row) => {
                    const change = row.changePercent
                    return (
                      <Link
                        key={row.symbol}
                        href={`/funds/${row.symbol.toLowerCase()}`}
                        className="grid grid-cols-12 gap-2 px-4 py-2.5 text-sm items-center hover:bg-bg-elevated/40 transition-colors"
                      >
                        <div className="col-span-4 min-w-0 flex items-center gap-2">
                          <span className={clsx('px-1.5 py-0.5 rounded text-[9px] font-bold border flex-shrink-0',
                            row.type === 'etf'
                              ? 'text-accent-blue bg-accent-blue/10 border-accent-blue/20'
                              : 'text-violet-400 bg-violet-400/10 border-violet-500/20')}>
                            {row.type === 'etf' ? 'ETF' : 'MF'}
                          </span>
                          <span className="font-mono font-semibold text-text-primary flex-shrink-0">{row.symbol}</span>
                          {(row.strategy === 'leveraged' || row.strategy === 'inverse') && (
                            <span
                              className={clsx('px-1 py-0.5 rounded text-[9px] font-bold border flex-shrink-0',
                                row.strategy === 'leveraged'
                                  ? 'text-amber-400 bg-amber-400/10 border-amber-400/20'
                                  : 'text-red-400 bg-red-400/10 border-red-500/20')}
                              title={FUND_STRATEGY_INFO[row.strategy].description}
                            >
                              {row.strategy === 'leveraged' ? 'LEV' : 'INV'}
                            </span>
                          )}
                          {row.tradingRestriction && (
                            <Clock size={11} className="text-amber-400/80 flex-shrink-0" aria-label="Trading restriction" />
                          )}
                          <span className="text-xs text-text-muted truncate" title={row.tradingRestriction ?? undefined}>{row.name}</span>
                        </div>
                        <div className="col-span-2 min-w-0">
                          {row.category ? (
                            <span
                              className="inline-flex max-w-full items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium border border-border text-text-secondary"
                              title={row.focusIndustry ? `${categoryLabel(row)} — ${row.focusIndustry}` : undefined}
                            >
                              <span
                                className="size-1.5 rounded-full flex-shrink-0"
                                style={{ backgroundColor: row.focusSector ? SECTOR_INFO[row.focusSector].color : FUND_CATEGORY_INFO[row.category].color }}
                                aria-hidden
                              />
                              {row.focusSector ? (
                                <span className="truncate">
                                  {SECTOR_INFO[row.focusSector].label}
                                  {row.focusIndustry && <span className="text-text-muted"> · {row.focusIndustry}</span>}
                                </span>
                              ) : (
                                FUND_CATEGORY_INFO[row.category].label
                              )}
                            </span>
                          ) : (
                            <span className="text-xs text-text-muted/60">—</span>
                          )}
                        </div>
                        <div className="col-span-2 text-right font-mono tabular-nums text-text-primary">
                          {row.price != null ? formatCurrency(row.price) : <span className="text-text-muted">—</span>}
                          {row.price != null && !row.live && <span className="ml-1 text-[9px] text-amber-400/80 align-top" title="Reference price — live source unreachable">ref</span>}
                        </div>
                        {columnTab === 'overview' ? (
                          <>
                            <div className={clsx('col-span-1 text-right font-mono tabular-nums text-xs',
                              change == null ? 'text-text-muted' : change >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                              {change == null ? '—' : formatPercent(change, 2)}
                            </div>
                            <div className={clsx('col-span-1 text-right font-mono tabular-nums text-xs',
                              row.expenseRatioPct != null ? expenseColor(row.expenseRatioPct) : 'text-text-muted')}>
                              {row.expenseRatioPct != null ? `${row.expenseRatioPct.toFixed(row.expenseRatioPct < 0.1 ? 3 : 2)}%` : '—'}
                            </div>
                            <div className="col-span-1 text-right font-mono tabular-nums text-xs text-text-secondary">
                              {row.aumB != null ? formatCompact(row.aumB * 1e9) : '—'}
                            </div>
                            <div className="col-span-1 text-right font-mono tabular-nums text-xs text-text-secondary">
                              {row.yieldPct != null ? `${row.yieldPct.toFixed(1)}%` : '—'}
                            </div>
                          </>
                        ) : (
                          [displayReturns(row.symbol)?.m1, displayReturns(row.symbol)?.m3,
                           displayReturns(row.symbol)?.ytd, displayReturns(row.symbol)?.y1].map((r, i) => (
                            <div key={i} className={clsx('col-span-1 text-right font-mono tabular-nums text-xs',
                              r == null ? 'text-text-muted' : r >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                              {r == null ? '—' : formatPercent(r, 1)}
                            </div>
                          ))
                        )}
                      </Link>
                    )
                  })}
              {!isLoading && filtered.length === 0 && (
                <p className="px-4 py-8 text-center text-sm text-text-muted">No funds match the current filters.</p>
              )}
            </div>

            {/* Pagination */}
            {filtered.length > PAGE_SIZE && (
              <div className="flex items-center justify-between px-4 py-2.5 border-t border-border">
                <span className="text-[11px] text-text-muted font-mono">
                  {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} of {filtered.length.toLocaleString()}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setPage(Math.max(0, safePage - 1))}
                    disabled={safePage === 0}
                    className="flex items-center gap-1 px-2 py-1 rounded border border-border text-xs text-text-secondary hover:text-text-primary hover:bg-bg-elevated disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft size={12} aria-hidden /> Prev
                  </button>
                  <span className="text-[11px] text-text-muted font-mono px-1">
                    {safePage + 1} / {totalPages.toLocaleString()}
                  </span>
                  <button
                    onClick={() => setPage(Math.min(totalPages - 1, safePage + 1))}
                    disabled={safePage >= totalPages - 1}
                    className="flex items-center gap-1 px-2 py-1 rounded border border-border text-xs text-text-secondary hover:text-text-primary hover:bg-bg-elevated disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Next <ChevronRight size={12} aria-hidden />
                  </button>
                </div>
              </div>
            )}

            {returnsMissing && (
              <p className="px-4 py-2 border-t border-border text-[11px] text-amber-400/80">
                Trailing returns unavailable — price-history source unreachable. Columns show — instead of stale values.
              </p>
            )}
            {columnTab === 'returns' && !returnsMissing && (
              <p className="px-4 py-2 border-t border-border text-[11px] text-text-muted">
                Trailing price returns from daily closes (Yahoo Finance) · YTD measured from last close of the prior year · excludes distributions
              </p>
            )}
          </div>
        </div>
      </div>

      <p className="text-[11px] text-text-muted text-center">
        {quoteData ? SOURCE_LABELS[quoteData.source] ?? quoteData.source : 'Loading…'}
        {quoteData?.updatedAt && ` · quotes updated ${new Date(quoteData.updatedAt).toLocaleTimeString()} (visible page)`}
        {' · '}Expense ratios, AUM, and yields are reference snapshots for curated funds
      </p>
    </div>
  )
}
