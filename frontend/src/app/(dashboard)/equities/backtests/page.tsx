'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FlaskConical, AlertTriangle, Loader2 } from 'lucide-react'
import { clsx } from 'clsx'
import { format } from 'date-fns'
import { ModuleGate } from '@/components/layout/ModuleGate'
import { PageHeader } from '@/components/ui/PageHeader'
import { MetricCard } from '@/components/ui/MetricCard'
import { AreaChart } from '@/components/charts/AreaChart'
import { LiveUnavailable } from '@/components/ui/LiveUnavailable'
import { rsi, sma, macd } from '@/lib/utils/indicators'
import { runEquityBacktest } from '@/lib/utils/equityBacktest'
import { EQUITY_CATALOG } from '@/lib/data/equityCatalog'
import { formatCurrency, formatPercent } from '@/lib/utils/format'
import type { SecurityOhlcvResponse } from '@/app/live-data/security-ohlcv/route'

// Equities counterpart of the crypto Backtests page. Where the crypto page
// replays the risk model against historical depeg case studies, this one runs
// real strategy backtests on actual price history — same educational intent,
// live math instead of curated narratives.

const PERIODS = [
  { value: '1Y',  label: '1 Year (daily)',    barsPerYear: 252 },
  { value: '5Y',  label: '5 Years (weekly)',  barsPerYear: 52 },
  { value: 'MAX', label: 'Max (monthly)',     barsPerYear: 12 },
] as const
type Period = typeof PERIODS[number]['value']

interface StrategyDef {
  id: string
  name: string
  description: string
  /** Returns desired position (true = long) computed from data up to bar i. */
  positions: (closes: number[]) => boolean[]
}

const STRATEGIES: StrategyDef[] = [
  {
    id: 'sma-cross',
    name: 'SMA Crossover (10/40)',
    description: 'Long while the 10-period average is above the 40-period average — classic trend following. Whipsaws sideways markets; shines in sustained trends.',
    positions: (closes) => {
      const fast = sma(closes, 10)
      const slow = sma(closes, 40)
      return closes.map((_, i) => {
        const f = fast[i]; const s = slow[i]
        return f != null && s != null && f > s
      })
    },
  },
  {
    id: 'rsi-reversion',
    name: 'RSI Mean Reversion',
    description: 'Buys when RSI(14) drops below 30 (oversold), exits when it recovers above 55. Bets that sharp dips in quality names get bought.',
    positions: (closes) => {
      const rsiVals = rsi(closes, 14)
      let long = false
      return closes.map((_, i) => {
        const value = rsiVals[i]
        if (value == null) return long
        if (!long && value < 30) long = true
        else if (long && value > 55) long = false
        return long
      })
    },
  },
  {
    id: 'macd-momentum',
    name: 'MACD Momentum',
    description: 'Long while the MACD line is above its signal line — a faster momentum filter than SMA crossover, with more trades and more noise.',
    positions: (closes) => {
      const m = macd(closes)
      return closes.map((_, i) => {
        const line = m.macd[i]; const signal = m.signal[i]
        return line != null && signal != null && line > signal
      })
    },
  },
]

// Transaction-cost tiers (per side). 0 = the naive frictionless backtest.
const FEE_TIERS = [
  { bps: 0,  label: 'No fees' },
  { bps: 5,  label: '0.05%' },
  { bps: 10, label: '0.10%' },
  { bps: 25, label: '0.25%' },
] as const

// ─── Page ─────────────────────────────────────────────────────────────────────

