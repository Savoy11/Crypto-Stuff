'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { ArrowDown, ArrowUp, ArrowUpDown, Landmark, RefreshCw, Search } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { MetricCard } from '@/components/ui/MetricCard'
import {
  FUND_CATALOG, FUND_CATEGORY_INFO,
  type FundCategoryId, type FundEntry, type FundType,
} from '@/lib/data/fundCatalog'
import { SECTOR_INFO, type SectorId } from '@/lib/data/equityCatalog'
import { formatCompact, formatCurrency, formatPercent } from '@/lib/utils/format'
import { STALE_TIME_SHORT } from '@/lib/constants'
import type { SecurityQuotesResponse } from '@/app/live-data/security-quotes/route'
import type { SecurityReturnsResponse } from '@/app/live-data/security-returns/route'

type SortKey = 'symbol' | 'category' | 'price' | 'change' | 'expense' | 'aum' | 'yield' | 'm1' | 'm3' | 'ytd' | 'y1'
type ColumnTab = 'overview' | 'returns'
type FundStyle = 'all' | 'index' | 'active'

/** Sort/display label for the category column — sector funds carry their specific sector. */
function categoryLabel(row: FundEntry): string {
  const base = FUND_CATEGORY_INFO[row.category].label
  return row.focusSector ? `${base} · ${SECTOR_INFO[row.focusSector].label}` : base
}

