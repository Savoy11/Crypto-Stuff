'use client'

import { useEffect, useState, useMemo, useId } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine,
} from 'recharts'
import {
  Plus, Trash2, Edit2, ArrowLeft, TrendingUp, TrendingDown, Shield,
  AlertTriangle, Info, ChevronDown, ChevronUp, Search, X, Check,
  BarChart2, PieChartIcon, Activity,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { SourceLine } from '@/components/ui/SourceLine'
import { clsx } from 'clsx'
import { hydratePortfolios, usePortfolioStore } from '@/store/usePortfolioStore'
import {
  CATEGORY_META,
} from '@/lib/data/portfolioCoins'
import {
  computeHoldings, computeMetrics, validateHoldings, getDiversificationWarnings,
  computeAnnualIncome, computeBacktestResults, summarizeBacktest,
  type Portfolio, type PortfolioHolding,
} from '@/lib/data/portfolioUtils'
import type { PortfolioPricesResponse } from '@/app/live-data/portfolio-prices/route'
import { INSTRUMENTS, INSTRUMENT_BY_KEY, CLASS_LABELS, formatInstrumentQuote, type Instrument } from '@/lib/data/instruments'
import { fetchInstrumentPrices } from '@/lib/api/instrumentPrices'
import type { PortfolioHistoryResponse } from '@/app/live-data/portfolio-history/route'
import { PortfolioLookThrough } from '@/components/portfolio/PortfolioLookThrough'

// ─── Formatting helpers ───────────────────────────────────────────────────────

function fmt$(n: number, decimals = 2) {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(decimals)}K`
  return `$${n.toFixed(decimals)}`
}
function fmtPct(n: number, showSign = true) {
  const sign = showSign && n > 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}%`
}
function pnlColor(n: number | null) {
  if (n == null) return 'text-text-muted'
  return n >= 0 ? 'text-emerald-400' : 'text-red-400'
}
function riskColor(s: number) {
  if (s <= 3) return 'text-emerald-400'
  if (s <= 5) return 'text-amber-400'
  if (s <= 7) return 'text-orange-400'
  return 'text-red-400'
}
function riskBg(s: number) {
  if (s <= 3) return 'bg-emerald-400'
  if (s <= 5) return 'bg-amber-400'
  if (s <= 7) return 'bg-orange-400'
  return 'bg-red-500'
}

const RISK_LABEL_COLOR: Record<string, string> = {
  Conservative: 'text-emerald-400',
  Moderate:     'text-blue-400',
  Aggressive:   'text-orange-400',
  Speculative:  'text-red-400',
}

// ─── Portfolio card (list view) ───────────────────────────────────────────────

function PortfolioCard({ portfolio, onSelect, onDelete }: {
  portfolio: Portfolio
  onSelect: () => void
  onDelete: () => void
}) {
  const metrics = useMemo(() => {
    const h = computeHoldings(portfolio, {})
    return computeMetrics(portfolio, h)
  }, [portfolio])

  return (
    <div className="bg-bg-card border border-border rounded-xl p-5 hover:border-accent-blue/40 transition-colors cursor-pointer group" onClick={onSelect}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-text-primary">{portfolio.name}</h3>
          {portfolio.description && <p className="text-xs text-text-muted mt-0.5 line-clamp-1">{portfolio.description}</p>}
        </div>
        <button onClick={e => { e.stopPropagation(); onDelete() }}
          className="p-1.5 text-text-muted hover:text-red-400 rounded opacity-0 group-hover:opacity-100 transition-all">
          <Trash2 size={14} />
        </button>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 text-center">
        <div>
          <div className="text-lg font-bold text-text-primary">{fmt$(portfolio.startingCapital, 0)}</div>
          <div className="text-xs text-text-muted">Capital</div>
        </div>
        <div>
          <div className={clsx('text-lg font-bold', riskColor(metrics.weightedRisk))}>{metrics.weightedRisk}</div>
          <div className="text-xs text-text-muted">Risk / 10</div>
        </div>
        <div>
          <div className="text-lg font-bold text-text-primary">{portfolio.holdings.length}</div>
          <div className="text-xs text-text-muted">Holdings</div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1">
        {portfolio.holdings.slice(0, 6).map(h => {
          const meta = INSTRUMENT_BY_KEY[h.cgId]
          return (
            <span key={h.cgId} className="text-[10px] px-1.5 py-0.5 rounded border border-border bg-bg-elevated text-text-muted font-mono">
              {h.symbol} {h.targetAlloc.toFixed(0)}%
            </span>
          )
        })}
        {portfolio.holdings.length > 6 && <span className="text-[10px] text-text-muted">+{portfolio.holdings.length - 6} more</span>}
      </div>
    </div>
  )
}

// ─── Holding row editor ───────────────────────────────────────────────────────

