'use client'

import { useMemo, useState } from 'react'
import {
  LayoutGrid, List, Vault, CheckCircle, AlertTriangle, ExternalLink, Loader2,
  RefreshCw, Search, X, Coins as CoinsIcon,
} from 'lucide-react'
import { clsx } from 'clsx'
import { useQuery } from '@tanstack/react-query'
import { AssetTable } from '@/components/assets/AssetTable'
import { AssetCard } from '@/components/assets/AssetCard'
import { ReserveComposition } from '@/components/analytics/ReserveComposition'
import { MetricCard } from '@/components/ui/MetricCard'
import { useAssetsWithStore } from '@/hooks/useAssets'
import { useAssetStore } from '@/store/useAssetStore'
import { assetsApi } from '@/lib/api/assets'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { PageHeader } from '@/components/ui/PageHeader'
import { formatCurrency, formatCompact, formatDate, formatPercent } from '@/lib/utils/format'
import { LIVE_DATA, STALE_TIME_SHORT, BLOCKCHAIN_LABELS } from '@/lib/constants'
import type { AssetType, Blockchain, RiskBand } from '@/types/asset'
import type { LiveReserveAsset } from '@/app/live-data/reserves/route'

type ViewMode = 'table' | 'grid'
type Tab = 'coins' | 'reserves'

// ─── Reserve helpers ──────────────────────────────────────────────────────────

function VerificationBadge({ verified }: { verified: boolean }) {
  return verified ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400 border border-emerald-500/20">
      <CheckCircle className="h-3 w-3" /> Verified
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400 border border-amber-500/20">
      <AlertTriangle className="h-3 w-3" /> Unverified
    </span>
  )
}

function CollateralizationBar({ ratio }: { ratio: number | null }) {
  if (ratio == null) {
    return <span className="text-xs text-text-muted italic" title="Issuer does not disclose a collateralization ratio">not disclosed</span>
  }
  const pct = Math.min(ratio * 100, 200)
  const color = ratio >= 1.0 ? 'bg-emerald-500' : ratio >= 0.95 ? 'bg-amber-500' : 'bg-red-500'
  const textColor = ratio >= 1.0 ? 'text-emerald-400' : ratio >= 0.95 ? 'text-amber-400' : 'text-red-400'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-slate-700">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className={`font-mono text-xs tabular-nums ${textColor}`}>{formatPercent(ratio * 100, 1)}</span>
    </div>
  )
}

