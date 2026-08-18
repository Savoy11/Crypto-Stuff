'use client'

import { useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  LayoutGrid, List, Vault, Search, X, Coins as CoinsIcon,
} from 'lucide-react'
import { clsx } from 'clsx'
import { useQuery } from '@tanstack/react-query'
import { AssetTable } from '@/components/assets/AssetTable'
import { AssetCard } from '@/components/assets/AssetCard'
// The reserve UI lives in one shared module. It used to be a local copy here
// that never received the accuracy fixes applied to the standalone /reserves
// page — wrong peg-mechanism colours, a KPI claiming third-party verification,
// and no provenance at all. See the header of components/analytics/reserves.
import { ReserveMonitorPanel } from '@/components/analytics/reserves'
import { MetricCard } from '@/components/ui/MetricCard'
import { useAssetsWithStore } from '@/hooks/useAssets'
import { useAssetStore } from '@/store/useAssetStore'
import { assetsApi } from '@/lib/api/assets'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { PageHeader } from '@/components/ui/PageHeader'
import { SourceLine } from '@/components/ui/SourceLine'
import { formatCompact } from '@/lib/utils/format'
import { LIVE_DATA, STALE_TIME_SHORT, BLOCKCHAIN_LABELS } from '@/lib/constants'
import type { AssetType, Blockchain } from '@/types/asset'

type ViewMode = 'table' | 'grid'
type Tab = 'coins' | 'reserves'

// ─── Coin registry: filter primitives ──────────────────────────────────────────

// Asset-type quick filters, mirroring the Stock Registry's sector chips.
const TYPE_CHIPS: Array<{ value: AssetType | 'all'; label: string; color: string }> = [
  { value: 'all',        label: 'All Types',  color: '#3b82f6' },
  { value: 'layer1',     label: 'Layer 1',    color: '#8b5cf6' },
  { value: 'stablecoin', label: 'Stablecoin', color: '#10b981' },
  { value: 'defi',       label: 'DeFi',       color: '#f59e0b' },
  { value: 'tokenized',  label: 'Tokenized',  color: '#14b8a6' },
  { value: 'cbdc',       label: 'CBDC',       color: '#ec4899' },
]

// Item 4 (2026-08-18): the risk-band filter, the safety-score range screener
// and the Safety Score / Risk Band columns were removed from this registry.
// They ranked and filtered a universe by score, which is the side of the line
// the owner drew as advice-shaped. Per-coin risk explanation on /assets/[id]
// is unaffected — that scores a coin the reader chose to open.

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

// ─── Main client ──────────────────────────────────────────────────────────────