function HoldingRow({ holding, total, onUpdate, onRemove, disabled }: {
  holding: PortfolioHolding
  total: number
  onUpdate: (field: keyof PortfolioHolding, val: unknown) => void
  onRemove: () => void
  disabled?: boolean
}) {
  const meta = INSTRUMENT_BY_KEY[holding.cgId]
  const warn = total > 100.5 || total < 99.5

  return (
    <div className="grid grid-cols-12 gap-2 items-center py-2 border-b border-border/50 last:border-0">
      {/* Coin info */}
      <div className="col-span-4 flex items-center gap-2 min-w-0">
        <div className="size-6 rounded-full shrink-0 flex items-center justify-center text-[9px] font-bold text-white"
          style={{ backgroundColor: meta?.color ?? '#64748b' }}>
          {holding.symbol.slice(0, 2)}
        </div>
        <div className="min-w-0">
          <div className="text-xs font-semibold text-text-primary truncate">{holding.symbol}</div>
          <div className="text-[10px] text-text-muted truncate">{holding.name}</div>
        </div>
      </div>
      {/* Allocation */}
      <div className="col-span-3">
        <div className="flex items-center gap-1">
          <input type="number" min="0.1" max="100" step="0.5"
            value={holding.targetAlloc}
            onChange={e => onUpdate('targetAlloc', parseFloat(e.target.value) || 0)}
            disabled={disabled}
            className={clsx(
              'w-full bg-bg-elevated border rounded px-2 py-1 text-xs text-text-primary text-right focus:outline-none',
              warn ? 'border-amber-500/50' : 'border-border focus:border-accent-blue'
            )} />
          <span className="text-xs text-text-muted">%</span>
        </div>
      </div>
      {/* Entry price */}
      <div className="col-span-4">
        <div className="flex items-center gap-1">
          <span className="text-xs text-text-muted">$</span>
          <input type="number" min="0" step="any" placeholder="Entry price"
            value={holding.entryPrice ?? ''}
            onChange={e => onUpdate('entryPrice', e.target.value === '' ? null : parseFloat(e.target.value))}
            disabled={disabled}
            className="w-full bg-bg-elevated border border-border rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-accent-blue" />
        </div>
      </div>
      {/* Remove */}
      <div className="col-span-1 flex justify-center">
        <button onClick={onRemove} disabled={disabled}
          className="p-1 text-text-muted hover:text-red-400 transition-colors disabled:opacity-30">
          <X size={13} />
        </button>
      </div>
    </div>
  )
}

// ─── Portfolio builder / editor ───────────────────────────────────────────────

