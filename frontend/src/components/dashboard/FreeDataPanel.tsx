'use client'

import { useQuery } from '@tanstack/react-query'
import { TrendingUp, TrendingDown, Minus, Bitcoin, Activity, BarChart2, DollarSign, RefreshCw } from 'lucide-react'
import { clsx } from 'clsx'
import { formatCompact } from '@/lib/utils/format'
import type { FearGreedData } from '@/app/live-data/fear-greed/route'
import type { BtcStatsData } from '@/app/live-data/btc-stats/route'
import type { DefiTvlData } from '@/app/live-data/defi-tvl/route'
import type { FundingRate } from '@/app/live-data/funding-rates/route'

// ─── Fear & Greed ─────────────────────────────────────────────────────────────

const FG_COLOR: Record<string, string> = {
  'Extreme Fear': 'text-red-400',
  'Fear': 'text-orange-400',
  'Neutral': 'text-slate-400',
  'Greed': 'text-emerald-400',
  'Extreme Greed': 'text-green-400',
}

const FG_ARC: Record<string, number> = {
  'Extreme Fear': 0, 'Fear': 25, 'Neutral': 50, 'Greed': 75, 'Extreme Greed': 100,
}

function FearGreedGauge({ value, classification }: { value: number; classification: string }) {
  const pct = value / 100
  const circumference = 2 * Math.PI * 36
  const offset = circumference * (1 - pct * 0.75) // 270° arc
  const color = value <= 24 ? '#ef4444' : value <= 44 ? '#f97316' : value <= 55 ? '#94a3b8' : value <= 75 ? '#10b981' : '#22c55e'

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="96" height="72" viewBox="0 0 96 72">
        {/* Background arc */}
        <circle cx="48" cy="60" r="36" fill="none" stroke="rgba(148,163,184,0.1)"
          strokeWidth="8" strokeDasharray={`${circumference * 0.75} ${circumference}`}
          strokeDashoffset={circumference * 0.125} strokeLinecap="round"
          transform="rotate(-225 48 60)" />
        {/* Value arc */}
        <circle cx="48" cy="60" r="36" fill="none" stroke={color}
          strokeWidth="8" strokeDasharray={`${circumference * 0.75 * pct} ${circumference}`}
          strokeDashoffset={circumference * 0.125} strokeLinecap="round"
          transform="rotate(-225 48 60)" style={{ transition: 'stroke-dasharray 0.6s ease' }} />
        <text x="48" y="58" textAnchor="middle" dominantBaseline="middle"
          fill={color} fontSize="18" fontWeight="bold" fontFamily="monospace">
          {value}
        </text>
      </svg>
      <span className={clsx('text-xs font-semibold', FG_COLOR[classification] ?? 'text-slate-400')}>
        {classification}
      </span>
    </div>
  )
}

function FearGreedCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['fear-greed'],
    queryFn: async () => {
      const res = await fetch('/live-data/fear-greed')
      if (!res.ok) throw new Error('failed')
      return res.json() as Promise<FearGreedData>
    },
    staleTime: 3_600_000,
    refetchInterval: 3_600_000,
  })

  return (
    <div className="rounded-xl border border-border bg-bg-card p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Activity size={14} className="text-text-muted" />
        <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">Fear & Greed Index</span>
        <span className="ml-auto text-[10px] text-text-muted">Alternative.me</span>
      </div>

      {isLoading ? (
        <div className="h-24 rounded bg-bg-elevated animate-pulse" />
      ) : data ? (
        <>
          <div className="flex items-center justify-center">
            <FearGreedGauge value={data.value} classification={data.classification} />
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { label: 'Yesterday', value: data.previousClose },
              { label: '1W Ago', value: data.weekAgo },
              { label: '1M Ago', value: data.monthAgo },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg bg-bg-elevated p-2">
                <p className="text-[10px] text-text-muted">{label}</p>
                <p className="text-sm font-mono font-bold text-text-primary">{value ?? '—'}</p>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="text-xs text-text-muted text-center py-4">Unable to load</p>
      )}
    </div>
  )
}