interface Row extends FundEntry {
  price: number
  changePercent: number | null
  live: boolean
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

export function FundsClient() {
  const [type, setType] = useState<FundType | 'all'>('all')
  const [category, setCategory] = useState<FundCategoryId | 'all'>('all')
  const [sectorFocus, setSectorFocus] = useState<SectorId | 'all'>('all')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('aum')
  const [sortAsc, setSortAsc] = useState(false)
  const [columnTab, setColumnTab] = useState<ColumnTab>('overview')
  // Screener filters (reference values; blank = no filter)
  const [issuer, setIssuer] = useState('all')
  const [style, setStyle] = useState<FundStyle>('all')
  const [maxExpense, setMaxExpense] = useState('')
  const [minAumB, setMinAumB] = useState('')
  const [minYield, setMinYield] = useState('')

  const { data, isLoading, refetch, isFetching } = useQuery<SecurityQuotesResponse>({
    queryKey: ['security-quotes', 'funds'],
    queryFn: () => fetch('/live-data/security-quotes?universe=funds').then((r) => r.json()),
    staleTime: STALE_TIME_SHORT,
    refetchInterval: 60_000,
  })

  // Trailing returns are fetched lazily — only once the Returns tab is opened.
  const { data: returnsData } = useQuery<SecurityReturnsResponse>({
    queryKey: ['security-returns', 'funds'],
    queryFn: () => fetch('/live-data/security-returns?universe=funds').then((r) => r.json()),
    staleTime: 1000 * 60 * 15,
    enabled: columnTab === 'returns',
  })

  const rows: Row[] = useMemo(() => {
    return FUND_CATALOG.map((entry) => {
      const quote = data?.quotes?.[entry.symbol.toUpperCase()]
      const live = !!quote && data?.source !== 'reference' && !quote.reference
      return {
        ...entry,
        price: quote?.price ?? entry.referencePrice,
        changePercent: live ? quote?.changePercent ?? null : null,
        live,
      }
    })
  }, [data])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    const expenseCap = parseFloat(maxExpense)
    const aumFloor = parseFloat(minAumB)
    const yieldFloor = parseFloat(minYield)
    const ret = (row: Row) => returnsData?.returns?.[row.symbol]
    const subset = rows.filter((row) =>
      (type === 'all' || row.type === type) &&
      (category === 'all' || row.category === category) &&
      (category !== 'sector' || sectorFocus === 'all' || row.focusSector === sectorFocus) &&
      (issuer === 'all' || row.issuer === issuer) &&
      (style === 'all' || (style === 'active' ? row.indexTracked == null : row.indexTracked != null)) &&
      (!isFinite(expenseCap) || row.expenseRatioPct <= expenseCap) &&
      (!isFinite(aumFloor) || row.aumB >= aumFloor) &&
      (!isFinite(yieldFloor) || (row.yieldPct != null && row.yieldPct >= yieldFloor)) &&
      (!query ||
        row.symbol.toLowerCase().includes(query) ||
        row.name.toLowerCase().includes(query) ||
        row.issuer.toLowerCase().includes(query) ||
        categoryLabel(row).toLowerCase().includes(query) ||
        (row.focusIndustry?.toLowerCase().includes(query) ?? false))
    )
    const dir = sortAsc ? 1 : -1
    const value = (row: Row): number | string => {
      switch (sortKey) {
        case 'symbol':   return row.symbol
        case 'category': return categoryLabel(row)
        case 'price':    return row.price
        case 'change':   return row.changePercent ?? -Infinity
        case 'expense':  return row.expenseRatioPct
        case 'yield':    return row.yieldPct ?? -Infinity
        case 'm1':       return ret(row)?.m1 ?? -Infinity
        case 'm3':       return ret(row)?.m3 ?? -Infinity
        case 'ytd':      return ret(row)?.ytd ?? -Infinity
        case 'y1':       return ret(row)?.y1 ?? -Infinity
        default:         return row.aumB
      }
    }
    return [...subset].sort((a, b) => {
      const va = value(a); const vb = value(b)
      if (typeof va === 'string' && typeof vb === 'string') return va.localeCompare(vb) * dir
      return ((va as number) - (vb as number)) * dir
    })
  }, [rows, type, category, sectorFocus, issuer, style, maxExpense, minAumB, minYield, search, sortKey, sortAsc, returnsData])

  const etfCount = FUND_CATALOG.filter((f) => f.type === 'etf').length
  const mutualCount = FUND_CATALOG.length - etfCount
  const avgExpense = filtered.length
    ? filtered.reduce((s, f) => s + f.expenseRatioPct, 0) / filtered.length
    : 0
  const cheapest = filtered.length
    ? filtered.reduce((best, f) => (f.expenseRatioPct < best.expenseRatioPct ? f : best))
    : null
  const totalAum = filtered.reduce((s, f) => s + f.aumB, 0)

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((a) => !a)
    else { setSortKey(key); setSortAsc(key === 'symbol' || key === 'category' || key === 'expense') }
  }

  const issuers = useMemo(() => Array.from(new Set(FUND_CATALOG.map((f) => f.issuer))).sort(), [])
  const returnsMissing = columnTab === 'returns' && returnsData != null && returnsData.source === 'none'

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

  return (
    <div className="space-y-6 max-w-screen-2xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <PageHeader
          title="Fund Registry"
          subtitle={`${etfCount} ETFs and ${mutualCount} mutual funds`}
          icon={<Landmark size={20} aria-hidden />}
          description="Tracks major ETFs and mutual funds with live NAV/price, expense ratios, and category context. Costs compound — the expense ratio column is color-coded and every fund page includes a fee-drag projection."
          details={[
            { label: 'Data source', text: data ? SOURCE_LABELS[data.source] ?? data.source : 'Loading…' },
            { label: 'Fund facts', text: 'Expense ratio, AUM, yield, and holdings are reference snapshots from issuer disclosures, not a live feed.' },
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

      {/* KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard title="Funds Shown" loading={isLoading} value={String(filtered.length)} subtitle={`of ${FUND_CATALOG.length} tracked`} accentColor="#3b82f6" />
        <MetricCard title="Avg Expense Ratio" loading={isLoading} value={`${avgExpense.toFixed(2)}%`} subtitle="of funds shown" accentColor="#f59e0b" />
        <MetricCard title="Cheapest Fund" loading={isLoading} value={cheapest?.symbol ?? '—'} subtitle={cheapest ? `${cheapest.expenseRatioPct}% expense ratio` : undefined} accentColor="#10b981" />
        <MetricCard title="Combined AUM" loading={isLoading} value={formatCompact(totalAum * 1e9)} subtitle="reference values" accentColor="#8b5cf6" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-0.5 bg-bg-elevated border border-border rounded p-0.5">
          {([['all', 'All'], ['etf', 'ETFs'], ['mutual', 'Mutual Funds']] as Array<[FundType | 'all', string]>).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setType(value)}
              className={clsx('px-2.5 py-1 rounded text-xs font-medium transition-colors',
                type === value ? 'bg-accent-blue/20 text-accent-blue' : 'text-text-muted hover:text-text-secondary')}
            >
              {label}
            </button>
          ))}
        </div>
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
              onClick={() => { setCategory(category === id ? 'all' : id); setSectorFocus('all') }}
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

      {/* Sector drill-down — which sector/industry a sector fund actually targets */}
      {category === 'sector' && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wider text-text-muted mr-1">Target sector</span>
          <button
            onClick={() => setSectorFocus('all')}
            className={clsx('px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
              sectorFocus === 'all'
                ? 'bg-accent-blue/15 text-accent-blue border-accent-blue/30'
                : 'text-text-muted border-border hover:text-text-secondary hover:bg-bg-elevated')}
          >
            All
          </button>
          {Array.from(new Set(FUND_CATALOG.filter((f) => f.category === 'sector' && f.focusSector).map((f) => f.focusSector as SectorId))).map((id) => (
            <button
              key={id}
              onClick={() => setSectorFocus(sectorFocus === id ? 'all' : id)}
              className={clsx('flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                sectorFocus === id
                  ? 'bg-accent-blue/15 text-accent-blue border-accent-blue/30'
                  : 'text-text-muted border-border hover:text-text-secondary hover:bg-bg-elevated')}
            >
              <span className="size-1.5 rounded-full" style={{ backgroundColor: SECTOR_INFO[id].color }} aria-hidden />
              {SECTOR_INFO[id].label}
            </button>
          ))}
        </div>
      )}

      {/* Screener (reference values) */}
      <div className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-bg-card px-4 py-3">
        <span className="text-xs font-medium uppercase tracking-wider text-text-muted">Screener</span>
        <label className="flex items-center gap-1.5 text-xs text-text-muted">
          Issuer
          <select
            value={issuer}
            onChange={(e) => setIssuer(e.target.value)}
            className="rounded border border-border bg-bg-elevated px-2 py-1 text-xs text-text-primary focus:border-accent-blue/50 focus:outline-none"
          >
            <option value="all">All</option>
            {issuers.map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-text-muted">
          Style
          <select
            value={style}
            onChange={(e) => setStyle(e.target.value as FundStyle)}
            className="rounded border border-border bg-bg-elevated px-2 py-1 text-xs text-text-primary focus:border-accent-blue/50 focus:outline-none"
          >
            <option value="all">All</option>
            <option value="index">Index</option>
            <option value="active">Active</option>
          </select>
        </label>
        {([
          ['Max expense %', maxExpense, setMaxExpense, 'e.g. 0.2'],
          ['Min AUM ($B)', minAumB, setMinAumB, 'e.g. 50'],
          ['Min yield %', minYield, setMinYield, 'e.g. 2'],
        ] as Array<[string, string, (v: string) => void, string]>).map(([label, value, setter, ph]) => (
          <label key={label} className="flex items-center gap-1.5 text-xs text-text-muted">
            {label}
            <input
              type="number"
              value={value}
              onChange={(e) => setter(e.target.value)}
              placeholder={ph}
              className="w-20 rounded border border-border bg-bg-elevated px-2 py-1 text-xs font-mono text-text-primary placeholder:text-text-muted/60 focus:border-accent-blue/50 focus:outline-none"
            />
          </label>
        ))}
        {(issuer !== 'all' || style !== 'all' || maxExpense || minAumB || minYield) && (
          <button
            onClick={() => { setIssuer('all'); setStyle('all'); setMaxExpense(''); setMinAumB(''); setMinYield('') }}
            className="text-xs text-accent-blue hover:underline"
          >
            Clear
          </button>
        )}
        <span className="ml-auto text-[11px] text-text-muted">{filtered.length} match{filtered.length !== 1 ? 'es' : ''} · reference fund facts</span>
      </div>

      {/* Column set tabs */}
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

      {/* Table */}
      <div className="rounded-card border border-border bg-bg-card overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-4 py-2.5 border-b border-border bg-bg-elevated/40">
          <div className="col-span-4"><SortHeader label="Fund" colKey="symbol" /></div>
          <div className="col-span-2"><SortHeader label="Category" colKey="category" /></div>
          <div className="col-span-2 flex justify-end"><SortHeader label="Price / NAV" colKey="price" /></div>
          {columnTab === 'overview' ? (
            <>
              <div className="col-span-1 flex justify-end"><SortHeader label="Chg %" colKey="change" /></div>
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
            : filtered.map((row) => {
                const catInfo = FUND_CATEGORY_INFO[row.category]
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
                      <span className="text-xs text-text-muted truncate">{row.name}</span>
                    </div>
                    <div className="col-span-2 min-w-0">
                      <span
                        className="inline-flex max-w-full items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium border border-border text-text-secondary"
                        title={row.focusIndustry ? `${categoryLabel(row)} — ${row.focusIndustry}` : undefined}
                      >
                        <span
                          className="size-1.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: row.focusSector ? SECTOR_INFO[row.focusSector].color : catInfo.color }}
                          aria-hidden
                        />
                        {row.focusSector ? (
                          <span className="truncate">
                            {SECTOR_INFO[row.focusSector].label}
                            {row.focusIndustry && <span className="text-text-muted"> · {row.focusIndustry}</span>}
                          </span>
                        ) : (
                          catInfo.label
                        )}
                      </span>
                    </div>
                    <div className="col-span-2 text-right font-mono tabular-nums text-text-primary">
                      {formatCurrency(row.price)}
                      {!row.live && <span className="ml-1 text-[9px] text-amber-400/80 align-top" title="Reference price — live source unreachable">ref</span>}
                    </div>
                    {columnTab === 'overview' ? (
                      <>
                        <div className={clsx('col-span-1 text-right font-mono tabular-nums text-xs',
                          change == null ? 'text-text-muted' : change >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                          {change == null ? '—' : formatPercent(change, 2)}
                        </div>
                        <div className={clsx('col-span-1 text-right font-mono tabular-nums text-xs', expenseColor(row.expenseRatioPct))}>
                          {row.expenseRatioPct.toFixed(row.expenseRatioPct < 0.1 ? 3 : 2)}%
                        </div>
                        <div className="col-span-1 text-right font-mono tabular-nums text-xs text-text-secondary">
                          {formatCompact(row.aumB * 1e9)}
                        </div>
                        <div className="col-span-1 text-right font-mono tabular-nums text-xs text-text-secondary">
                          {row.yieldPct != null ? `${row.yieldPct.toFixed(1)}%` : '—'}
                        </div>
                      </>
                    ) : (
                      [returnsData?.returns?.[row.symbol]?.m1, returnsData?.returns?.[row.symbol]?.m3,
                       returnsData?.returns?.[row.symbol]?.ytd, returnsData?.returns?.[row.symbol]?.y1].map((r, i) => (
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

      <p className="text-[11px] text-text-muted text-center">
        {data ? SOURCE_LABELS[data.source] ?? data.source : 'Loading…'}
        {data?.updatedAt && ` · updated ${new Date(data.updatedAt).toLocaleTimeString()}`}
        {' · '}Expense ratios, AUM, and yields are reference snapshots from issuer disclosures
      </p>
    </div>
  )
}
