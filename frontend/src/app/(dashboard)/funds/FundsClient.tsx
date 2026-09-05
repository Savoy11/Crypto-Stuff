'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronLeft, ChevronRight, Clock, ExternalLink, Landmark, RefreshCw, Search, SlidersHorizontal } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { SourceLine } from '@/components/ui/SourceLine'
import { MetricCard } from '@/components/ui/MetricCard'
import {
  FUND_CATALOG, FUND_CATEGORY_INFO, FUND_RISK_INFO, FUND_STRATEGY_INFO, fundTradingRestriction,
  getFund,
  type FundCategoryId, type FundRiskLevel, type FundStrategy, type FundType,
} from '@/lib/data/fundCatalog'
import {
  feeImpact, DEFAULT_FEE_IMPACT_PARAMS, FEE_IMPACT_BENCHMARK_ER_PCT, type FeeImpactParams,
} from '@/lib/data/feeImpact'
import { SECTOR_INFO } from '@/lib/data/equityCatalog'
import { formatCompact, formatCurrency, formatPercent } from '@/lib/utils/format'
import { STALE_TIME_SHORT } from '@/lib/constants'
import { useScreenerUrl } from '@/lib/hooks/useScreenerUrl'
import type { SecurityQuotesResponse } from '@/app/live-data/security-quotes/route'
import type { SecurityReturnsResponse } from '@/app/live-data/security-returns/route'
import type { DiscoveredFund, FundUniverseEntry, FundUniverseResponse } from '@/app/live-data/fund-universe/route'

type SortKey = 'symbol' | 'category' | 'price' | 'expense' | 'aum' | 'yield' | 'feecost' | 'm1' | 'm3' | 'ytd' | 'y1'
type ColumnTab = 'overview' | 'returns' | 'fees'
type FundStyle = 'all' | 'index' | 'active'

const PAGE_SIZE = 50

/**
 * Expand a compact discovered fund back into the full entry shape the screener
 * operates on. Mirrors the route's server-side `skeleton()` — both are pinned
 * to FundUniverseEntry so drift is a compile error, and the function cannot be
 * shared because route files may only export handlers and types (exporting a
 * helper from a route is exactly the C1 build break). The route sends compact
 * rows because ~30k full-shape entries, 14 fields of them always null, was a
 * 14 MB response (audit follow-up F3).
 */
function hydrateDiscovered(e: DiscoveredFund, type: FundType): FundUniverseEntry {
  return {
    symbol: e.symbol, name: e.name, type, inCatalog: false,
    category: null, issuer: null, expenseRatioPct: null, aumB: null,
    referencePrice: null, yieldPct: null, inceptionYear: null,
    indexTracked: null, focusSector: null, focusIndustry: null,
    website: null, strategy: null, riskLevel: null,
    // Same honest generic policy note the route applies to uncurated mutuals.
    tradingRestriction: type === 'mutual' ? fundTradingRestriction({ tradingRestriction: undefined, type, issuer: '' }) : null,
  }
}

/** Sort/display label for the category column — sector funds carry their specific sector. */
function categoryLabel(row: FundUniverseEntry): string {
  if (!row.category) return '—'
  const base = FUND_CATEGORY_INFO[row.category].label
  return row.focusSector ? `${base} · ${SECTOR_INFO[row.focusSector].label}` : base
}

