'use client'

import { useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  Copy, CheckCircle, ExternalLink, ChevronLeft, TrendingUp, TrendingDown,
  Clock, Globe, Shield, Activity, BookOpen
} from 'lucide-react'
import { clsx } from 'clsx'
import { useAsset } from '@/hooks/useAssets'
import { PegDeviationChart } from '@/components/analytics/PegDeviationChart'
import { ReserveComposition } from '@/components/analytics/ReserveComposition'
import { ScoreBreakdown } from '@/components/analytics/ScoreBreakdown'
import { HistoricalScoreChart } from '@/components/analytics/HistoricalScoreChart'
import { LiquidityDepthChart } from '@/components/analytics/LiquidityDepthChart'
import { WalletConcentration } from '@/components/analytics/WalletConcentration'
import { VelocityChart } from '@/components/analytics/VelocityChart'
import { PriceHistoryChart } from '@/components/analytics/PriceHistoryChart'
import { RiskScoreBadge, RiskBandPill } from '@/components/assets/RiskScoreBadge'
import { MetricCard } from '@/components/ui/MetricCard'
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { formatCompact, formatAddress, formatCurrency, formatBps, formatDate, formatScore, formatPercent } from '@/lib/utils/format'
import { getPegDeviationColorClass, getScoreColor } from '@/lib/utils/risk'
import { ASSET_TYPE_LABELS, BLOCKCHAIN_LABELS } from '@/lib/constants'

type Tab = 'overview' | 'analytics' | 'reserves' | 'risk-history'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'reserves', label: 'Reserves' },
  { id: 'risk-history', label: 'Risk History' },
]