function PortfolioEditor({ existing, onSave, onCancel }: {
  existing?: Portfolio
  onSave: (data: Omit<Portfolio, 'id' | 'createdAt' | 'updatedAt'>) => void
  onCancel: () => void
}) {
  const uid = useId()
  const [name,    setName]    = useState(existing?.name ?? '')
  const [desc,    setDesc]    = useState(existing?.description ?? '')
  const [capital, setCapital] = useState(String(existing?.startingCapital ?? 10000))
  const [holdings, setHoldings] = useState<PortfolioHolding[]>(existing?.holdings ?? [])
  const [coinSearch, setCoinSearch] = useState('')
  const [errors, setErrors] = useState<string[]>([])

  const filteredCoins: Instrument[] = useMemo(() => {
    const q = coinSearch.toLowerCase()
    return INSTRUMENTS.filter(c =>
      !holdings.some(h => h.cgId === c.cgId) &&
      (c.symbol.toLowerCase().includes(q) || c.name.toLowerCase().includes(q))
    ).slice(0, 20)
  }, [coinSearch, holdings])

  const allocTotal = holdings.reduce((s, h) => s + (h.targetAlloc || 0), 0)

  function addHolding(coin: Instrument) {
    const even = parseFloat((100 / (holdings.length + 1)).toFixed(1))
    // Redistribute evenly
    const updated: PortfolioHolding[] = holdings.map(h => ({ ...h, targetAlloc: even }))
    updated.push({
      cgId: coin.cgId, symbol: coin.symbol, name: coin.name,
      targetAlloc: even, entryPrice: null, addedAt: new Date().toISOString(),
    })
    setHoldings(updated)
    setCoinSearch('')
  }

  function updateHolding(i: number, field: keyof PortfolioHolding, val: unknown) {
    setHoldings(h => h.map((row, idx) => idx === i ? { ...row, [field]: val } : row))
  }

  function removeHolding(i: number) {
    const next = holdings.filter((_, idx) => idx !== i)
    // Rebalance remaining evenly if all are equal
    setHoldings(next)
  }

  function evenDistribute() {
    if (holdings.length === 0) return
    const each = parseFloat((100 / holdings.length).toFixed(2))
    const last  = parseFloat((100 - each * (holdings.length - 1)).toFixed(2))
    setHoldings(h => h.map((row, i) => ({ ...row, targetAlloc: i === h.length - 1 ? last : each })))
  }

  function handleSave() {
    const errs: string[] = []
    if (!name.trim()) errs.push('Portfolio name is required.')
    const cap = parseFloat(capital)
    if (isNaN(cap) || cap <= 0) errs.push('Starting capital must be a positive number.')
    errs.push(...validateHoldings(holdings))
    setErrors(errs)
    if (errs.length) return
    onSave({ name: name.trim(), description: desc.trim(), startingCapital: cap, holdings })
  }

  const inputCls = 'w-full bg-bg-elevated border border-border rounded px-2.5 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue'
  const labelCls = 'block text-xs text-text-muted mb-1 font-medium'

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={onCancel} className="p-1.5 text-text-muted hover:text-text-primary rounded transition-colors">
          <ArrowLeft size={18} />
        </button>
        <h2 className="text-xl font-bold text-text-primary">{existing ? 'Edit Portfolio' : 'New Portfolio'}</h2>
      </div>

      {/* Basic info */}
      <div className="bg-bg-card border border-border rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-text-primary">Details</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls} htmlFor={`${uid}-name`}>Portfolio Name *</label>
            <input id={`${uid}-name`} className={inputCls} placeholder="e.g. Aggressive Growth, Balanced 2025" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <label className={labelCls} htmlFor={`${uid}-capital`}>Starting Capital (USD) *</label>
            <input id={`${uid}-capital`} className={inputCls} type="number" min="1" placeholder="10000" value={capital} onChange={e => setCapital(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor={`${uid}-desc`}>Description (optional)</label>
            <input id={`${uid}-desc`} className={inputCls} placeholder="Investment thesis or notes" value={desc} onChange={e => setDesc(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Holdings */}
      <div className="bg-bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">Holdings</h3>
          <div className="flex items-center gap-3">
            <div className={clsx('text-xs font-mono', Math.abs(allocTotal - 100) < 0.5 ? 'text-emerald-400' : 'text-amber-400')}>
              {allocTotal.toFixed(1)}% / 100%
            </div>
            <button onClick={evenDistribute} className="text-xs text-text-muted hover:text-accent-blue transition-colors">
              Even split
            </button>
          </div>
        </div>

        {/* Column headers */}
        {holdings.length > 0 && (
          <div className="grid grid-cols-12 gap-2 text-[10px] text-text-muted uppercase tracking-wider px-0 pb-1">
            <div className="col-span-4">Asset</div>
            <div className="col-span-3">Allocation</div>
            <div className="col-span-4">Entry Price (optional)</div>
            <div className="col-span-1" />
          </div>
        )}

        {holdings.map((h, i) => (
          <HoldingRow key={h.cgId} holding={h} total={allocTotal}
            onUpdate={(f, v) => updateHolding(i, f, v)}
            onRemove={() => removeHolding(i)} />
        ))}

        {/* Search to add */}
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input className="w-full pl-8 pr-3 py-2 bg-bg-elevated border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue"
            placeholder="Search to add a coin, stock, or fund…"
            value={coinSearch} onChange={e => setCoinSearch(e.target.value)} />
        </div>
        {coinSearch.length > 0 && (
          <div className="border border-border rounded-lg overflow-hidden divide-y divide-border/50 max-h-48 overflow-y-auto">
            {filteredCoins.length === 0
              ? <div className="py-3 text-center text-xs text-text-muted">No matching coins</div>
              : filteredCoins.map(coin => (
                <button key={coin.cgId} onClick={() => addHolding(coin)}
                  className="w-full flex items-center gap-3 px-3 py-2 hover:bg-bg-elevated transition-colors text-left">
                  <div className="size-6 rounded-full shrink-0 flex items-center justify-center text-[9px] font-bold text-white"
                    style={{ backgroundColor: coin.color }}>
                    {coin.symbol.slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-semibold text-text-primary">{coin.symbol}</span>
                    <span className="text-xs text-text-muted ml-1.5">{coin.name}</span>
                  </div>
                  <span className="text-[10px] text-text-muted px-1.5 py-0.5 rounded bg-bg-card border border-border">
                    {CATEGORY_META[coin.category]?.label}
                  </span>
                  <Plus size={12} className="text-accent-blue shrink-0" />
                </button>
              ))
            }
          </div>
        )}
      </div>

      {errors.length > 0 && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg space-y-1">
          {errors.map((e, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-red-400">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {e}
            </div>
          ))}
        </div>
      )}

      <button onClick={handleSave}
        className="w-full py-2.5 bg-accent-blue hover:bg-blue-600 text-white rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-colors">
        <Check size={16} /> {existing ? 'Save Changes' : 'Create Portfolio'}
      </button>
    </div>
  )
}

// ─── Backtest panel ───────────────────────────────────────────────────────────

function BacktestPanel({ portfolio }: { portfolio: Portfolio }) {
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setFullYear(d.getFullYear() - 1)
    return d.toISOString().split('T')[0]
  })
  const [runDate, setRunDate] = useState<string | null>(null)

  const ids = portfolio.holdings.map(h => h.cgId).join(',')

  const { data: currentData } = useQuery<PortfolioPricesResponse>({
    queryKey: ['portfolio-prices', ids],
    queryFn:  () => fetchInstrumentPrices(ids.split(',').filter(Boolean)),
    staleTime: 60_000, enabled: !!ids,
  })

  const { data: histData, isLoading, error } = useQuery<PortfolioHistoryResponse>({
    queryKey: ['portfolio-history', ids, runDate],
    queryFn:  () => fetch(`/live-data/portfolio-history?ids=${ids}&date=${runDate}`).then(r => r.json()),
    staleTime: Infinity, enabled: !!runDate && !!ids,
  })

  const hasSecurities = portfolio.holdings.some(h => h.cgId.startsWith('sec:'))

  const results = useMemo(() => {
    if (!histData || !currentData) return null
    return computeBacktestResults(portfolio, histData.prices, currentData.prices)
  }, [histData, currentData, portfolio])

  const summary = useMemo(() => results ? summarizeBacktest(results) : null, [results])

  // Chart data
  const chartData = results?.filter(r => r.returnPct != null).map(r => ({
    symbol: r.symbol, return: parseFloat((r.returnPct ?? 0).toFixed(2)), color: r.color,
  })).sort((a, b) => b.return - a.return) ?? []

  const today = new Date().toISOString().split('T')[0]
  const minDate = '2018-01-01'

  return (
    <div className="space-y-5">
      {/* Date picker */}
      <div className="bg-bg-card border border-border rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-text-primary">Backtest Period</h3>
        <p className="text-xs text-text-muted">
          Simulate holding this portfolio from a past date to today. Allocations and entry are hypothetical.
        </p>
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="block text-xs text-text-muted mb-1">Start Date</label>
            <input type="date" min={minDate} max={today}
              value={startDate} onChange={e => setStartDate(e.target.value)}
              className="bg-bg-elevated border border-border rounded px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent-blue" />
          </div>
          <button onClick={() => setRunDate(startDate)}
            className="px-4 py-1.5 bg-accent-blue hover:bg-blue-600 text-white text-sm rounded font-medium flex items-center gap-2 transition-colors">
            <Activity size={14} /> Run Backtest
          </button>
        </div>

        {/* Quick presets */}
        <div className="flex gap-2 flex-wrap">
          {[
            { label: '1M',  months: 1 },
            { label: '3M',  months: 3 },
            { label: '6M',  months: 6 },
            { label: '1Y',  months: 12 },
            { label: '2Y',  months: 24 },
          ].map(({ label, months }) => {
            const d = new Date(); d.setMonth(d.getMonth() - months)
            const val = d.toISOString().split('T')[0]
            return (
              <button key={label}
                onClick={() => { setStartDate(val); setRunDate(val) }}
                className="px-2.5 py-1 text-xs border border-border rounded-full text-text-muted hover:text-accent-blue hover:border-accent-blue/40 transition-colors">
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Results */}
      {isLoading && (
        <div className="flex items-center justify-center py-12 text-text-muted text-sm gap-2">
          <div className="w-4 h-4 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
          Fetching historical prices…
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-2 text-red-400 text-sm">
          <AlertTriangle size={16} /> Failed to load historical data. CoinGecko may be rate-limiting.
        </div>
      )}

      {hasSecurities && (
        <p className="text-[11px] text-amber-400/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
          Historical backtesting covers crypto holdings only for now — stock/fund positions show current value but no historical return until a securities history source is wired in.
        </p>
      )}
      {summary && !isLoading && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: 'Starting Value', value: fmt$(summary.totalThen), sub: runDate ?? '' },
              { label: 'Current Value',  value: fmt$(summary.totalNow),  sub: 'today' },
              { label: 'Total Return',   value: fmtPct(summary.pnlPct),  sub: fmt$(summary.pnlUsd), color: pnlColor(summary.pnlPct) },
              { label: 'Assets with data', value: String(results?.filter(r => r.returnPct != null).length ?? 0), sub: `of ${portfolio.holdings.length}` },
            ].map(({ label, value, sub, color }) => (
              <div key={label} className="bg-bg-card border border-border rounded-xl p-4 text-center">
                <div className={clsx('text-xl font-bold', color ?? 'text-text-primary')}>{value}</div>
                <div className="text-xs text-text-muted mt-0.5">{label}</div>
                <div className="text-[10px] text-text-muted mt-0.5">{sub}</div>
              </div>
            ))}
          </div>

          {/* Per-holding bar chart */}
          {chartData.length > 0 && (
            <div className="bg-bg-card border border-border rounded-xl p-5">
              <h4 className="text-sm font-semibold text-text-primary mb-4">Return by Holding</h4>
              <ResponsiveContainer width="100%" height={Math.max(180, chartData.length * 36)}>
                <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                  <XAxis type="number" tickFormatter={v => `${v}%`} tick={{ fill: '#64748b', fontSize: 11 }} />
                  <YAxis type="category" dataKey="symbol" tick={{ fill: '#94a3b8', fontSize: 11 }} width={44} />
                  <Tooltip
                    formatter={(v: number) => [`${v.toFixed(2)}%`, 'Return']}
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: '#94a3b8' }}
                  />
                  <ReferenceLine x={0} stroke="#475569" />
                  <Bar dataKey="return" radius={[0, 4, 4, 0]}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={entry.return >= 0 ? '#10b981' : '#ef4444'} fillOpacity={0.8} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Per-holding table */}
          <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
            <div className="grid grid-cols-6 gap-2 px-4 py-2 text-[10px] text-text-muted uppercase tracking-wider border-b border-border bg-bg-elevated/50">
              <div className="col-span-2">Asset</div>
              <div className="text-right">Price Then</div>
              <div className="text-right">Price Now</div>
              <div className="text-right">Return</div>
              <div className="text-right">Value Now</div>
            </div>
            {results?.map(r => (
              <div key={r.cgId} className="grid grid-cols-6 gap-2 px-4 py-2.5 text-xs border-b border-border/50 last:border-0">
                <div className="col-span-2 flex items-center gap-2">
                  <div className="size-5 rounded-full shrink-0 flex items-center justify-center text-[9px] font-bold text-white"
                    style={{ backgroundColor: r.color }}>{r.symbol.slice(0, 2)}</div>
                  <span className="font-semibold text-text-primary">{r.symbol}</span>
                </div>
                <div className="text-right text-text-secondary font-mono">
                  {r.priceThen != null ? `$${r.priceThen < 1 ? r.priceThen.toFixed(4) : r.priceThen.toLocaleString()}` : '—'}
                </div>
                <div className="text-right text-text-secondary font-mono">
                  {r.priceNow != null ? `$${r.priceNow < 1 ? r.priceNow.toFixed(4) : r.priceNow.toLocaleString()}` : '—'}
                </div>
                <div className={clsx('text-right font-mono font-semibold', pnlColor(r.returnPct))}>
                  {r.returnPct != null ? fmtPct(r.returnPct) : '—'}
                </div>
                <div className={clsx('text-right font-mono', pnlColor(r.valueNow != null ? r.valueNow - (r.valueThen ?? 0) : null))}>
                  {r.valueNow != null ? fmt$(r.valueNow) : '—'}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {!runDate && !isLoading && (
        <div className="text-center py-12 text-text-muted">
          <BarChart2 size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Select a start date and run the backtest.</p>
        </div>
      )}
    </div>
  )
}

// ─── Portfolio detail view ────────────────────────────────────────────────────

type DetailTab = 'overview' | 'analysis' | 'look-through' | 'backtest'

function PortfolioDetail({ portfolio, onEdit, onBack }: {
  portfolio: Portfolio
  onEdit: () => void
  onBack: () => void
}) {
  const [tab, setTab] = useState<DetailTab>('overview')

  const ids = portfolio.holdings.map(h => h.cgId).join(',')
  const { data: priceData } = useQuery<PortfolioPricesResponse>({
    queryKey: ['portfolio-prices', ids],
    queryFn:  () => fetchInstrumentPrices(ids.split(',').filter(Boolean)),
    staleTime: 60_000, refetchInterval: 120_000, enabled: !!ids,
  })

  const prices  = useMemo(() => priceData?.prices ?? {}, [priceData])
  const holdings = useMemo(() => computeHoldings(portfolio, prices), [portfolio, prices])
  const metrics  = useMemo(() => computeMetrics(portfolio, holdings), [portfolio, holdings])
  const warnings = useMemo(() => getDiversificationWarnings(holdings, metrics), [holdings, metrics])

  const annualIncome = useMemo(() => computeAnnualIncome(holdings), [holdings])

  const TAB_LABELS: Record<DetailTab, string> = { overview: 'Overview', analysis: 'Analysis', 'look-through': 'Look-through', backtest: 'Backtest' }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3 flex-wrap">
        <button onClick={onBack} className="p-1.5 text-text-muted hover:text-text-primary rounded transition-colors mt-0.5">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold text-text-primary">{portfolio.name}</h2>
          {portfolio.description && <p className="text-sm text-text-muted mt-0.5">{portfolio.description}</p>}
        </div>
        <button onClick={onEdit}
          className="px-3 py-1.5 border border-border rounded-lg text-sm text-text-muted hover:text-text-primary flex items-center gap-1.5 transition-colors">
          <Edit2 size={13} /> Edit
        </button>
      </div>

      {/* Provenance — the detail view is where P&L dollars render, so the
          source disclosure belongs here too, not only on the list (D-9). */}
      <div className="-mt-2">
        <SourceLine id="portfolio-prices" />
      </div>

      {/* Metric strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-bg-card border border-border rounded-xl p-4 text-center">
          <div className="text-xl font-bold text-text-primary">{fmt$(portfolio.startingCapital, 0)}</div>
          <div className="text-xs text-text-muted mt-0.5">Capital</div>
        </div>
        {metrics.totalCurrentValue != null && metrics.totalPnlPct != null ? (
          <div className="bg-bg-card border border-border rounded-xl p-4 text-center">
            <div className={clsx('text-xl font-bold', pnlColor(metrics.totalPnlPct))}>{fmtPct(metrics.totalPnlPct)}</div>
            <div className="text-xs text-text-muted mt-0.5">Total P&L</div>
            <div className={clsx('text-[10px] mt-0.5', pnlColor(metrics.totalPnlUsd))}>{metrics.totalPnlUsd != null ? fmt$(metrics.totalPnlUsd) : ''}</div>
            {/* PB-1: totals cover only the priced slice. Say so rather than
                letting a partial figure read as portfolio-wide. */}
            {metrics.pricedPct < 99.5 && (
              <div className="text-[10px] text-amber-400 mt-0.5">
                {metrics.pricedPct.toFixed(0)}% of capital priced
              </div>
            )}
          </div>
        ) : (
          <div className="bg-bg-card border border-border rounded-xl p-4 text-center">
            <div className="text-xl font-bold text-text-muted">—</div>
            <div className="text-xs text-text-muted mt-0.5">P&L (set entry prices)</div>
          </div>
        )}
        <div className="bg-bg-card border border-border rounded-xl p-4 text-center">
          <div className={clsx('text-xl font-bold', riskColor(metrics.weightedRisk))}>{metrics.weightedRisk}</div>
          <div className="text-xs text-text-muted mt-0.5">Weighted Risk</div>
          <div className={clsx('text-[10px] mt-0.5', RISK_LABEL_COLOR[metrics.riskLabel])}>{metrics.riskLabel}</div>
        </div>
        <div className="bg-bg-card border border-border rounded-xl p-4 text-center">
          <div className="text-xl font-bold text-emerald-400">{annualIncome.covered > 0 ? fmt$(annualIncome.income, 0) : '—'}</div>
          <div className="text-xs text-text-muted mt-0.5">Est. Annual Income</div>
          <div className="text-[10px] text-text-muted mt-0.5">{annualIncome.covered > 0 ? `${annualIncome.covered} yielding holding${annualIncome.covered !== 1 ? 's' : ''} · ref yields` : 'no yielding securities'}</div>
        </div>
        <div className="bg-bg-card border border-border rounded-xl p-4 text-center">
          <div className="text-xl font-bold text-text-primary">{holdings.length}</div>
          <div className="text-xs text-text-muted mt-0.5">Holdings</div>
          <div className="text-[10px] text-text-muted mt-0.5">{metrics.categoryBreakdown.length} categories</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-bg-elevated p-1 rounded-lg w-fit">
        {(['overview', 'analysis', 'look-through', 'backtest'] as DetailTab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={clsx('px-4 py-1.5 rounded-md text-sm font-medium transition-colors', tab === t ? 'bg-bg-card text-text-primary shadow-sm' : 'text-text-muted hover:text-text-secondary')}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* ── Overview ── */}
      {tab === 'overview' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Allocation pie */}
            <div className="bg-bg-card border border-border rounded-xl p-5">
              <h4 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
                <PieChartIcon size={14} className="text-accent-blue" /> Allocation by Category
              </h4>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={metrics.categoryBreakdown} dataKey="pct" nameKey="label" cx="50%" cy="50%" outerRadius={80} innerRadius={40}>
                    {metrics.categoryBreakdown.map((s, i) => <Cell key={i} fill={s.color} />)}
                  </Pie>
                  <Tooltip
                    formatter={(v: number, n: string) => [`${v.toFixed(1)}%`, n]}
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-2 mt-2">
                {metrics.categoryBreakdown.map(s => (
                  <span key={s.category} className="flex items-center gap-1 text-[10px] text-text-muted">
                    <span className="size-2 rounded-full inline-block" style={{ backgroundColor: s.color }} />
                    {s.label} {s.pct.toFixed(0)}%
                  </span>
                ))}
              </div>
            </div>

            {/* Holdings by allocation */}
            <div className="bg-bg-card border border-border rounded-xl p-5">
              <h4 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
                <BarChart2 size={14} className="text-accent-blue" /> Holdings
              </h4>
              <div className="space-y-2">
                {holdings.sort((a, b) => b.targetAlloc - a.targetAlloc).map(h => (
                  <div key={h.cgId}>
                    <div className="flex items-center justify-between text-xs mb-0.5">
                      <span className="flex items-center gap-1.5">
                        <span className="size-2 rounded-full" style={{ backgroundColor: h.color }} />
                        <span className="font-semibold text-text-primary">{h.symbol}</span>
                        <span className="text-text-muted">{h.name}</span>
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-text-secondary font-mono">{h.targetAlloc.toFixed(1)}%</span>
                        {h.pnlPct != null && (
                          <span className={clsx('font-mono', pnlColor(h.pnlPct))}>{fmtPct(h.pnlPct)}</span>
                        )}
                      </div>
                    </div>
                    <div className="h-1.5 bg-bg-elevated rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${h.targetAlloc}%`, backgroundColor: h.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Holdings table */}
          <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-4 py-2.5 text-[10px] text-text-muted uppercase tracking-wider border-b border-border bg-bg-elevated/50">
              <div className="col-span-3">Asset</div>
              <div className="col-span-2 text-right">Alloc</div>
              <div className="col-span-2 text-right">Target Value</div>
              <div className="col-span-2 text-right">Current Price</div>
              <div className="col-span-2 text-right">Entry Price</div>
              <div className="col-span-1 text-right">P&L</div>
            </div>
            {holdings.map(h => (
              <div key={h.cgId} className="grid grid-cols-12 gap-2 px-4 py-3 text-xs border-b border-border/50 last:border-0">
                <div className="col-span-3 flex items-center gap-2">
                  <div className="size-5 rounded-full shrink-0 flex items-center justify-center text-[8px] font-bold text-white"
                    style={{ backgroundColor: h.color }}>{h.symbol.slice(0, 2)}</div>
                  <div>
                    <div className="font-semibold text-text-primary">{h.symbol}</div>
                    <div className="text-[10px] text-text-muted">{CATEGORY_META[h.category]?.label}</div>
                  </div>
                </div>
                <div className="col-span-2 text-right font-mono text-text-secondary">{h.targetAlloc.toFixed(1)}%</div>
                <div className="col-span-2 text-right font-mono text-text-secondary">{fmt$(h.targetValue)}</div>
                <div className="col-span-2 text-right font-mono text-text-secondary">
                  {/* Not always USD — macro instruments quote in cents/percent/points. */}
                  {formatInstrumentQuote(INSTRUMENT_BY_KEY[h.cgId], h.currentPrice) ?? '—'}
                </div>
                <div className="col-span-2 text-right font-mono text-text-secondary">
                  {h.entryPrice != null ? `$${h.entryPrice < 1 ? h.entryPrice.toFixed(4) : h.entryPrice.toLocaleString()}` : <span className="text-text-muted">not set</span>}
                </div>
                <div className={clsx('col-span-1 text-right font-mono font-semibold', pnlColor(h.pnlPct))}>
                  {h.pnlPct != null ? fmtPct(h.pnlPct) : '—'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Analysis ── */}
      {tab === 'analysis' && (
        <div className="space-y-5">
          {/* Risk breakdown */}
          <div className="bg-bg-card border border-border rounded-xl p-5 space-y-4">
            <h4 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <Shield size={14} className="text-accent-blue" /> Risk Profile
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-3">
                {holdings.sort((a, b) => b.riskTier - a.riskTier).map(h => (
                  <div key={h.cgId}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="flex items-center gap-1.5">
                        <span className="size-2 rounded-full" style={{ backgroundColor: h.color }} />
                        <span className="font-semibold text-text-primary">{h.symbol}</span>
                        <span className="text-text-muted text-[10px]">{h.targetAlloc.toFixed(0)}% weight</span>
                      </span>
                      <span className={clsx('font-mono', riskColor(h.riskTier))}>{h.riskTier}/10</span>
                    </div>
                    <div className="h-1.5 bg-bg-elevated rounded-full overflow-hidden">
                      <div className={clsx('h-full rounded-full', riskBg(h.riskTier))} style={{ width: `${(h.riskTier / 10) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="space-y-3">
                <div className="bg-bg-elevated rounded-xl p-4 border border-border text-center">
                  <div className={clsx('text-3xl font-bold font-mono', riskColor(metrics.weightedRisk))}>{metrics.weightedRisk}</div>
                  <div className="text-xs text-text-muted mt-1">Weighted Portfolio Risk</div>
                  <div className={clsx('text-sm font-semibold mt-1', RISK_LABEL_COLOR[metrics.riskLabel])}>{metrics.riskLabel}</div>
                </div>
                <div className="bg-bg-elevated rounded-xl p-3 border border-border space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-text-muted">Stablecoin %</span>
                    <span className="text-text-primary font-mono">{metrics.stablecoinPct.toFixed(0)}%</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-text-muted">Categories</span>
                    <span className="text-text-primary font-mono">{metrics.categoryBreakdown.length}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-text-muted">Largest position</span>
                    <span className="text-text-primary font-mono">{metrics.largestPosition?.symbol} {metrics.largestPosition?.targetAlloc.toFixed(0)}%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Diversification warnings */}
          {warnings.length > 0 && (
            <div className="space-y-2">
              {warnings.map((w, i) => (
                <div key={i} className={clsx('flex items-start gap-2 p-3 rounded-lg border text-xs', {
                  'bg-blue-500/5 border-blue-500/20 text-blue-300':   w.level === 'info',
                  'bg-amber-500/5 border-amber-500/20 text-amber-300': w.level === 'warn',
                  'bg-red-500/5 border-red-500/20 text-red-300':       w.level === 'danger',
                })}>
                  {w.level === 'info'   && <Info size={13} className="mt-0.5 shrink-0" />}
                  {w.level === 'warn'   && <AlertTriangle size={13} className="mt-0.5 shrink-0" />}
                  {w.level === 'danger' && <AlertTriangle size={13} className="mt-0.5 shrink-0" />}
                  {w.message}
                </div>
              ))}
            </div>
          )}

          {warnings.length === 0 && (
            <div className="flex items-center gap-2 p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-lg text-xs text-emerald-300">
              <Check size={13} className="shrink-0" /> Portfolio passes all diversification checks.
            </div>
          )}

          {/* Category breakdown table */}
          <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-bg-elevated/50 text-xs font-semibold text-text-primary">
              Category Breakdown
            </div>
            {metrics.categoryBreakdown.map(s => (
              <div key={s.category} className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50 last:border-0">
                <span className="size-3 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                <span className="text-sm text-text-primary flex-1">{s.label}</span>
                <div className="w-32 h-1.5 bg-bg-elevated rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${s.pct}%`, backgroundColor: s.color }} />
                </div>
                <span className="text-xs font-mono text-text-secondary w-10 text-right">{s.pct.toFixed(1)}%</span>
                <span className="text-xs font-mono text-text-muted w-20 text-right">{fmt$(s.value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Look-through ── */}
      {tab === 'look-through' && <PortfolioLookThrough portfolio={portfolio} />}

      {/* ── Backtest ── */}
      {tab === 'backtest' && <BacktestPanel portfolio={portfolio} />}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

type View = 'list' | 'detail' | 'new' | 'edit'

export default function PortfoliosPage() {
  const { portfolios, activeId, createPortfolio, updatePortfolio, deletePortfolio, setActive, active, hydrated, syncError } = usePortfolioStore()
  const [view, setView] = useState<View>(activeId ? 'detail' : 'list')

  useEffect(() => { void hydratePortfolios() }, [])

  const currentPortfolio = active()

  function handleCreate(data: Omit<Portfolio, 'id' | 'createdAt' | 'updatedAt'>) {
    createPortfolio(data)
    setView('detail')
  }

  function handleUpdate(data: Omit<Portfolio, 'id' | 'createdAt' | 'updatedAt'>) {
    if (activeId) updatePortfolio(activeId, data)
    setView('detail')
  }

  function handleDelete(id: string) {
    if (confirm('Delete this portfolio? This cannot be undone.')) {
      deletePortfolio(id)
      setView('list')
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {syncError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 flex items-start gap-3">
          <AlertTriangle size={16} className="text-red-400 flex-shrink-0 mt-0.5" aria-hidden />
          <div className="text-xs text-text-secondary leading-relaxed">
            <span className="font-medium text-red-300">Portfolios are unavailable</span>
            {' '}— {syncError}. Changes made now will not be saved.
          </div>
        </div>
      )}
      {!hydrated && !syncError && (
        <p className="text-xs text-text-muted">Loading portfolios…</p>
      )}
      {view === 'list' && (
        <>
          <div className="flex items-center justify-between gap-4">
            <div>
              <PageHeader
                title="Portfolios"
                subtitle="Hypothetical portfolios for investment research and backtesting"
                description="The Portfolios tool builds and analyzes hypothetical CROSS-ASSET allocations — crypto, stocks, ETFs, and mutual funds in one portfolio. Add holdings with target weights, fetch live prices, and see P&L, category mix, weighted risk, and concentration warnings — without committing real funds."
                details={[
                  // D-9 fix: this block used to claim Sharpe (4% rf) and max
                  // drawdown — computed nowhere on this page — plus
                  // localStorage-only persistence (the store has been DB-backed
                  // since the /api/user/portfolios migration) and a stale "live
                  // mode" (LIVE_DATA is hardcoded true; there is no other mode).
                  { label: 'Live pricing', text: 'Valuations use live prices — CoinGecko for crypto, the keyed quote ladder for stocks and funds. Positions without a live price are excluded from totals, never valued at cost.' },
                  { label: 'Risk metrics', text: 'Weighted risk averages each holding\'s canonical Safety Score by allocation; concentration warnings flag single-position weight. Sharpe and drawdown are not computed here — see Compare for window statistics.' },
                  { label: 'Persistence', text: 'Portfolios are saved to your account database via /api/user/portfolios. A one-time import migrated any legacy localStorage portfolios.' },
                ]}
              />
            </div>
            <button onClick={() => setView('new')}
              className="px-4 py-2 bg-accent-blue hover:bg-blue-600 text-white rounded-lg font-medium text-sm flex items-center gap-2 transition-colors">
              <Plus size={16} /> New Portfolio
            </button>
          </div>

          {/* Data provenance */}
          <SourceLine id="portfolio-prices" />

          {portfolios.length === 0 ? (
            <div className="text-center py-20">
              <BarChart2 size={48} className="mx-auto mb-4 text-text-muted opacity-30" />
              <p className="text-text-muted">No portfolios yet.</p>
              <p className="text-sm text-text-muted mt-1">Create one to start tracking hypothetical allocations.</p>
              <button onClick={() => setView('new')}
                className="mt-4 px-5 py-2 bg-accent-blue hover:bg-blue-600 text-white rounded-lg font-medium text-sm transition-colors">
                Create First Portfolio
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {portfolios.map(p => (
                <PortfolioCard key={p.id} portfolio={p}
                  onSelect={() => { setActive(p.id); setView('detail') }}
                  onDelete={() => handleDelete(p.id)} />
              ))}
            </div>
          )}
        </>
      )}

      {view === 'new' && (
        <PortfolioEditor onSave={handleCreate} onCancel={() => setView('list')} />
      )}

      {view === 'edit' && currentPortfolio && (
        <PortfolioEditor existing={currentPortfolio} onSave={handleUpdate} onCancel={() => setView('detail')} />
      )}

      {view === 'detail' && currentPortfolio && (
        <PortfolioDetail portfolio={currentPortfolio}
          onEdit={() => setView('edit')}
          onBack={() => setView('list')} />
      )}
    </div>
  )
}