const SOURCE_LABELS: Record<string, string> = {
  fmp: 'Live via Financial Modeling Prep',
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
  // Fee-impact assumptions (S6 item 3) — one set for the whole table, so every
  // row is compared under identical conditions.
  const [feeParams, setFeeParams] = useState<FeeImpactParams>(DEFAULT_FEE_IMPACT_PARAMS)
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

  // Deep-linkable screener state — /funds?type=etf&cat=sector&r_expense=:0.2
  // Ranges serialize one param per dimension as "min:max" (either side blank).
  useScreenerUrl(
    {
      type, cat: category, issuer, style, industry, risk: riskLevel, strategy,
      curated: curatedOnly ? '1' : '', q: search, sort: sortKey, dir: sortAsc ? 'asc' : 'desc',
      ...Object.fromEntries((Object.keys(ranges) as RangeKey[]).map((k) => {
        const r = ranges[k]
        return [`r_${k}`, r.min === '' && r.max === '' ? '' : `${r.min}:${r.max}`]
      })),
    },
    {
      type: 'all', cat: 'all', issuer: 'all', style: 'all', industry: 'all', risk: 'all', strategy: 'all',
      curated: '', q: '', sort: 'aum', dir: 'desc',
      ...Object.fromEntries((Object.keys(EMPTY_RANGES) as RangeKey[]).map((k) => [`r_${k}`, ''])),
    },
    (p) => {
      if (p.type === 'etf' || p.type === 'mutual') setType(p.type)
      if (p.cat && (p.cat === 'all' || p.cat in FUND_CATEGORY_INFO)) setCategory(p.cat as FundCategoryId | 'all')
      if (p.issuer) setIssuer(p.issuer)
      if (p.style === 'index' || p.style === 'active') setStyle(p.style)
      if (p.industry) setIndustry(p.industry)
      if (p.risk && (p.risk === 'all' || p.risk in FUND_RISK_INFO)) setRiskLevel(p.risk as FundRiskLevel | 'all')
      if (p.strategy && (p.strategy === 'all' || p.strategy in FUND_STRATEGY_INFO)) setStrategy(p.strategy as FundStrategy | 'all')
      if (p.curated === '1') setCuratedOnly(true)
      if (p.q) setSearch(p.q)
      if (p.sort && ['symbol', 'category', 'price', 'expense', 'aum', 'yield', 'feecost', 'm1', 'm3', 'ytd', 'y1'].includes(p.sort)) setSortKey(p.sort as SortKey)
      if (p.dir) setSortAsc(p.dir === 'asc')
      const rangePatch: Partial<Ranges> = {}
      for (const k of Object.keys(EMPTY_RANGES) as RangeKey[]) {
        const v = p[`r_${k}`]
        if (!v || !v.includes(':')) continue
        const [min, max] = v.split(':', 2)
        rangePatch[k] = { min, max }
      }
      // Return bounds from an old deep link are dropped rather than restored:
      // nothing applies them any more, and a filter chip counting a bound that
      // does nothing is worse than losing the bound.
      for (const k of RETURN_KEYS) delete rangePatch[k]
      if (Object.keys(rangePatch).length > 0) setRanges((prev) => ({ ...prev, ...rangePatch }))
    },
  )

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
  const universe = useMemo(() => {
    if (!universeData) return []
    return [
      ...universeData.entries,
      ...(universeData.discoveredEtfList ?? []).map((e) => hydrateDiscovered(e, 'etf')),
      ...(universeData.discoveredMutualList ?? []).map((e) => hydrateDiscovered(e, 'mutual')),
    ]
  }, [universeData])

  // NOTE (2026-08-06): there is no catalog-wide returns query any more.
  //
  // The return-range SCREENS and return SORTING were fed by one call that
  // priced the whole 118-fund catalog in a handful of batched requests. That
  // batching was Yahoo's, and Yahoo was removed as a data source on terms
  // grounds (lib/server/sourceTerms.ts). What is left costs one upstream
  // request per symbol, so a catalog-wide sweep on every keystroke is not a
  // trade worth making — and a screen that quietly saw only the visible page
  // would sort and filter as though it had seen everything, which is the
  // failure this codebase treats as worse than an empty state.
  //
  // Returns are therefore PAGE-SCOPED now: the Returns columns are live and
  // correct for the rows on screen, while screening and sorting by return are
  // disabled with an on-page explanation. Restoring them needs a provider that
  // batches trailing returns — then re-add the universe query and drop the
  // RETURNS_UNAVAILABLE guards below.
  //
  // ── Sourcing revisit, 2026-08-15 (P3-W2 item 12) ──
  // A batching provider DOES exist, and it is one we already pay attention to.
  // FMP's `/stable/stock-price-change?symbol=X` returns 1D/5D/1M/3M/6M/ytd/1Y/
  // 3Y/5Y/10Y/max directly — the four windows this table wants, with no series
  // download and no computeReturns step. Verified against a live FMP key:
  //   • single symbol            → works on the current plan
  //   • comma-separated symbols  → refused, "requires a higher plan"
  //   • full-etf-quotes (whole   → Ultimate/Enterprise only
  //     ETF market in one call)
  // So whole-universe screening is now a PURCHASING decision, not an
  // engineering one: the endpoint is right there behind a paid tier. Until
  // that tier is bought, nothing changes here — 118+ single-symbol requests to
  // populate one screen is the same trade this note already rejected.
  //
  // ⚠ If FMP is ever wired in as a returns source, it CANNOT be silently mixed
  // with Tiingo: FMP reports a price change, while fetchTiingoSeries computes
  // on adjusted closes (total return). For SPY that gap is the distribution
  // yield — 1Y price +20.65% vs total return ~+22%. Two bases in one column,
  // unlabelled, is the failure the two-tier FX converter exists to avoid.

  // ── Filter + sort the whole universe (facts-based; quotes are page-scoped) ──
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    const nowYear = new Date().getFullYear()
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
      (!query ||
        row.symbol.toLowerCase().includes(query) ||
        row.name.toLowerCase().includes(query) ||
        (row.issuer?.toLowerCase().includes(query) ?? false) ||
        categoryLabel(row).toLowerCase().includes(query) ||
        (row.focusIndustry?.toLowerCase().includes(query) ?? false))
    )
    const dir = sortAsc ? 1 : -1
    // Catalog rows resolve through getFund so a verified sales load reaches the
    // maths; hydrated universe rows have no ER and correctly yield null.
    const impactOf = (row: FundUniverseEntry) =>
      feeImpact(getFund(row.symbol) ?? { expenseRatioPct: row.expenseRatioPct as number, type: row.type, issuer: row.issuer ?? '' }, feeParams)
    const value = (row: FundUniverseEntry): number | string => {
      switch (sortKey) {
        case 'symbol':   return row.symbol
        case 'category': return categoryLabel(row)
        case 'price':    return row.referencePrice ?? -Infinity
        case 'expense':  return row.expenseRatioPct ?? (sortAsc ? Infinity : -Infinity)
        case 'yield':    return row.yieldPct ?? -Infinity
        // Unknown fees must never sort as free — see feeImpact's null contract.
        case 'feecost':  return impactOf(row)?.costUsd ?? (sortAsc ? Infinity : -Infinity)
        // Return keys fall through to AUM on purpose: sorting the universe by a
        // figure known only for the visible page would reorder nothing while
        // looking like it had. The headers are non-sortable to match.
        case 'm1': case 'm3': case 'ytd': case 'y1':
                         return row.aumB ?? -Infinity
        default:         return row.aumB ?? -Infinity
      }
    }
    return [...subset].sort((a, b) => {
      const va = value(a); const vb = value(b)
      if (typeof va === 'string' && typeof vb === 'string') return va.localeCompare(vb) * dir
      return ((va as number) - (vb as number)) * dir
    })
  }, [universe, type, category, industry, riskLevel, strategy, issuer, style, curatedOnly, ranges, search, sortKey, sortAsc, feeParams])

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
  const displayReturns = (symbol: string) => pageReturnsData?.returns?.[symbol]

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

      {/* Data provenance */}
      <SourceLine id="fund-universe" />

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
            <p className="text-[11px] text-text-muted leading-relaxed">
              Screening by trailing return is unavailable. It needed a source that could price the
              whole catalog in one batched call; that source was withdrawn on terms grounds, and the
              remaining providers charge one request per symbol. A screen that could only see the
              current page would filter as though it had seen every fund, so it is off rather than
              wrong.
            </p>
            <p className="text-[10px] text-text-muted/80 leading-relaxed">
              Trailing returns are still shown, live, for the funds on the current page — switch the
              table to the <span className="text-text-secondary">Returns</span> columns.
            </p>
          </FilterGroup>
        </aside>

        <div className="flex-1 min-w-0 space-y-4 w-full">
          {/* Column set tabs + match count */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-0.5 bg-bg-elevated border border-border rounded p-0.5 w-fit">
              {([['overview', 'Overview'], ['returns', 'Returns'], ['fees', 'Fee impact']] as Array<[ColumnTab, string]>).map(([value, label]) => (
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

          {/* Fee-impact assumptions — visible only with the fee columns, applied
              identically to every row so the comparison is like-for-like. */}
          {columnTab === 'fees' && (
            <div className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-bg-card px-3 py-2 text-[11px] text-text-muted">
              <label className="flex items-center gap-1.5">
                Investment $
                <input
                  type="number" min={100} step={1000} value={feeParams.principal}
                  onChange={(e) => setFeeParams((p) => ({ ...p, principal: Math.max(100, Number(e.target.value) || 100) }))}
                  className="w-24 rounded border border-border bg-bg-elevated px-1.5 py-0.5 font-mono text-xs text-text-primary focus:border-accent-blue/50 focus:outline-none"
                />
              </label>
              <label className="flex items-center gap-1.5">
                Horizon
                <select
                  value={feeParams.years}
                  onChange={(e) => setFeeParams((p) => ({ ...p, years: Number(e.target.value) }))}
                  className="rounded border border-border bg-bg-elevated px-1.5 py-0.5 font-mono text-xs text-text-primary focus:border-accent-blue/50 focus:outline-none"
                >
                  {[5, 10, 20, 30].map((y) => <option key={y} value={y}>{y} years</option>)}
                </select>
              </label>
              <label className="flex items-center gap-1.5">
                Return %
                <input
                  type="number" min={0} max={20} step={0.5} value={feeParams.annualReturnPct}
                  onChange={(e) => setFeeParams((p) => ({ ...p, annualReturnPct: Math.min(20, Math.max(0, Number(e.target.value) || 0)) }))}
                  className="w-16 rounded border border-border bg-bg-elevated px-1.5 py-0.5 font-mono text-xs text-text-primary focus:border-accent-blue/50 focus:outline-none"
                />
              </label>
            </div>
          )}

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
              ) : columnTab === 'fees' ? (
                <>
                  <div className="col-span-1 flex justify-end"><SortHeader label="Expense" colKey="expense" /></div>
                  <div className="col-span-2 flex justify-end"><SortHeader label={`Cost ${feeParams.years}yr`} colKey="feecost" /></div>
                  <div className="col-span-1 flex justify-end"><span className="text-xs font-medium uppercase tracking-wider text-text-muted">End value</span></div>
                </>
              ) : (
                <>
                  {/* Not sortable: returns are known only for the visible page, so
                      ordering the whole universe by them would reorder nothing while
                      appearing to. See the returns note above. */}
                  <div className="col-span-1 flex justify-end text-xs font-medium uppercase tracking-wider text-text-muted">1M</div>
                  <div className="col-span-1 flex justify-end text-xs font-medium uppercase tracking-wider text-text-muted">3M</div>
                  <div className="col-span-1 flex justify-end text-xs font-medium uppercase tracking-wider text-text-muted">YTD</div>
                  <div className="col-span-1 flex justify-end text-xs font-medium uppercase tracking-wider text-text-muted">1Y</div>
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
                          {/* Official issuer page. Nested inside the row Link, so
                              stopPropagation is required or the row navigation
                              swallows the click. Curated funds only — the listing
                              directories carry no URL, and a guessed one 404s. */}
                          {row.website && (
                            <a
                              href={row.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              title={`Official ${row.symbol} page on the issuer's site`}
                              aria-label={`Official ${row.symbol} page on the issuer's site`}
                              className="flex-shrink-0 text-text-muted hover:text-accent-blue transition-colors"
                            >
                              <ExternalLink size={11} aria-hidden />
                            </a>
                          )}
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
                        ) : columnTab === 'fees' ? (() => {
                          const impact = feeImpact(
                            getFund(row.symbol) ?? { expenseRatioPct: row.expenseRatioPct as number, type: row.type, issuer: row.issuer ?? '' },
                            feeParams,
                          )
                          const saving = impact != null && impact.costUsd < 0
                          return (
                            <>
                              <div className={clsx('col-span-1 text-right font-mono tabular-nums text-xs',
                                row.expenseRatioPct != null ? expenseColor(row.expenseRatioPct) : 'text-text-muted')}>
                                {row.expenseRatioPct != null ? `${row.expenseRatioPct.toFixed(row.expenseRatioPct < 0.1 ? 3 : 2)}%` : '—'}
                              </div>
                              <div className={clsx('col-span-2 text-right font-mono tabular-nums text-xs',
                                impact == null ? 'text-text-muted' : saving ? 'text-emerald-400' : impact.costUsd > feeParams.principal * 0.1 ? 'text-orange-400' : 'text-amber-400')}>
                                {impact == null ? '—' : `${saving ? '+' : '−'}${formatCurrency(Math.abs(impact.costUsd), 0)}`}
                                {/* An unverified sales load means the figure UNDERSTATES the
                                    cost — flagged beside the number, never guessed into it.
                                    Same rule as the detail-page analyzer. */}
                                {impact?.unverifiedLoad && (
                                  <span className="ml-1 text-[9px] text-amber-400/80 align-top" title="This fund carries a sales load whose rate is not verified — the true cost is higher than shown. See the fund page.">+load</span>
                                )}
                                {impact?.includesLoad && (
                                  <span className="ml-1 text-[9px] text-text-muted align-top" title="Includes the fund's verified front-end sales load.">incl. load</span>
                                )}
                              </div>
                              <div className="col-span-1 text-right font-mono tabular-nums text-xs text-text-secondary">
                                {impact != null ? formatCurrency(impact.endValueUsd, 0) : '—'}
                              </div>
                            </>
                          )
                        })() : (
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
                {pageReturnsData?.error
                  ?? 'Trailing returns unavailable — price-history source unreachable. Columns show — instead of stale values.'}
              </p>
            )}
            {columnTab === 'fees' && (
              <p className="px-4 py-2 border-t border-border text-[11px] text-text-muted">
                Cost = compounded fees vs a {FEE_IMPACT_BENCHMARK_ER_PCT}% index-fund benchmark at your assumptions — the same
                arithmetic as each fund page&rsquo;s Fee Drag Analyzer. + values are savings vs that benchmark. Funds marked
                <span className="text-amber-400/80"> +load</span> carry a sales charge whose rate is not verified: their true
                cost is higher than shown. Uncurated funds have no expense ratio on record and show — (unknown is not free).
              </p>
            )}
            {columnTab === 'returns' && !returnsMissing && (
              <p className="px-4 py-2 border-t border-border text-[11px] text-text-muted">
                Trailing price returns from adjusted daily closes · visible page only · YTD measured from last close of the prior year · excludes distributions
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