export function AssetRegistryClient() {
  // `?tab=reserves` opens the Reserve Monitor directly. Needed because the
  // retired /reserves page redirects here — without it every bookmark and
  // external link to the old page would silently land on the coin table.
  // Read once as the initial value rather than kept in sync: the tab is user
  // state after first paint, and rewriting it on every URL change would fight
  // the user's clicks.
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<Tab>(
    searchParams.get('tab') === 'reserves' ? 'reserves' : 'coins',
  )
  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const { data, isLoading, isError, refetch } = useAssetsWithStore()
  const { filters, setFilters, resetFilters } = useAssetStore()

  // Full monitored universe (unfiltered) for the market-breadth KPIs — bounded
  // to the tracked catalog, so a large pageSize returns everything in one page.
  const { data: universeData } = useQuery({
    queryKey: ['assets', 'universe-kpi'],
    queryFn: () => assetsApi.getAssets({ pageSize: 100_000 }),
    staleTime: STALE_TIME_SHORT,
  })
  const universe = useMemo(() => universeData?.data ?? [], [universeData])

  const kpi = useMemo(() => {
    const totalMcap = universe.reduce((s, a) => s + (a.marketCap ?? 0), 0)
    const stablecoins = universe.filter((a) => a.assetType === 'stablecoin').length
    const layer1 = universe.filter((a) => a.assetType === 'layer1').length
    const withChange = universe.filter((a) => a.priceChangePercent24h != null)
    const advancers = withChange.filter((a) => (a.priceChangePercent24h ?? 0) > 0).length
    const decliners = withChange.filter((a) => (a.priceChangePercent24h ?? 0) < 0).length
    return { totalMcap, stablecoins, layer1, advancers, decliners, breadthKnown: withChange.length }
  }, [universe])

  const anyFilter =
    filters.assetType !== 'all' ||
    filters.blockchain !== 'all' ||
    filters.minMarketCap > 0 ||
    !!filters.search

  return (
    <div className="space-y-6 max-w-screen-2xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <PageHeader
          title="Coins"
          subtitle={isLoading ? 'Loading…' : `${data?.total ?? 0} coins monitored · live prices via CoinGecko`}
          icon={<CoinsIcon size={20} aria-hidden />}
          description="The Coin Registry tracks every monitored crypto asset with live prices and market data. The Reserve Monitor tab shows collateralization ratios, attestation records, and composition breakdowns for stablecoins."
          details={[
            { label: 'Data source', text: 'Prices refresh via CoinGecko every 30 seconds; reserve data pulls from DefiLlama.' },
            { label: 'Coin types', text: 'Fiat-backed & algorithmic stablecoins, Layer-1 networks, DeFi and tokenized assets, and CBDCs.' },
          ]}
        />

        <div className="flex items-center gap-3 shrink-0">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden />
            <input
              value={filters.search}
              onChange={(e) => setFilters({ search: e.target.value })}
              placeholder="Search symbol or name…"
              className="w-56 rounded border border-border bg-bg-elevated pl-8 pr-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-blue/50 focus:outline-none"
            />
          </div>

          {tab === 'coins' && (
            <div className="flex items-center gap-0.5 bg-bg-secondary border border-border rounded p-0.5">
              <button
                onClick={() => setViewMode('table')}
                className={clsx(
                  'p-1.5 rounded transition-colors',
                  viewMode === 'table' ? 'bg-accent-blue/20 text-accent-blue' : 'text-text-muted hover:text-text-secondary'
                )}
                aria-label="Table view"
              >
                <List size={14} aria-hidden />
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={clsx(
                  'p-1.5 rounded transition-colors',
                  viewMode === 'grid' ? 'bg-accent-blue/20 text-accent-blue' : 'text-text-muted hover:text-text-secondary'
                )}
                aria-label="Grid view"
              >
                <LayoutGrid size={14} aria-hidden />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Data provenance */}
      <SourceLine id="markets" />

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-slate-800">
        {([
          { id: 'coins',    label: 'Coins' },
          { id: 'reserves', label: 'Reserve Monitor', icon: Vault },
        ] as { id: Tab; label: string; icon?: React.ElementType }[]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={clsx(
              'flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === id
                ? 'border-accent-blue text-accent-blue'
                : 'border-transparent text-text-muted hover:text-text-secondary'
            )}
          >
            {Icon && <Icon size={14} />}
            {label}
          </button>
        ))}
      </div>

      {/* Coins tab */}
      {tab === 'coins' && (
        <div className="space-y-5">
          {/* Market-breadth KPIs */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            <MetricCard
              title="Coins"
              value={universe.length ? universe.length.toLocaleString() : '—'}
              subtitle={`${kpi.stablecoins} stablecoins · ${kpi.layer1} Layer 1`}
              accentColor="#3b82f6"
            />
            <MetricCard
              title="Monitored Mkt Cap"
              value={universe.length ? formatCompact(kpi.totalMcap) : '—'}
              subtitle="sum of live market caps"
              accentColor="#8b5cf6"
            />
            <MetricCard
              title="24h Breadth"
              value={
                kpi.breadthKnown === 0 ? '—' : (
                  <span className="flex items-baseline gap-2">
                    <span className="text-emerald-400">{kpi.advancers}▲</span>
                    <span className="text-text-muted text-base">/</span>
                    <span className="text-red-400">{kpi.decliners}▼</span>
                  </span>
                )
              }
              trend={kpi.breadthKnown === 0 ? undefined : kpi.advancers - kpi.decliners}
              subtitle="advancers vs decliners"
              accentColor="#14b8a6"
            />
            <MetricCard
              title="Matches"
              value={(data?.total ?? 0).toLocaleString()}
              subtitle={anyFilter ? 'after filters' : 'no filters applied'}
              accentColor="#10b981"
            />
          </div>

          {/* Asset-type filter chips */}
          <div className="flex flex-wrap gap-1.5">
            {TYPE_CHIPS.map(({ value, label, color }) => (
              <button
                key={value}
                onClick={() => setFilters({ assetType: value })}
                className={clsx('flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                  filters.assetType === value
                    ? 'bg-accent-blue/15 text-accent-blue border-accent-blue/30'
                    : 'text-text-muted border-border hover:text-text-secondary hover:bg-bg-elevated')}
                aria-pressed={filters.assetType === value}
              >
                {value !== 'all' && <span className="size-1.5 rounded-full" style={{ backgroundColor: color }} aria-hidden />}
                {label}
              </button>
            ))}
          </div>

          {/* Screener — inline range + select filters */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-card border border-border bg-bg-card px-4 py-3">
            <span className="text-xs font-medium uppercase tracking-wider text-text-muted">Screener</span>

            <label className="flex items-center gap-1.5 text-xs text-text-muted">
              Min mkt cap $B
              <NumInput
                value={filters.minMarketCap > 0 ? String(filters.minMarketCap / 1e9) : ''}
                onChange={(v) => setFilters({ minMarketCap: v === '' ? 0 : Number(v) * 1e9 })}
                placeholder="1"
              />
            </label>

            <label className="flex items-center gap-1.5 text-xs text-text-muted">
              Chain
              <select
                value={filters.blockchain}
                onChange={(e) => setFilters({ blockchain: e.target.value as Blockchain | 'all' })}
                className="rounded border border-border bg-bg-elevated px-2 py-1 text-xs text-text-primary focus:border-accent-blue/50 focus:outline-none"
              >
                <option value="all">All chains</option>
                {Object.entries(BLOCKCHAIN_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>

            {anyFilter && (
              <button
                onClick={resetFilters}
                className="flex items-center gap-1 text-xs text-accent-blue hover:underline"
              >
                <X size={11} aria-hidden /> Clear all
              </button>
            )}
            <span className="ml-auto text-[11px] text-text-muted">
              {(data?.total ?? 0).toLocaleString()} match{(data?.total ?? 0) !== 1 ? 'es' : ''}
            </span>
          </div>

          {/* Results */}
          {isError ? (
            <div className="rounded-card border border-border bg-bg-card p-8 text-center">
              <p className="text-sm text-text-muted mb-3">Failed to load coins</p>
              <button
                onClick={() => refetch()}
                className="px-3 py-1.5 rounded text-xs bg-bg-elevated border border-border text-text-secondary hover:text-text-primary transition-colors"
              >
                Retry
              </button>
            </div>
          ) : viewMode === 'table' ? (
            <div className="rounded-card border border-border bg-bg-card overflow-hidden">
              <AssetTable assets={data?.data ?? []} loading={isLoading} total={data?.total} />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {isLoading
                ? Array.from({ length: 9 }, (_, i) => (
                    <div key={i} className="h-40 rounded-card border border-border bg-bg-card animate-shimmer bg-shimmer-gradient bg-[length:200%_100%]" />
                  ))
                : (data?.data ?? []).length === 0
                  ? <p className="col-span-full px-4 py-8 text-center text-sm text-text-muted">No coins match the current filters.</p>
                  : (data?.data ?? []).map((asset) => (
                      <AssetCard key={asset.id} asset={asset} />
                    ))}
            </div>
          )}

        </div>
      )}

      {/* Reserve Monitor tab. Deep-linkable as /assets?tab=reserves — the
          retired /reserves page redirects here, so old links still land on the
          right surface rather than the coin table. */}
      {tab === 'reserves' && (
        <ErrorBoundary>
          <ReserveMonitorPanel />
        </ErrorBoundary>
      )}
    </div>
  )
}