function AssetHeader({ asset }: { asset: NonNullable<ReturnType<typeof useAsset>['data']> }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(asset.contractAddress)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [asset.contractAddress])

  const priceUp = asset.latestMarketData?.priceChange24h ?? 0 >= 0
  const pegClass = getPegDeviationColorClass(asset.pegDeviation)

  return (
    <div className="rounded-card border border-border bg-bg-card p-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        {/* Left: identity */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="font-mono font-extrabold text-3xl text-text-primary">{asset.symbol}</h1>
            <RiskBandPill band={asset.riskBand} size="md" />
            <span className="px-2.5 py-1 text-xs rounded border border-border bg-bg-elevated text-text-secondary font-mono">
              {ASSET_TYPE_LABELS[asset.assetType] ?? asset.assetType}
            </span>
            <span className="px-2.5 py-1 text-xs rounded border border-border bg-bg-elevated text-text-secondary font-mono">
              {BLOCKCHAIN_LABELS[asset.blockchain] ?? asset.blockchain}
            </span>
            {!asset.isActive && (
              <span className="px-2 py-0.5 text-xs rounded bg-red-500/10 text-red-400 border border-red-500/30 font-mono">
                INACTIVE
              </span>
            )}
          </div>

          <div className="text-text-secondary text-sm">{asset.name}</div>
          {asset.description && (
            <p className="text-xs text-text-muted max-w-xl leading-relaxed">{asset.description}</p>
          )}

          {/* Contract address */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">Contract:</span>
            <code className="font-mono text-xs text-text-secondary">
              {formatAddress(asset.contractAddress, 6)}
            </code>
            <button
              onClick={handleCopy}
              className="text-text-muted hover:text-text-secondary transition-colors"
              aria-label="Copy contract address"
            >
              {copied
                ? <CheckCircle size={12} className="text-emerald-400" aria-hidden />
                : <Copy size={12} aria-hidden />}
            </button>
            {asset.website && (
              <a
                href={asset.website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium text-text-muted hover:text-accent-blue hover:bg-accent-blue/10 border border-border hover:border-accent-blue/30 transition-all"
                aria-label={`Visit ${asset.name} website`}
              >
                <Globe size={11} aria-hidden />
                Website
              </a>
            )}
            {asset.whitepaper && (
              <a
                href={asset.whitepaper}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium text-text-muted hover:text-accent-blue hover:bg-accent-blue/10 border border-border hover:border-accent-blue/30 transition-all"
                aria-label={`Read ${asset.name} whitepaper`}
              >
                <BookOpen size={11} aria-hidden />
                Whitepaper
              </a>
            )}
          </div>
        </div>

        {/* Right: risk score gauge */}
        <div className="flex items-center gap-6 flex-shrink-0">
          {/* Risk score */}
          <div className="flex flex-col items-center gap-1">
            <div className="text-[10px] text-text-muted uppercase tracking-wide">Risk Score</div>
            <div
              className="font-mono font-extrabold text-5xl tabular-nums"
              style={{ color: getScoreColor(asset.riskScore) }}
            >
              {formatScore(asset.riskScore)}
            </div>
            <RiskScoreBadge score={asset.riskScore} band={asset.riskBand} showLabel size="md" />
          </div>

          {/* Quick stats */}
          <div className="flex flex-col gap-2 min-w-32">
            <div>
              <div className="text-[10px] text-text-muted uppercase">Price</div>
              <div className="font-mono text-sm text-text-primary">
                {formatCurrency(asset.price, 4)}
                <span className={clsx('ml-2 text-xs', priceUp ? 'text-emerald-400' : 'text-red-400')}>
                  {priceUp ? '+' : ''}{(asset.latestMarketData?.priceChange24h ?? 0).toFixed(3)}%
                </span>
              </div>
            </div>
            <div>
              <div className="text-[10px] text-text-muted uppercase">Peg Dev</div>
              <div className={clsx('font-mono text-sm', pegClass)}>
                {formatBps(asset.pegDeviation)}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-text-muted uppercase">Market Cap</div>
              <div className="font-mono text-sm text-text-primary">{formatCompact(asset.marketCap)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Issuer + last updated */}
      {(asset.issuer) && (
        <div className="flex items-center gap-4 mt-4 pt-4 border-t border-border text-xs text-text-muted">
          <div className="flex items-center gap-1.5">
            <Shield size={11} aria-hidden />
            <span>Issuer: <span className="text-text-secondary">{asset.issuer}</span></span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock size={11} aria-hidden />
            <span>Updated: <span className="text-text-secondary font-mono">{formatDate(asset.updatedAt, 'MMM dd, HH:mm')}</span></span>
          </div>
        </div>
      )}
    </div>
  )
}

function OverviewTab({ asset }: { asset: NonNullable<ReturnType<typeof useAsset>['data']> }) {
  const { latestMarketData: md, latestRiskScore: rs } = asset

  return (
    <div className="space-y-6">
      {/* Market metrics */}
      <div>
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Market Metrics</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard
            title="Market Cap"
            value={formatCompact(md.marketCap)}
            icon={<Activity size={14} />}
            accentColor="#3b82f6"
          />
          <MetricCard
            title="24h Volume"
            value={formatCompact(md.volume24h)}
            icon={<TrendingUp size={14} />}
            accentColor="#10b981"
          />
          <MetricCard
            title="Circulating Supply"
            value={formatCompact(md.circulatingSupply)}
            icon={<Globe size={14} />}
            accentColor="#f59e0b"
          />
          <MetricCard
            title="Reserve Ratio"
            value={`${(asset.reserveRatio * 100).toFixed(2)}%`}
            icon={<Shield size={14} />}
            accentColor={asset.reserveRatio >= 1 ? '#10b981' : '#ef4444'}
          />
        </div>
      </div>

      {/* Risk components */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-card border border-border bg-bg-card p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Score Breakdown</h3>
          <ErrorBoundary>
            <ScoreBreakdown breakdown={rs.scoreBreakdown} />
          </ErrorBoundary>
        </div>

        <div className="rounded-card border border-border bg-bg-card p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Confidence &amp; Percentile</h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-text-secondary">Model Confidence</span>
                <span className="font-mono text-text-primary">{(rs.confidence * 100).toFixed(1)}%</span>
              </div>
              <div className="h-2 bg-bg-elevated rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-accent-blue"
                  style={{ width: `${rs.confidence * 100}%` }}
                  role="progressbar"
                  aria-valuenow={Math.round(rs.confidence * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-text-secondary">Percentile Rank</span>
                <span className="font-mono text-text-primary">{rs.percentileRank}th</span>
              </div>
              <div className="h-2 bg-bg-elevated rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${rs.percentileRank}%` }}
                  role="progressbar"
                  aria-valuenow={rs.percentileRank}
                  aria-valuemin={0}
                  aria-valuemax={100}
                />
              </div>
            </div>

            <div className="pt-3 border-t border-border space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-text-muted">Previous Score</span>
                <span className="font-mono text-text-secondary">
                  {rs.previousScore != null ? formatScore(rs.previousScore) : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-text-muted">Score Delta</span>
                <span className={clsx(
                  'font-mono',
                  rs.scoreDelta != null && rs.scoreDelta > 0 ? 'text-emerald-400' : 'text-red-400'
                )}>
                  {rs.scoreDelta != null ? `${rs.scoreDelta > 0 ? '+' : ''}${rs.scoreDelta.toFixed(2)}` : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-text-muted">Score Date</span>
                <span className="font-mono text-text-secondary">{formatDate(rs.scoreDate, 'MMM dd, HH:mm')}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function AnalyticsTab({ asset }: { asset: NonNullable<ReturnType<typeof useAsset>['data']> }) {
  const [pegRange, setPegRange] = useState<import('@/types/api').TimeRange>('7d')
  const { analyticsBundle } = asset

  return (
    <div className="space-y-6">
      {/* Full price history — top of analytics */}
      <ErrorBoundary>
        <PriceHistoryChart assetId={asset.id} symbol={asset.symbol} pegTarget={asset.pegTarget ?? 1.0} />
      </ErrorBoundary>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ErrorBoundary>
          <PegDeviationChart
            data={analyticsBundle.pegHistory}
            assetSymbol={asset.symbol}
            timeRange={pegRange}
            onTimeRangeChange={setPegRange}
          />
        </ErrorBoundary>

        <ErrorBoundary>
          <LiquidityDepthChart
            data={analyticsBundle.liquidityDepth}
            currentPrice={asset.price}
          />
        </ErrorBoundary>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ErrorBoundary>
          <WalletConcentration data={analyticsBundle.walletConcentration} />
        </ErrorBoundary>

        <ErrorBoundary>
          <VelocityChart data={analyticsBundle.transferVelocity} />
        </ErrorBoundary>
      </div>
    </div>
  )
}

function ReservesTab({ asset }: { asset: NonNullable<ReturnType<typeof useAsset>['data']> }) {
  const { latestReserve } = asset

  return (
    <div className="space-y-6">
      {/* Reserve summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          title="Total Reserves"
          value={formatCompact(latestReserve.totalReserves)}
          accentColor="#10b981"
        />
        <MetricCard
          title="Total Liabilities"
          value={formatCompact(latestReserve.totalLiabilities)}
          accentColor="#3b82f6"
        />
        <MetricCard
          title="Collateralization"
          value={`${(latestReserve.reserveRatio * 100).toFixed(2)}%`}
          accentColor={latestReserve.reserveRatio >= 1 ? '#10b981' : '#ef4444'}
        />
        <MetricCard
          title="Attestation Date"
          value={formatDate(latestReserve.attestationDate, 'MMM dd, yyyy')}
          accentColor="#f59e0b"
          footer={
            <div className="flex items-center gap-1.5 text-[10px] text-text-muted">
              <span className="size-1.5 rounded-full bg-emerald-400" />
              <span>Verified by {latestReserve.attestor}</span>
            </div>
          }
        />
      </div>

      {/* Composition */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ErrorBoundary>
          <ReserveComposition
            composition={latestReserve.composition}
            collateralizationRatio={latestReserve.reserveRatio}
            totalReserves={latestReserve.totalReserves}
          />
        </ErrorBoundary>

        {/* Reserve attestation detail */}
        <div className="rounded-card border border-border bg-bg-card p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Attestation Detail</h3>
          <div className="space-y-3">
            {latestReserve.composition.map((item) => (
              <div key={item.category} className="flex flex-col gap-1">
                <div className="flex justify-between text-xs">
                  <span className="text-text-secondary">{item.category}</span>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-text-muted">{formatCompact(item.amount)}</span>
                    <span className="font-mono text-text-primary w-12 text-right">{item.percentage.toFixed(1)}%</span>
                  </div>
                </div>
                <div className="h-1.5 bg-bg-elevated rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${item.percentage}%`,
                      backgroundColor: '#3b82f6',
                    }}
                    role="progressbar"
                    aria-valuenow={Math.round(item.percentage)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  />
                </div>
                <div className="text-[10px] text-text-muted">{item.description}</div>
              </div>
            ))}
          </div>

          {latestReserve.reportUrl && (
            <a
              href={latestReserve.reportUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 flex items-center gap-1.5 text-xs text-accent-blue hover:text-blue-300 transition-colors"
            >
              <ExternalLink size={12} aria-hidden />
              View Full Attestation Report
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

export default function AssetDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  const { data: asset, isLoading, isError, refetch } = useAsset(params.id)

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-screen-2xl mx-auto">
        <LoadingSkeleton className="h-48 rounded-card" />
        <div className="flex gap-4">
          {TABS.map((t) => <LoadingSkeleton key={t.id} className="h-8 w-24 rounded" />)}
        </div>
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }, (_, i) => <LoadingSkeleton key={i} className="h-28 rounded-card" />)}
        </div>
      </div>
    )
  }

  if (isError || !asset) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24">
        <p className="text-sm text-text-muted">Asset not found or failed to load</p>
        <div className="flex gap-3">
          <button
            onClick={() => refetch()}
            className="px-3 py-1.5 rounded text-xs bg-bg-elevated border border-border text-text-secondary hover:text-text-primary transition-colors"
          >
            Retry
          </button>
          <button
            onClick={() => router.push('/assets')}
            className="px-3 py-1.5 rounded text-xs bg-accent-blue/10 border border-accent-blue/30 text-accent-blue hover:bg-accent-blue/20 transition-colors"
          >
            Back to Assets
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-screen-2xl mx-auto">
      {/* Back button */}
      <button
        onClick={() => router.push('/assets')}
        className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors"
        aria-label="Back to assets list"
      >
        <ChevronLeft size={14} aria-hidden />
        All Assets
      </button>

      {/* Header */}
      <ErrorBoundary>
        <AssetHeader asset={asset} />
      </ErrorBoundary>

      {/* Tabs */}
      <div className="flex items-center gap-0.5 border-b border-border" role="tablist">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            role="tab"
            aria-selected={activeTab === id}
            onClick={() => setActiveTab(id)}
            className={clsx(
              'px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
              activeTab === id
                ? 'border-accent-blue text-accent-blue'
                : 'border-transparent text-text-muted hover:text-text-secondary hover:border-border-strong'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div role="tabpanel">
        {activeTab === 'overview' && (
          <ErrorBoundary>
            <OverviewTab asset={asset} />
          </ErrorBoundary>
        )}
        {activeTab === 'analytics' && (
          <ErrorBoundary>
            <AnalyticsTab asset={asset} />
          </ErrorBoundary>
        )}
        {activeTab === 'reserves' && (
          <ErrorBoundary>
            <ReservesTab asset={asset} />
          </ErrorBoundary>
        )}
        {activeTab === 'risk-history' && (
          <ErrorBoundary>
            <HistoricalScoreChart assetId={asset.id} assetSymbol={asset.symbol} />
          </ErrorBoundary>
        )}
      </div>
    </div>
  )
}