function EquityBacktestsContent() {
  const [symbol, setSymbol] = useState('AAPL')
  const [period, setPeriod] = useState<Period>('5Y')
  const [strategyId, setStrategyId] = useState('sma-cross')
  const [feeBps, setFeeBps] = useState<number>(0)

  const { data, isLoading } = useQuery<SecurityOhlcvResponse>({
    queryKey: ['security-ohlcv', symbol, period],
    queryFn: () => fetch(`/live-data/security-ohlcv?symbol=${encodeURIComponent(symbol)}&range=${period}`).then((r) => r.json()),
    staleTime: 10 * 60 * 1000,
  })

  const strategy = STRATEGIES.find((s) => s.id === strategyId) ?? STRATEGIES[0]
  const barsPerYear = PERIODS.find((p) => p.value === period)?.barsPerYear ?? 252

  const result = useMemo(() => {
    const candles = data?.candles ?? []
    if (candles.length < 50) return null
    const closes = candles.map((c) => c.close)
    const times = candles.map((c) => c.time)
    return runEquityBacktest(times, closes, strategy.positions(closes), barsPerYear, { feeBps })
  }, [data, strategy, barsPerYear, feeBps])

  const beatMarket = result != null && result.totalReturnPct > result.buyHoldReturnPct

  return (
    <div className="flex flex-col gap-6 p-6 max-w-6xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="size-9 rounded-lg bg-violet-400/10 border border-violet-500/20 flex items-center justify-center">
          <FlaskConical size={18} className="text-violet-400" aria-hidden />
        </div>
        <PageHeader
          title="Strategy Backtests"
          subtitle="Run rules-based strategies against real price history, benchmarked to buy & hold"
          description="Each strategy is simulated bar-by-bar on actual Yahoo Finance history with no lookahead: the position taken on each bar comes from the signal computed on the previous bar. Apply an optional per-side transaction cost below; slippage, dividends, and taxes are still not modelled."
          details={[
            { label: 'Sharpe ratio', text: 'Mean bar return over its standard deviation, annualized by bar frequency. Above ~1 is good; below 0 means the strategy lost money per unit of risk.' },
            { label: 'Exposure', text: 'Fraction of bars the strategy held the stock — lower exposure with similar return means less time at risk.' },
          ]}
        />
      </div>

      {/* Disclaimer */}
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 flex gap-3">
        <AlertTriangle size={16} className="text-amber-400 flex-shrink-0 mt-0.5" aria-hidden />
        <p className="text-xs text-text-muted leading-relaxed">
          <span className="font-medium text-amber-300">Educational, not investment advice.</span>{' '}
          Past performance does not predict future results. Even with a transaction cost applied, these
          simulations still ignore slippage, dividends, and taxes — real-world results would differ, usually
          for the worse.
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          className="bg-bg-secondary border border-border rounded px-2 py-1.5 text-sm text-text-primary font-mono focus:outline-none focus:border-accent-blue/60"
        >
          {EQUITY_CATALOG.map((e) => (
            <option key={e.symbol} value={e.symbol}>{e.symbol} — {e.name}</option>
          ))}
        </select>
        <div className="flex items-center gap-0.5 bg-bg-elevated border border-border rounded p-0.5">
          {PERIODS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setPeriod(value)}
              className={clsx('px-2.5 py-1 rounded text-[11px] font-medium transition-colors',
                period === value ? 'bg-accent-blue/20 text-accent-blue' : 'text-text-muted hover:text-text-secondary')}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Transaction-cost tier (per side) */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-text-muted">Fee / side</span>
          <div className="flex items-center gap-0.5 bg-bg-elevated border border-border rounded p-0.5">
            {FEE_TIERS.map(({ bps, label }) => (
              <button
                key={bps}
                onClick={() => setFeeBps(bps)}
                title="Transaction cost charged once per side (each entry and each exit)"
                className={clsx('px-2.5 py-1 rounded text-[11px] font-medium transition-colors',
                  feeBps === bps ? 'bg-accent-blue/20 text-accent-blue' : 'text-text-muted hover:text-text-secondary')}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Strategy cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        {STRATEGIES.map((s) => (
          <button
            key={s.id}
            onClick={() => setStrategyId(s.id)}
            className={clsx('rounded-xl border p-4 text-left transition-all',
              strategyId === s.id
                ? 'border-accent-blue/50 bg-accent-blue/5'
                : 'border-border bg-bg-card hover:border-border-hover hover:bg-bg-elevated')}
          >
            <p className={clsx('text-sm font-semibold', strategyId === s.id ? 'text-accent-blue' : 'text-text-primary')}>
              {s.name}
            </p>
            <p className="mt-1 text-xs text-text-muted leading-relaxed">{s.description}</p>
          </button>
        ))}
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 gap-2 text-slate-500">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">Loading {symbol} history…</span>
        </div>
      ) : result ? (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-6 gap-4">
            <MetricCard
              title="Strategy Return"
              value={formatPercent(result.totalReturnPct, 1)}
              subtitle={`vs ${formatPercent(result.buyHoldReturnPct, 1)} buy & hold`}
              accentColor={beatMarket ? '#10b981' : '#ef4444'}
            />
            <MetricCard
              title="CAGR"
              value={result.cagrPct != null ? formatPercent(result.cagrPct, 1) : '—'}
              subtitle="annualized"
              accentColor="#3b82f6"
            />
            <MetricCard
              title="Max Drawdown"
              value={`−${result.maxDrawdownPct.toFixed(1)}%`}
              subtitle="peak to trough"
              accentColor="#f97316"
            />
            <MetricCard
              title="Sharpe"
              value={result.sharpe != null ? result.sharpe.toFixed(2) : '—'}
              subtitle="annualized"
              accentColor="#8b5cf6"
            />
            <MetricCard
              title="Win Rate"
              value={result.winRatePct != null ? `${result.winRatePct.toFixed(0)}%` : '—'}
              subtitle={`${result.trades.length} round trips`}
              accentColor="#06b6d4"
            />
            <MetricCard
              title="Exposure"
              value={`${result.exposurePct.toFixed(0)}%`}
              subtitle="of bars in market"
              accentColor="#eab308"
            />
          </div>

          {/* Equity curve */}
          <div className="rounded-card border border-border bg-bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-text-secondary">Growth of $100 — {strategy.name} vs Buy &amp; Hold</h2>
              <span className={clsx('text-xs font-medium', beatMarket ? 'text-emerald-400' : 'text-red-400')}>
                {beatMarket ? 'Strategy beat buy & hold' : 'Buy & hold won'}
              </span>
            </div>
            <AreaChart
              data={result.curve}
              series={[
                { key: 'strategy', label: strategy.name, color: beatMarket ? '#10b981' : '#ef4444' },
                { key: 'buyHold', label: 'Buy & Hold', color: '#3b82f6', fillOpacity: 0.3 },
              ]}
              xKey="t"
              xFormatter={(v) => format(new Date(Number(v)), period === '1Y' ? 'MMM' : 'yyyy')}
              yFormatter={(v) => `$${Number(v).toFixed(0)}`}
              tooltipFormatter={(v, name) => [formatCurrency(Number(v)), name]}
              height={300}
              showLegend
              gradientId={`backtest-${symbol}`}
            />
          </div>

          {/* Trades */}
          {result.trades.length > 0 && (
            <div className="rounded-card border border-border bg-bg-card overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h2 className="text-sm font-medium text-text-secondary">
                  Round Trips <span className="text-text-muted font-normal">(latest {Math.min(result.trades.length, 12)} of {result.trades.length})</span>
                  {feeBps > 0 && <span className="text-text-muted font-normal"> · P&amp;L below is gross; headline metrics include the {(feeBps / 100).toFixed(2)}%/side fee</span>}
                </h2>
              </div>
              <div className="grid grid-cols-12 gap-2 px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-text-muted border-b border-border/60">
                <span className="col-span-3">Entry</span>
                <span className="col-span-3">Exit</span>
                <span className="col-span-2 text-right">In</span>
                <span className="col-span-2 text-right">Out</span>
                <span className="col-span-2 text-right">P&amp;L</span>
              </div>
              <div className="divide-y divide-border/60">
                {result.trades.slice(-12).reverse().map((trade, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 px-4 py-2 text-xs items-center">
                    <span className="col-span-3 font-mono text-text-secondary">{format(new Date(trade.entryTime * 1000), 'MMM d, yyyy')}</span>
                    <span className="col-span-3 font-mono text-text-secondary">{format(new Date(trade.exitTime * 1000), 'MMM d, yyyy')}</span>
                    <span className="col-span-2 text-right font-mono tabular-nums text-text-muted">{formatCurrency(trade.entryPrice)}</span>
                    <span className="col-span-2 text-right font-mono tabular-nums text-text-muted">{formatCurrency(trade.exitPrice)}</span>
                    <span className={clsx('col-span-2 text-right font-mono tabular-nums font-medium',
                      trade.returnPct >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                      {formatPercent(trade.returnPct, 1)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <LiveUnavailable
          message="Backtesting needs at least 50 bars of price history and no live source is reachable right now (Yahoo Finance, plus FMP when a key is configured)."
        />
      )}
    </div>
  )
}

export default function EquityBacktestsPage() {
  return (
    <ModuleGate module="equities">
      <EquityBacktestsContent />
    </ModuleGate>
  )
}
