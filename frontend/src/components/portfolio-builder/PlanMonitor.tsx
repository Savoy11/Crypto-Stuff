'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCircle2, Info, Minus } from 'lucide-react'
import { hydratePortfolios, usePortfolioStore } from '@/store/usePortfolioStore'
import { fetchInstrumentPrices } from '@/lib/api/instrumentPrices'
import { STALE_TIME_SHORT } from '@/lib/constants'
import {
  actualWeightsFromPortfolio, checkDrift, reviewPlan,
  type SavedPlan,
} from '@/lib/data/portfolioBuilder'

// Drift + suitability panel for one saved plan. A plan only earns its keep if
// it's checked against what the user actually holds, so this reads real
// portfolios (live-priced) and falls back to manual entry when there aren't any.

type Source = 'portfolio' | 'manual'

function fmtUsd(n: number) {
  const abs = Math.abs(n)
  const s = abs >= 1000 ? `$${(abs / 1000).toFixed(1)}k` : `$${abs.toFixed(0)}`
  return n < 0 ? `−${s}` : s
}

export function PlanMonitor({ saved }: { saved: SavedPlan }) {
  const portfolios = usePortfolioStore((s) => s.portfolios)
  const queryClient = useQueryClient()
  useEffect(() => { void hydratePortfolios() }, [])

  // Portfolios are DB-backed with UUID ids, so a plan's comparison target
  // persists server-side (builder_plans.linked_portfolio_id): a saved link
  // wins over the default, and changing the select saves the new link.
  const linkedStillExists = portfolios.some((p) => p.id === saved.linkedPortfolioId)
  const [source, setSource] = useState<Source>(portfolios.length > 0 ? 'portfolio' : 'manual')
  const [portfolioId, setPortfolioId] = useState<string>(
    (linkedStillExists ? saved.linkedPortfolioId! : portfolios[0]?.id) ?? '')
  const [manual, setManual] = useState<Record<string, string>>({})

  // Portfolios hydrate from the server after first render, so the initial
  // state above may have been computed against an empty list. Once they
  // arrive, adopt the persisted link (or first portfolio) and switch the
  // source toggle over — unless the user has already made choices themselves.
  const sourceTouched = useRef(false)
  useEffect(() => {
    if (portfolios.length === 0) return
    if (!portfolioId) setPortfolioId(linkedStillExists ? saved.linkedPortfolioId! : portfolios[0].id)
    if (!sourceTouched.current) setSource('portfolio')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolios.length])

  const linkMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/user/builder-plans/${saved.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkedPortfolioId: id }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error ?? 'Link not saved')
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['builder-plans'] }),
  })

  const selectPortfolio = (id: string) => {
    setPortfolioId(id)
    linkMutation.mutate(id)
  }

  const portfolio = portfolios.find((p) => p.id === portfolioId)
  const usingPortfolio = source === 'portfolio' && !!portfolio

  const { data: priceResult, isLoading: pricesLoading } = useQuery({
    queryKey: ['builder-drift-prices', portfolio?.id, portfolio?.holdings.length],
    queryFn: () => fetchInstrumentPrices(portfolio!.holdings.map((h) => h.cgId)),
    enabled: usingPortfolio && (portfolio?.holdings.length ?? 0) > 0,
    staleTime: STALE_TIME_SHORT,
  })

  const actual = useMemo(() => {
    if (usingPortfolio) {
      if (!priceResult) return null
      const r = actualWeightsFromPortfolio(portfolio!, priceResult.prices)
      return Object.keys(r.weights).length > 0 ? r : null
    }
    const weights: Record<string, number> = {}
    for (const [symbol, raw] of Object.entries(manual)) {
      const v = Number(raw)
      if (Number.isFinite(v) && v > 0) weights[symbol] = v
    }
    return Object.keys(weights).length > 0
      ? { weights, valueUsd: saved.plan.inputs.amount, pricedPct: 100, unpricedPct: 0, noCostBasisPct: 0 }
      : null
  }, [usingPortfolio, priceResult, portfolio, manual, saved.plan.inputs.amount])

  const drift = useMemo(
    () => (actual ? checkDrift(saved.plan, actual.weights, actual.valueUsd) : null),
    [actual, saved.plan],
  )
  const findings = useMemo(
    () => reviewPlan(saved, actual ? { weights: actual.weights, valueUsd: actual.valueUsd } : undefined),
    [saved, actual],
  )

  const manualTotal = Object.values(manual).reduce((s, v) => s + (Number(v) || 0), 0)

  return (
    <div className="border-t border-border/60 bg-bg-elevated/40 px-4 py-4 space-y-4">
      {/* Source picker */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-text-muted uppercase tracking-wider">Compare against</span>
        <div className="flex items-center gap-0.5 bg-bg-elevated border border-border rounded p-0.5">
          <button
            onClick={() => { sourceTouched.current = true; setSource('portfolio') }}
            disabled={portfolios.length === 0}
            className={clsx('px-2.5 py-1 rounded text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
              source === 'portfolio' ? 'bg-accent-blue/20 text-accent-blue' : 'text-text-muted hover:text-text-secondary')}
          >
            A portfolio
          </button>
          <button
            onClick={() => { sourceTouched.current = true; setSource('manual') }}
            className={clsx('px-2.5 py-1 rounded text-xs font-medium transition-colors',
              source === 'manual' ? 'bg-accent-blue/20 text-accent-blue' : 'text-text-muted hover:text-text-secondary')}
          >
            Enter weights
          </button>
        </div>

        {source === 'portfolio' && (
          portfolios.length > 0 ? (
            <select
              value={portfolioId}
              onChange={(e) => selectPortfolio(e.target.value)}
              className="rounded border border-border bg-bg-card px-2 py-1 text-xs text-text-primary focus:border-accent-blue/50 focus:outline-none"
            >
              {portfolios.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          ) : (
            <span className="text-xs text-text-muted">No portfolios yet — build one on the Portfolios page, or enter weights by hand.</span>
          )
        )}

        {usingPortfolio && actual && (
          <span className="ml-auto text-xs text-text-muted font-mono tabular-nums">
            {fmtUsd(actual.valueUsd)} {actual.pricedPct < 99 ? 'marked to market' : 'live value'}
          </span>
        )}
      </div>

      {/* Manual weight entry */}
      {source === 'manual' && (
        <div className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {saved.plan.holdings.map((h) => (
              <label key={h.symbol} className="flex items-center gap-2 text-xs">
                <span className="font-mono font-semibold text-text-primary w-12">{h.symbol}</span>
                <input
                  type="number" min={0} max={100} step="0.1"
                  value={manual[h.symbol] ?? ''}
                  onChange={(e) => setManual((m) => ({ ...m, [h.symbol]: e.target.value }))}
                  placeholder={h.weightPct.toFixed(1)}
                  className="w-20 rounded border border-border bg-bg-card px-2 py-1 font-mono tabular-nums text-text-primary placeholder:text-text-muted focus:border-accent-blue/50 focus:outline-none"
                />
                <span className="text-text-muted">%</span>
              </label>
            ))}
          </div>
          <p className="text-[11px] text-text-muted">
            Entered {manualTotal.toFixed(1)}%.
            {manualTotal > 0 && Math.abs(manualTotal - 100) > 1 &&
              ' Weights should total 100% for the drift figures to mean anything.'}
            {' '}Holdings outside the plan can’t be entered here — link a portfolio to catch those.
          </p>
        </div>
      )}

      {usingPortfolio && pricesLoading && (
        <p className="text-xs text-text-muted">Fetching live prices…</p>
      )}

      {usingPortfolio && !pricesLoading && !actual && (
        <p className="text-xs text-amber-400">
          None of this portfolio’s positions could be marked to market, so drift can’t be calculated.
          A position needs both a live price and an entry price; without both it is excluded rather than
          valued at cost, because a portfolio valued at cost restates its own targets and would report
          zero drift on every line.
        </p>
      )}

      {usingPortfolio && actual && actual.pricedPct < 99 && (
        <p className="text-xs text-amber-400">
          Only {actual.pricedPct}% of the portfolio could be marked to market; the rest is excluded from
          these weights
          {actual.unpricedPct > 0 && ` (${actual.unpricedPct}% has no live price`}
          {actual.unpricedPct > 0 && actual.noCostBasisPct > 0 && ','}
          {actual.noCostBasisPct > 0 &&
            `${actual.unpricedPct > 0 ? ' ' : ' ('}${actual.noCostBasisPct}% has no entry price, so it can’t be valued`}
          {(actual.unpricedPct > 0 || actual.noCostBasisPct > 0) && ')'}.
          {actual.noCostBasisPct > 0 && ' Add entry prices on the Portfolios page to include those positions.'}
        </p>
      )}

      {/* Drift table */}
      {drift && (
        <>
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <span className={clsx('flex items-center gap-1.5 px-2 py-0.5 rounded font-medium border',
              drift.rebalanceDue
                ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20')}>
              {drift.rebalanceDue ? <AlertTriangle size={11} aria-hidden /> : <CheckCircle2 size={11} aria-hidden />}
              {drift.rebalanceDue ? 'Rebalance due' : 'Within bands'}
            </span>
            <span className="text-text-muted">
              Largest drift <span className="font-mono tabular-nums text-text-secondary">{drift.maxDriftPts.toFixed(1)} pts</span>
              {' '}against a ±{saved.plan.driftBandPct}% band
            </span>
            {drift.turnoverUsd > 0 && (
              <span className="text-text-muted">
                Turnover to correct <span className="font-mono tabular-nums text-text-secondary">{fmtUsd(drift.turnoverUsd)}</span>
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-text-muted uppercase tracking-wider text-[10px]">
                  <th className="text-left font-medium py-1.5">Holding</th>
                  <th className="text-right font-medium py-1.5">Target</th>
                  <th className="text-right font-medium py-1.5">Actual</th>
                  <th className="text-right font-medium py-1.5">Drift</th>
                  <th className="text-right font-medium py-1.5">Trade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {drift.items.map((i) => (
                  <tr key={i.symbol}>
                    <td className="py-1.5">
                      <span className="font-mono font-semibold text-text-primary">{i.symbol}</span>
                      <span className="ml-2 text-text-muted hidden sm:inline">{i.name}</span>
                    </td>
                    <td className="text-right font-mono tabular-nums text-text-muted py-1.5">{i.targetPct.toFixed(1)}%</td>
                    <td className="text-right font-mono tabular-nums text-text-secondary py-1.5">{i.currentPct.toFixed(1)}%</td>
                    <td className={clsx('text-right font-mono tabular-nums py-1.5',
                      i.action === 'hold' ? 'text-text-muted' : i.driftPts > 0 ? 'text-orange-400' : 'text-accent-blue')}>
                      {i.driftPts > 0 ? '+' : ''}{i.driftPts.toFixed(1)}
                    </td>
                    <td className="text-right py-1.5">
                      {i.action === 'hold' ? (
                        <span className="inline-flex items-center gap-1 text-text-muted"><Minus size={11} aria-hidden /> hold</span>
                      ) : (
                        <span className={clsx('inline-flex items-center gap-1 font-mono tabular-nums font-medium',
                          i.action === 'sell' ? 'text-orange-400' : 'text-emerald-400')}>
                          {i.action === 'sell'
                            ? <ArrowDownRight size={11} aria-hidden />
                            : <ArrowUpRight size={11} aria-hidden />}
                          {i.action === 'sell' ? 'Sell' : 'Buy'} {fmtUsd(Math.abs(i.tradeUsd))}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {drift.unplanned.length > 0 && (
            <p className="text-xs text-text-muted">
              Held but not in this plan:{' '}
              {drift.unplanned.map((u) => `${u.symbol} ${u.currentPct.toFixed(1)}%`).join(', ')}
            </p>
          )}
        </>
      )}

      {/* Suitability findings */}
      <div className="space-y-1.5">
        <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wider">Suitability review</h3>
        {findings.length === 0 ? (
          <p className="flex items-center gap-2 text-xs text-emerald-400">
            <CheckCircle2 size={13} aria-hidden />
            Nothing to flag{actual ? '' : ' from the plan alone — link a portfolio to check risk drift, fees, and concentration'}.
          </p>
        ) : findings.map((f) => (
          <div key={f.id} className="flex items-start gap-2 text-xs leading-relaxed">
            {f.level === 'warn'
              ? <AlertTriangle size={13} className="text-amber-400 flex-shrink-0 mt-0.5" aria-hidden />
              : <Info size={13} className="text-accent-blue flex-shrink-0 mt-0.5" aria-hidden />}
            <span>
              <span className="font-medium text-text-primary">{f.title}.</span>{' '}
              <span className="text-text-secondary">{f.message}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
