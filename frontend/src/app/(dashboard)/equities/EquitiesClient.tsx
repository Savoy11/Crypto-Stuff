'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { ArrowDown, ArrowUp, ArrowUpDown, LineChart, RefreshCw, Search, TrendingDown, TrendingUp } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { MetricCard } from '@/components/ui/MetricCard'
import { EQUITY_CATALOG, SECTOR_INFO, type EquityEntry, type SectorId } from '@/lib/data/equityCatalog'
import { formatCompact, formatCurrency, formatPercent } from '@/lib/utils/format'
import { STALE_TIME_SHORT } from '@/lib/constants'
import type { SecurityQuotesResponse } from '@/app/live-data/security-quotes/route'

type SortKey = 'symbol' | 'sector' | 'price' | 'change' | 'marketCap' | 'pe' | 'dividend' | 'beta'

interface Row extends EquityEntry {
  price: number
  changePercent: number | null
  marketCap: number
  live: boolean
}

const SOURCE_LABELS: Record<string, string> = {
  fmp: 'Live via Financial Modeling Prep',
  yahoo: 'Live via Yahoo Finance',
  stooq: 'Live via Stooq (intraday change)',
  reference: 'Reference prices — no live source reachable',
}

export function EquitiesClient() {
  const [sector, setSector] = useState<SectorId | 'all'>('all')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('marketCap')
  // Fundamental screener filters (reference values; blank = no filter)
  const [maxPe, setMaxPe] = useState('')
  const [minYield, setMinYield] = useState('')
  const [maxBeta, setMaxBeta] = useState('')
  const [minMcapB, setMinMcapB] = useState('')
  const [sortAsc, setSortAsc] = useState(false)

  const { data, isLoading, refetch, isFetching } = useQuery<SecurityQuotesResponse>({
    queryKey: ['security-quotes', 'equities'],
    queryFn: () => fetch('/live-data/security-quotes?universe=equities').then((r) => r.json()),
    staleTime: STALE_TIME_SHORT,
    refetchInterval: 60_000,
  })

  const rows: Row[] = useMemo(() => {
    return EQUITY_CATALOG.map((entry) => {
      const quote = data?.quotes?.[entry.symbol.toUpperCase()]
      const live = !!quote && data?.source !== 'reference' && !quote.reference
      return {
        ...entry,
        price: quote?.price ?? entry.referencePrice,
        changePercent: live ? quote?.changePercent ?? null : null,
        marketCap: quote?.marketCap ?? entry.marketCapB * 1e9,
        live,
      }
    })
  }, [data])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    const peLimit = parseFloat(maxPe); const yieldFloor = parseFloat(minYield)
    const betaLimit = parseFloat(maxBeta); const mcapFloor = parseFloat(minMcapB)
    const subset = rows.filter((row) =>
      (sector === 'all' || row.sector === sector) &&
      (!query || row.symbol.toLowerCase().includes(query) || row.name.toLowerCase().includes(query)) &&
      (!isFinite(peLimit) || (row.peRatio != null && row.peRatio <= peLimit)) &&
      (!isFinite(yieldFloor) || (row.dividendYieldPct != null && row.dividendYieldPct >= yieldFloor)) &&
      (!isFinite(betaLimit) || row.beta <= betaLimit) &&
      (!isFinite(mcapFloor) || row.marketCap >= mcapFloor * 1e9)
    )
    const dir = sortAsc ? 1 : -1
    const value = (row: Row): number | string => {
      switch (sortKey) {
        case 'symbol':   return row.symbol
        case 'sector':   return `${SECTOR_INFO[row.sector].label} ${row.industry}`
        case 'price':    return row.price
        case 'change':   return row.changePercent ?? -Infinity
        case 'pe':       return row.peRatio ?? -Infinity
        case 'dividend': return row.dividendYieldPct ?? -Infinity
        case 'beta':     return row.beta
        default:         return row.marketCap
      }
    }
    return [...subset].sort((a, b) => {
      const va = value(a); const vb = value(b)
      if (typeof va === 'string' && typeof vb === 'string') return va.localeCompare(vb) * dir
      return ((va as number) - (vb as number)) * dir
    })
  }, [rows, sector, search, sortKey, sortAsc, maxPe, minYield, maxBeta, minMcapB])

  const withChange = rows.filter((r) => r.changePercent != null)
  const advancers = withChange.filter((r) => (r.changePercent ?? 0) > 0).length
  const decliners = withChange.filter((r) => (r.changePercent ?? 0) < 0).length
  const avgChange = withChange.length
    ? withChange.reduce((s, r) => s + (r.changePercent ?? 0), 0) / withChange.length
    : null
  const topGainer = withChange.length
    ? withChange.reduce((best, r) => ((r.changePercent ?? -Infinity) > (best.changePercent ?? -Infinity) ? r : best))
    : null
  const topLoser = withChange.length
    ? withChange.reduce((worst, r) => ((r.changePercent ?? Infinity) < (worst.changePercent ?? Infinity) ? r : worst))
    : null

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((a) => !a)
    else { setSortKey(key); setSortAsc(key === 'symbol' || key === 'sector') }
  }

  const SortHeader = ({ label, colKey, className }: { label: string; colKey: SortKey; className?: string }) => (
    <button
      onClick={() => toggleSort(colKey)}
      className={clsx('flex items-center gap-1 text-xs font-medium uppercase tracking-wider transition-colors',
        sortKey === colKey ? 'text-accent-blue' : 'text-text-muted hover:text-text-secondary', className)}
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
          title="Stock Registry"
          subtitle={`${EQUITY_CATALOG.length} large-cap equities across ${Object.keys(SECTOR_INFO).length} sectors`}
          icon={<LineChart size={20} aria-hidden />}
          description="Tracks major US-listed equities with live quotes and reference fundamentals. Quotes ladder through FMP (if a key is configured), Yahoo Finance, and Stooq; when no source is reachable, approximate reference prices keep the page rendering and are labelled as such."
          details={[
            { label: 'Data source', text: data ? SOURCE_LABELS[data.source] ?? data.source : 'Loading…' },
            { label: 'Fundamentals', text: 'Market cap, P/E, dividend yield, and beta are approximate reference values pending a fundamentals data feed.' },
          ]}
        />
        <div className="flex items-center gap-3">
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

      {/* KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard
          title="Breadth"
          loading={isLoading}
          value={avgChange != null ? `${advancers} ▲ / ${decliners} ▼` : '—'}
          subtitle={avgChange != null ? 'advancers vs decliners' : 'requires live quotes'}
          accentColor="#3b82f6"
        />
        <MetricCard
          title="Average Move"
          loading={isLoading}
          value={avgChange != null ? formatPercent(avgChange, 2) : '—'}
          subtitle="equal-weighted, tracked universe"
          trend={avgChange ?? undefined}
          accentColor="#8b5cf6"
        />
        <MetricCard
          title="Top Gainer"
          loading={isLoading}
          value={topGainer ? topGainer.symbol : '—'}
          subtitle={topGainer ? topGainer.name : 'requires live quotes'}
          trend={topGainer?.changePercent ?? undefined}
          icon={<TrendingUp size={16} aria-hidden />}
          accentColor="#10b981"
        />
        <MetricCard
          title="Top Decliner"
          loading={isLoading}
          value={topLoser ? topLoser.symbol : '—'}
          subtitle={topLoser ? topLoser.name : 'requires live quotes'}
          trend={topLoser?.changePercent ?? undefined}
          icon={<TrendingDown size={16} aria-hidden />}
          accentColor="#ef4444"
        />
      </div>

      {/* Sector filter */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setSector('all')}
          className={clsx('px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
            sector === 'all'
              ? 'bg-accent-blue/15 text-accent-blue border-accent-blue/30'
              : 'text-text-muted border-border hover:text-text-secondary hover:bg-bg-elevated')}
        >
          All Sectors
        </button>
        {(Object.entries(SECTOR_INFO) as Array<[SectorId, { label: string; color: string }]>).map(([id, info]) => (
          <button
            key={id}
            onClick={() => setSector(sector === id ? 'all' : id)}
            className={clsx('flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
              sector === id
                ? 'bg-accent-blue/15 text-accent-blue border-accent-blue/30'
                : 'text-text-muted border-border hover:text-text-secondary hover:bg-bg-elevated')}
          >
            <span className="size-1.5 rounded-full" style={{ backgroundColor: info.color }} aria-hidden />
            {info.label}
          </button>
        ))}
      </div>

      {/* Fundamental screener (reference values) */}
      <div className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-bg-card px-4 py-3">
        <span className="text-xs font-medium uppercase tracking-wider text-text-muted">Screener</span>
        {([
          ['Max P/E', maxPe, setMaxPe, 'e.g. 20'],
          ['Min yield %', minYield, setMinYield, 'e.g. 2'],
          ['Max beta', maxBeta, setMaxBeta, 'e.g. 1.2'],
          ['Min mkt cap ($B)', minMcapB, setMinMcapB, 'e.g. 100'],
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
        {(maxPe || minYield || maxBeta || minMcapB) && (
          <button
            onClick={() => { setMaxPe(''); setMinYield(''); setMaxBeta(''); setMinMcapB('') }}
            className="text-xs text-accent-blue hover:underline"
          >
            Clear
          </button>
        )}
        <span className="ml-auto text-[11px] text-text-muted">{filtered.length} match{filtered.length !== 1 ? 'es' : ''} · reference fundamentals</span>
      </div>

      {/* Table */}
      <div className="rounded-card border border-border bg-bg-card overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-4 py-2.5 border-b border-border bg-bg-elevated/40">
          <div className="col-span-3"><SortHeader label="Company" colKey="symbol" /></div>
          <div className="col-span-2"><SortHeader label="Sector" colKey="sector" /></div>
          <div className="col-span-2 flex justify-end"><SortHeader label="Price" colKey="price" /></div>
          <div className="col-span-1 flex justify-end"><SortHeader label="Chg %" colKey="change" /></div>
          <div className="col-span-2 flex justify-end"><SortHeader label="Mkt Cap" colKey="marketCap" /></div>
          <div className="col-span-1 flex justify-end"><SortHeader label="P/E" colKey="pe" /></div>
          <div className="col-span-1 flex justify-end"><SortHeader label="Yield" colKey="dividend" /></div>
        </div>

        <div className="divide-y divide-border/60">
          {isLoading && rows.length === 0
            ? Array.from({ length: 10 }, (_, i) => (
                <div key={i} className="h-12 animate-shimmer bg-shimmer-gradient bg-[length:200%_100%]" />
              ))
            : filtered.map((row) => {
                const sectorInfo = SECTOR_INFO[row.sector]
                const change = row.changePercent
                return (
                  <Link
                    key={row.symbol}
                    href={`/equities/${row.symbol.toLowerCase()}`}
                    className="grid grid-cols-12 gap-2 px-4 py-2.5 text-sm items-center hover:bg-bg-elevated/40 transition-colors"
                  >
                    <div className="col-span-3 min-w-0">
                      <span className="font-mono font-semibold text-text-primary">{row.symbol}</span>
                      <span className="ml-2 text-xs text-text-muted truncate">{row.name}</span>
                    </div>
                    <div className="col-span-2">
                      <span
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium border border-border text-text-secondary"
                      >
                        <span className="size-1.5 rounded-full" style={{ backgroundColor: sectorInfo.color }} aria-hidden />
                        {sectorInfo.label}
                      </span>
                    </div>
                    <div className="col-span-2 text-right font-mono tabular-nums text-text-primary">
                      {formatCurrency(row.price)}
                      {!row.live && <span className="ml-1 text-[9px] text-amber-400/80 align-top" title="Reference price — live source unreachable">ref</span>}
                    </div>
                    <div className={clsx('col-span-1 text-right font-mono tabular-nums text-xs',
                      change == null ? 'text-text-muted' : change >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                      {change == null ? '—' : formatPercent(change, 2)}
                    </div>
                    <div className="col-span-2 text-right font-mono tabular-nums text-text-secondary">
                      {formatCompact(row.marketCap)}
                    </div>
                    <div className="col-span-1 text-right font-mono tabular-nums text-xs text-text-secondary">
                      {row.peRatio ?? '—'}
                    </div>
                    <div className="col-span-1 text-right font-mono tabular-nums text-xs text-text-secondary">
                      {row.dividendYieldPct != null ? `${row.dividendYieldPct.toFixed(1)}%` : '—'}
                    </div>
                  </Link>
                )
              })}
          {!isLoading && filtered.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-text-muted">No equities match the current filters.</p>
          )}
        </div>
      </div>

      <p className="text-[11px] text-text-muted text-center">
        {data ? SOURCE_LABELS[data.source] ?? data.source : 'Loading…'}
        {data?.updatedAt && ` · updated ${new Date(data.updatedAt).toLocaleTimeString()}`}
        {' · '}P/E, yield, and beta are reference values
      </p>
    </div>
  )
}