// ─── BTC Stats ────────────────────────────────────────────────────────────────

function BtcStatsCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['btc-stats'],
    queryFn: async () => {
      const res = await fetch('/live-data/btc-stats')
      if (!res.ok) throw new Error('failed')
      return res.json() as Promise<BtcStatsData>
    },
    staleTime: 300_000,
    refetchInterval: 300_000,
  })

  const stats = data ? [
    { label: 'Block Height', value: data.blockHeight?.toLocaleString() ?? '—' },
    { label: 'Hashrate', value: data.hashrateTHs ? `${(data.hashrateTHs / 1e6).toFixed(1)} EH/s` : '—' },
    { label: 'Difficulty', value: data.difficulty ? formatCompact(data.difficulty) : '—' },
    { label: 'Mempool TXs', value: data.mempoolTxCount?.toLocaleString() ?? '—' },
    { label: 'Mempool Size', value: data.mempoolSizeMb ? `${data.mempoolSizeMb.toFixed(1)} MB` : '—' },
    { label: 'Avg Block', value: data.avgBlockTimeSec ? `${(data.avgBlockTimeSec / 60).toFixed(1)} min` : '—' },
    { label: 'Next Halving', value: data.estimatedHalvingDate ?? '—' },
    { label: 'Blocks Left', value: data.blocksUntilHalving?.toLocaleString() ?? '—' },
  ] : []

  return (
    <div className="rounded-xl border border-border bg-bg-card p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Bitcoin size={14} className="text-amber-400" />
        <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">BTC Network Stats</span>
        <span className="ml-auto text-[10px] text-text-muted">Blockchain.info + Mempool.space</span>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-12 rounded bg-bg-elevated animate-pulse" />
          ))}
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            {stats.map(({ label, value }) => (
              <div key={label} className="rounded-lg bg-bg-elevated px-3 py-2">
                <p className="text-[10px] text-text-muted">{label}</p>
                <p className="text-xs font-mono font-semibold text-text-primary truncate">{value}</p>
              </div>
            ))}
          </div>
          {data.fees.fastestSatVb && (
            <div>
              <p className="text-[10px] text-text-muted mb-1.5">Fee Estimates (sat/vB)</p>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { label: 'Fast', value: data.fees.fastestSatVb, color: 'text-red-400' },
                  { label: '30 min', value: data.fees.halfHourSatVb, color: 'text-orange-400' },
                  { label: '1 hr', value: data.fees.hourSatVb, color: 'text-yellow-400' },
                  { label: 'Economy', value: data.fees.economySatVb, color: 'text-emerald-400' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="rounded-lg bg-bg-elevated px-2 py-1.5 text-center">
                    <p className="text-[9px] text-text-muted">{label}</p>
                    <p className={clsx('text-xs font-mono font-bold', color)}>{value ?? '—'}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <p className="text-xs text-text-muted text-center py-4">Unable to load</p>
      )}
    </div>
  )
}

// ─── DeFi TVL ─────────────────────────────────────────────────────────────────

function DefiTvlCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['defi-tvl'],
    queryFn: async () => {
      const res = await fetch('/live-data/defi-tvl')
      if (!res.ok) throw new Error('failed')
      return res.json() as Promise<DefiTvlData>
    },
    staleTime: 300_000,
    refetchInterval: 300_000,
  })

  return (
    <div className="rounded-xl border border-border bg-bg-card p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <BarChart2 size={14} className="text-blue-400" />
        <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">DeFi Overview</span>
        <span className="ml-auto text-[10px] text-text-muted">DefiLlama</span>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-8 rounded bg-bg-elevated animate-pulse" />)}
        </div>
      ) : data ? (
        <>
          {/* Headline stats */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Top-20 Chain TVL', value: formatCompact(data.totalTvl), color: 'text-blue-400' },
              { label: 'DEX Volume 24h', value: data.dexVolume24h ? formatCompact(data.dexVolume24h) : '—', color: 'text-violet-400' },
              { label: 'Fee Revenue 24h', value: data.feeRevenue24h ? formatCompact(data.feeRevenue24h) : '—', color: 'text-emerald-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-lg bg-bg-elevated p-2 text-center">
                <p className="text-[10px] text-text-muted">{label}</p>
                <p className={clsx('text-sm font-mono font-bold', color)}>{value}</p>
              </div>
            ))}
          </div>

          {/* Top chains */}
          <div>
            <p className="text-[10px] text-text-muted mb-1.5 uppercase tracking-wide">Top Chains by TVL</p>
            <div className="space-y-1">
              {data.chains.slice(0, 6).map((chain) => {
                const maxTvl = data.chains[0]?.tvl ?? 1
                const pct = (chain.tvl / maxTvl) * 100
                return (
                  <div key={chain.name} className="flex items-center gap-2">
                    <span className="text-[11px] text-text-secondary w-20 truncate">{chain.name}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-bg-elevated overflow-hidden">
                      <div className="h-full rounded-full bg-blue-500/70" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[11px] font-mono text-text-muted w-16 text-right">{formatCompact(chain.tvl)}</span>
                    {chain.change24h !== null && (
                      <span className={clsx('text-[10px] font-mono w-12 text-right', chain.change24h >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                        {chain.change24h >= 0 ? '+' : ''}{chain.change24h.toFixed(1)}%
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </>
      ) : (
        <p className="text-xs text-text-muted text-center py-4">Unable to load</p>
      )}
    </div>
  )
}

// ─── Funding Rates ────────────────────────────────────────────────────────────

function FundingRatesCard() {
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['funding-rates'],
    queryFn: async () => {
      const res = await fetch('/live-data/funding-rates')
      if (!res.ok) throw new Error('failed')
      return res.json() as Promise<{ ok: boolean; rates: FundingRate[]; updatedAt: string }>
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  })

  return (
    <div className="rounded-xl border border-border bg-bg-card p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <DollarSign size={14} className="text-violet-400" />
        <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">Funding Rates</span>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="ml-auto p-1 rounded text-text-muted hover:text-text-secondary transition-colors disabled:opacity-50"
        >
          <RefreshCw size={10} className={isFetching ? 'animate-spin' : ''} />
        </button>
        <span className="text-[10px] text-text-muted">OKX Futures</span>
      </div>

      {isLoading ? (
        <div className="space-y-1.5">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-7 rounded bg-bg-elevated animate-pulse" />)}
        </div>
      ) : data?.rates.length ? (
        <div className="space-y-1">
          <div className="grid grid-cols-4 text-[10px] text-text-muted px-2 pb-1">
            <span>Symbol</span><span className="text-right">Rate</span><span className="text-right">Annual</span><span className="text-right">OI</span>
          </div>
          {data.rates.slice(0, 10).map((r) => {
            const isPositive = r.fundingRate >= 0
            return (
              <div key={r.symbol} className="grid grid-cols-4 items-center px-2 py-1 rounded hover:bg-bg-elevated transition-colors text-xs">
                <span className="font-mono font-bold text-text-primary">{r.symbol}</span>
                <span className={clsx('text-right font-mono text-[11px]', isPositive ? 'text-emerald-400' : 'text-red-400')}>
                  {isPositive ? '+' : ''}{(r.fundingRate * 100).toFixed(4)}%
                </span>
                <span className={clsx('text-right font-mono text-[11px]', isPositive ? 'text-emerald-400' : 'text-red-400')}>
                  {isPositive ? '+' : ''}{r.annualized.toFixed(1)}%
                </span>
                <span className="text-right text-[11px] text-text-muted">
                  {r.openInterestUsd ? formatCompact(r.openInterestUsd) : '—'}
                </span>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-xs text-text-muted text-center py-4">Unable to load funding rates</p>
      )}
    </div>
  )
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export function FreeDataPanel() {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-text-primary">Free Data Feeds</h2>
        <p className="text-xs text-text-muted mt-0.5">Live data from keyless public APIs</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <FearGreedCard />
        <BtcStatsCard />
        <DefiTvlCard />
        <FundingRatesCard />
      </div>
    </div>
  )
}