function PegMechBadge({ mech }: { mech: string }) {
  const styles: Record<string, string> = {
    fiat_backed:   'text-emerald-400 bg-emerald-400/10 border-emerald-500/20',
    crypto_backed: 'text-blue-400 bg-blue-400/10 border-blue-500/20',
    algorithmic:   'text-red-400 bg-red-400/10 border-red-500/20',
    hybrid:        'text-violet-400 bg-violet-400/10 border-violet-500/20',
  }
  const label: Record<string, string> = {
    fiat_backed: 'Fiat-backed', crypto_backed: 'Crypto-backed',
    algorithmic: 'Algorithmic', hybrid: 'Hybrid',
  }
  return (
    <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium border ${styles[mech] ?? 'text-slate-400 bg-slate-400/10 border-slate-500/20'}`}>
      {label[mech] ?? mech}
    </span>
  )
}

async function fetchLiveReserves(): Promise<{ assets: LiveReserveAsset[]; updatedAt: string; metaAsOf?: string }> {
  const res = await fetch('/live-data/reserves')
  if (!res.ok) throw new Error('Failed to fetch reserve data')
  return res.json()
}

// ─── Reserve Monitor tab ──────────────────────────────────────────────────────

function ReserveMonitor() {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { data: liveData, isLoading, isError, refetch } = useQuery({
    queryKey: ['live-reserves'],
    queryFn: fetchLiveReserves,
    enabled: LIVE_DATA,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
  })

  const liveAssets = (liveData?.assets ?? []).map((a) => ({
    assetId: a.id,
    symbol: a.symbol,
    name: a.name,
    attester: a.attester,
    attestationDate: a.lastAttestedDate,
    attestationUrl: a.attestationUrl,
    totalReservesUsd: a.circulatingUsd,
    collateralizationRatio: a.collateralizationRatio,
    verified: a.collateralizationRatio !== null,
    chains: a.chains,
    composition: a.composition.length > 0
      ? a.composition.map((c) => ({ ...c, description: '' }))
      : [{ category: 'Undisclosed', amount: a.circulatingUsd, percentage: 100, description: 'Composition not publicly available' }],
    pegMechanism: a.pegMechanism as string | undefined,
  }))

  const reserves = liveAssets
  const selected = reserves.find((r) => r.assetId === selectedId)
  const totalReserves = reserves.reduce((s, r) => s + r.totalReservesUsd, 0)
  const disclosed = reserves.filter((r) => r.collateralizationRatio != null)
  const fullyCollateralized = disclosed.filter((r) => (r.collateralizationRatio ?? 0) >= 1.0).length
  const verifiedCount = reserves.filter((r) => r.verified).length

  if (LIVE_DATA && isLoading) {
    return (
      <div className="flex items-center justify-center py-16 gap-2 text-slate-500">
        <Loader2 size={18} className="animate-spin" />
        <span className="text-sm">Fetching reserve data from DefiLlama…</span>
      </div>
    )
  }

  if (LIVE_DATA && isError) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center">
        <AlertTriangle className="mx-auto h-7 w-7 text-red-400/70" />
        <p className="mt-2 text-sm font-medium text-slate-200">Could not reach DefiLlama</p>
        <p className="mt-1 text-xs text-slate-400">Reserve data is temporarily unavailable.</p>
        <button onClick={() => refetch()} className="mt-3 text-xs text-blue-400 hover:text-blue-300 underline">Retry</button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          {LIVE_DATA && liveData
            ? `Live via DefiLlama · updated ${new Date(liveData.updatedAt).toLocaleTimeString()}`
            : 'Attestation records, composition breakdowns, and collateralization health'}
        </p>
        {LIVE_DATA && (
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
          >
            <RefreshCw size={12} /> Refresh
          </button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Monitored Supply', value: formatCompact(totalReserves), sub: `${reserves.length} assets via DefiLlama` },
          { label: 'Fully Collateralized',   value: `${fullyCollateralized}/${disclosed.length}`, sub: 'of assets with disclosed ratios' },
          { label: 'Verified Attestations',  value: `${verifiedCount}/${reserves.length}`, sub: 'by third-party auditor' },
        ].map(({ label, value, sub }) => (
          <div key={label} className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wider truncate">{label}</p>
            <p className="mt-1 text-xl font-mono font-bold text-slate-100 tabular-nums leading-tight">{value}</p>
            <p className="text-xs text-slate-500 mt-1">{sub}</p>
          </div>
        ))}
      </div>

      {/* Table + detail panel */}
      <div className="flex gap-4">
        <div className="flex-1 min-w-0 rounded-xl border border-slate-800 bg-slate-900/50">
          <div className="border-b border-slate-800 px-4 py-3">
            <h2 className="text-sm font-medium text-slate-300">Attestation Records</h2>
          </div>
          <div className="divide-y divide-slate-800/60">
            <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs font-medium text-slate-500 uppercase">
              <span className="col-span-3">Asset</span>
              <span className="col-span-2">Supply</span>
              <span className="col-span-2">Mechanism</span>
              <span className="col-span-3">Collateralization</span>
              <span className="col-span-2">Status</span>
            </div>
            {reserves.map((r) => (
              <div
                key={r.assetId}
                onClick={() => setSelectedId(selectedId === r.assetId ? null : r.assetId)}
                className={`grid grid-cols-12 gap-2 px-4 py-3 text-sm cursor-pointer transition-colors ${
                  selectedId === r.assetId ? 'bg-blue-500/5' : 'hover:bg-slate-800/30'
                }`}
              >
                <div className="col-span-3 flex flex-col">
                  <span className="font-medium text-slate-100">{r.symbol}</span>
                  <span className="text-xs text-slate-500">{r.attester}</span>
                </div>
                <span className="col-span-2 font-mono text-xs text-slate-300 tabular-nums self-center">
                  {formatCurrency(r.totalReservesUsd)}
                </span>
                <div className="col-span-2 self-center">
                  {r.pegMechanism
                    ? <PegMechBadge mech={r.pegMechanism} />
                    : <span className="text-xs text-slate-500">—</span>}
                </div>
                <div className="col-span-3 self-center">
                  <CollateralizationBar ratio={r.collateralizationRatio} />
                </div>
                <div className="col-span-2 self-center">
                  <VerificationBadge verified={r.verified} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="w-72 flex-shrink-0 flex flex-col gap-4">
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-slate-200">{selected.symbol} Composition</h3>
                {selected.attestationUrl && selected.attestationUrl !== '#' && (
                  <a href={selected.attestationUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>
              <ReserveComposition composition={selected.composition} collateralizationRatio={selected.collateralizationRatio ?? undefined} />
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">Attester</span>
                <span className="text-slate-200 text-right text-xs max-w-[140px]">{selected.attester}</span>
              </div>
              {selected.attestationDate && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Last attested (per issuer disclosure)</span>
                  <span className="text-slate-200">{formatDate(selected.attestationDate)}</span>
                </div>
              )}
              {selected.chains && selected.chains.length > 0 && (
                <div className="flex justify-between items-start gap-2">
                  <span className="text-slate-400 flex-shrink-0">Chains</span>
                  <span className="text-slate-300 text-xs text-right">{selected.chains.slice(0, 5).join(', ')}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-400">Verified</span>
                <VerificationBadge verified={selected.verified} />
              </div>
            </div>
          </div>
        )}
      </div>

      {LIVE_DATA && (
        <p className="text-[11px] text-slate-500 text-center">
          Circulating supply via{' '}
          <a href="https://stablecoins.llama.fi" target="_blank" rel="noopener noreferrer" className="text-blue-400/70 hover:text-blue-400">
            DefiLlama Stablecoins API
          </a>{' '}
          · Attester names, dates, and composition splits are curated snapshots of issuer disclosures{liveData?.metaAsOf ? ` (as of ${liveData.metaAsOf})` : ''} — not a live feed — and may lag current filings
        </p>
      )}
    </div>
  )
}

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

const RISK_BAND_OPTIONS: Array<{ value: RiskBand | 'all'; label: string }> = [
  { value: 'all',      label: 'All bands' },
  { value: 'low',      label: 'Low risk' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'elevated', label: 'Elevated' },
  { value: 'high',     label: 'High' },
  { value: 'critical', label: 'Critical' },
]

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
  const [tab, setTab] = useState<Tab>('coins')
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
    filters.riskBand !== 'all' ||
    filters.minRiskScore > 0 ||
    filters.maxRiskScore < 100 ||
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
          description="The Coin Registry tracks every monitored crypto asset with live prices, market data, and a canonical Safety Score (0–100, higher = safer). The Reserve Monitor tab shows collateralization ratios, attestation records, and composition breakdowns for stablecoins."
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
              Safety score
              <NumInput
                value={filters.minRiskScore > 0 ? String(filters.minRiskScore) : ''}
                onChange={(v) => setFilters({ minRiskScore: v === '' ? 0 : Number(v) })}
                placeholder="min"
              />
              <span className="text-text-muted/50">–</span>
              <NumInput
                value={filters.maxRiskScore < 100 ? String(filters.maxRiskScore) : ''}
                onChange={(v) => setFilters({ maxRiskScore: v === '' ? 100 : Number(v) })}
                placeholder="max"
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

            <label className="flex items-center gap-1.5 text-xs text-text-muted">
              Band
              <select
                value={filters.riskBand}
                onChange={(e) => setFilters({ riskBand: e.target.value as RiskBand | 'all' })}
                className="rounded border border-border bg-bg-elevated px-2 py-1 text-xs text-text-primary focus:border-accent-blue/50 focus:outline-none"
              >
                {RISK_BAND_OPTIONS.map(({ value, label }) => (
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

          <p className="text-[11px] text-text-muted text-center">
            Live prices via CoinGecko · Safety Scores are derived analytics (0–100, higher = safer), not investment advice
          </p>
        </div>
      )}

      {/* Reserve Monitor tab */}
      {tab === 'reserves' && (
        <ErrorBoundary>
          <ReserveMonitor />
        </ErrorBoundary>
      )}
    </div>
  )
}
