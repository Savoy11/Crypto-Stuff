'use client'

// Cycle Context tab — Phase 1 (scope: docs/assessments/cycle-gauge-scope.md).
// Four cards: halving clock, drawdown vs prior cycles, BTC dominance, Fear &
// Greed. Descriptive only. No composite score exists here ON PURPOSE — a
// blended "cycle score" is the verdict shape item 4 removed. All framing copy
// lives in CYCLE_COPY (lib/utils/cycleMetrics.ts) where the vocabulary guard
// test can sweep it; do not inline new framing strings in this file's JSX.

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Clock, TrendingDown, PieChart, Gauge, Shuffle } from 'lucide-react'
import { clsx } from 'clsx'
import { ProvenanceNotice } from '@/components/ui/ProvenanceNotice'
import { halvingPosition, drawdownComparison, rotationRead, CYCLE_COPY } from '@/lib/utils/cycleMetrics'
import { ASSET_CATALOG } from '@/lib/data/assetCatalog'
import { CYCLE_HISTORY, getCycleHistoryProvenance } from '@/lib/data/cycleHistory'
import { STALE_TIME_LONG } from '@/lib/constants'
import type { BtcStatsData } from '@/app/live-data/btc-stats/route'
import type { FearGreedData } from '@/app/live-data/fear-greed/route'
import type { GlobalMarketData } from '@/app/live-data/global/route'

const LAST_HALVING_ISO = '2024-04-20'

function Card({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-border bg-bg-card p-4 space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
        <Icon size={15} className="text-accent-blue" /> {title}
      </h3>
      {children}
    </div>
  )
}

export function CycleContext() {
  const { data: btc } = useQuery<BtcStatsData>({
    queryKey: ['btc-stats'],
    queryFn: () => fetch('/live-data/btc-stats').then(r => r.json()),
    staleTime: STALE_TIME_LONG,
  })
  const { data: fg } = useQuery<FearGreedData>({
    queryKey: ['fear-greed'],
    queryFn: () => fetch('/live-data/fear-greed').then(r => r.json()),
    staleTime: STALE_TIME_LONG,
  })
  const { data: global } = useQuery<GlobalMarketData>({
    queryKey: ['global-market'],
    queryFn: () => fetch('/live-data/global').then(r => r.json()),
    staleTime: STALE_TIME_LONG,
  })
  // The markets route serves the whole tracked universe in one response (it
  // takes no ids filter); we read one field of one coin from it. Keyed the
  // same for any other consumer with the same shape so the cache can share.
  const { data: btcQuote } = useQuery<{ quotes?: Record<string, { athChangePct?: number | null; priceChange30d?: number | null; marketCapRank?: number | null }> }>({
    queryKey: ['live-markets-raw'],
    queryFn: () => fetch('/live-data/markets').then(r => r.json()),
    staleTime: STALE_TIME_LONG,
  })

  const pos = useMemo(() => halvingPosition(LAST_HALVING_ISO, new Date()), [])
  const athChangePct = btcQuote?.quotes?.btc?.athChangePct ?? null
  const drawdowns = useMemo(() => drawdownComparison(athChangePct), [athChangePct])
  const provenance = useMemo(() => getCycleHistoryProvenance(), [])

  // Rotation read (Phase 2). Stablecoin flags come from the catalog — the raw
  // quote rows carry no category, and a pegged asset in the denominator would
  // read as "underperforming BTC" while simply being a peg.
  const rotation = useMemo(() => {
    const quotes = btcQuote?.quotes
    if (!quotes) return null
    const stable = new Set(ASSET_CATALOG.filter((a) => a.assetType === 'stablecoin').map((a) => a.id))
    return rotationRead(Object.entries(quotes).map(([id, q]) => ({
      id,
      marketCapRank: q.marketCapRank ?? null,
      priceChange30d: q.priceChange30d ?? null,
      isStablecoin: stable.has(id),
    })))
  }, [btcQuote])

  // Sparkline path for the F&G year of history.
  const fgPath = useMemo(() => {
    const h = fg?.history ?? []
    if (h.length < 2) return null
    const pts = [...h].sort((a, b) => a.timestamp - b.timestamp)
    const w = 280, ht = 48
    return pts.map((p, i) => {
      const x = (i / (pts.length - 1)) * w
      const y = ht - (p.value / 100) * ht
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    }).join(' ')
  }, [fg])

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-secondary max-w-3xl">{CYCLE_COPY.panelIntro}</p>
      <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-amber-400/90 max-w-3xl">
        {CYCLE_COPY.indicatorFailureNote}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ── Halving clock ── */}
        <Card icon={Clock} title="Halving clock">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-xl font-bold font-mono text-text-primary">{pos.monthsSince.toFixed(1)}</div>
              <div className="text-[10px] text-text-muted mt-0.5">months since 2024 halving</div>
            </div>
            <div>
              <div className="text-xl font-bold font-mono text-text-primary">
                {btc?.blocksUntilHalving != null ? btc.blocksUntilHalving.toLocaleString() : '—'}
              </div>
              <div className="text-[10px] text-text-muted mt-0.5">blocks to next halving</div>
            </div>
            <div>
              <div className="text-xl font-bold font-mono text-text-primary">
                {btc?.estimatedHalvingDate ? new Date(btc.estimatedHalvingDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short' }) : '—'}
              </div>
              <div className="text-[10px] text-text-muted mt-0.5">estimated next halving</div>
            </div>
          </div>
          {/* Position bar with the historical peak window marked on it */}
          <div className="relative h-3 rounded-full bg-bg-elevated overflow-hidden" aria-hidden>
            <div className="absolute inset-y-0 bg-amber-500/20"
              style={{ left: `${(pos.historicalPeakWindowMonths[0] / 48) * 100}%`, width: `${((pos.historicalPeakWindowMonths[1] - pos.historicalPeakWindowMonths[0]) / 48) * 100}%` }} />
            <div className="absolute inset-y-0 w-0.5 bg-accent-blue" style={{ left: `${pos.pctThroughNominalCycle}%` }} />
          </div>
          <div className="flex justify-between text-[10px] text-text-muted font-mono">
            <span>halving</span>
            <span>shaded: months {pos.historicalPeakWindowMonths[0]}–{pos.historicalPeakWindowMonths[1]}, where completed cycles peaked</span>
            <span>48 mo</span>
          </div>
          <p className="text-[11px] leading-relaxed text-text-muted">{CYCLE_COPY.halvingCaveat}</p>
        </Card>

        {/* ── Dominance ── */}
        <Card icon={PieChart} title="Bitcoin dominance">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-xl font-bold font-mono text-text-primary">
                {global?.btcDominancePct != null ? `${global.btcDominancePct.toFixed(1)}%` : '—'}
              </div>
              <div className="text-[10px] text-text-muted mt-0.5">BTC share</div>
            </div>
            <div>
              <div className="text-xl font-bold font-mono text-text-primary">
                {global?.ethDominancePct != null ? `${global.ethDominancePct.toFixed(1)}%` : '—'}
              </div>
              <div className="text-[10px] text-text-muted mt-0.5">ETH share</div>
            </div>
            <div>
              <div className="text-xl font-bold font-mono text-text-primary">
                {global?.totalMarketCapUsd != null ? `$${(global.totalMarketCapUsd / 1e12).toFixed(2)}T` : '—'}
              </div>
              <div className="text-[10px] text-text-muted mt-0.5">total crypto mkt cap</div>
            </div>
          </div>
          {global?.btcDominancePct != null && (
            <div className="h-3 rounded-full bg-bg-elevated overflow-hidden flex" aria-hidden>
              <div className="bg-accent-blue/70" style={{ width: `${global.btcDominancePct}%` }} />
              {global.ethDominancePct != null && <div className="bg-accent-blue/35" style={{ width: `${global.ethDominancePct}%` }} />}
            </div>
          )}
          <p className="text-[11px] leading-relaxed text-text-muted">{CYCLE_COPY.dominanceCaveat}</p>
        </Card>

        {/* ── Drawdown vs prior cycles ── */}
        <Card icon={TrendingDown} title="Drawdown vs prior cycles">
          <div className="space-y-1.5">
            {drawdowns.map((r) => (
              <div key={r.label} className="grid grid-cols-[7.5rem_1fr_3.5rem] items-center gap-2" title={r.note}>
                <span className={clsx('text-[11px] font-mono text-right', r.label === 'BTC now' ? 'text-accent-blue font-semibold' : 'text-text-muted')}>
                  {r.label}
                </span>
                <div className="h-3 rounded bg-bg-elevated overflow-hidden">
                  <div className={clsx('h-full rounded-r', r.label === 'BTC now' ? 'bg-accent-blue/60' : r.open ? 'bg-amber-500/40' : 'bg-red-500/35')}
                    style={{ width: `${Math.min(100, Math.abs(r.drawdownPct))}%` }} />
                </div>
                <span className="text-[11px] font-mono text-text-secondary">
                  {r.drawdownPct.toFixed(0)}%{r.open && r.label !== 'BTC now' ? '*' : ''}
                </span>
              </div>
            ))}
          </div>
          {athChangePct === null && (
            <p className="text-[11px] text-amber-400">Live BTC drawdown unavailable right now — historical rows only.</p>
          )}
          <p className="text-[11px] leading-relaxed text-text-muted">{CYCLE_COPY.drawdownCaveat}</p>
        </Card>

        {/* ── Fear & Greed ── */}
        <Card icon={Gauge} title="Fear & Greed">
          <div className="flex items-center gap-4">
            <div className="text-center shrink-0">
              <div className="text-3xl font-bold font-mono text-text-primary">{fg?.ok ? fg.value : '—'}</div>
              <div className="text-[10px] text-text-muted mt-0.5">{fg?.ok ? fg.classification : 'unavailable'}</div>
            </div>
            {fgPath && (
              <svg viewBox="0 0 280 48" className="w-full h-12" aria-label="Fear and Greed, one year of daily values">
                <line x1="0" y1="24" x2="280" y2="24" stroke="currentColor" className="text-border" strokeDasharray="3 4" strokeWidth="1" />
                <path d={fgPath} fill="none" stroke="currentColor" className="text-accent-blue" strokeWidth="1.5" />
              </svg>
            )}
          </div>
          {fg?.ok && (
            <div className="flex gap-4 text-[10px] font-mono text-text-muted">
              <span>week ago: {fg.weekAgo ?? '—'}</span>
              <span>month ago: {fg.monthAgo ?? '—'}</span>
              <span>year ago: {fg.yearAgo ?? '—'}</span>
            </div>
          )}
          <p className="text-[11px] leading-relaxed text-text-muted">{CYCLE_COPY.fearGreedCaveat}</p>
        </Card>

        {/* ── Rotation (Phase 2) ── */}
        <Card icon={Shuffle} title="Rotation — 30-day variant">
          {rotation ? (
            <>
              <div className="flex items-center gap-4">
                <div className="text-center shrink-0">
                  <div className="text-3xl font-bold font-mono text-text-primary">{rotation.pctOutperformingBtc.toFixed(0)}%</div>
                  <div className="text-[10px] text-text-muted mt-0.5">of large coins beat BTC, 30d</div>
                </div>
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 rounded-full bg-bg-elevated overflow-hidden">
                    <div className="h-full bg-accent-blue/60 rounded-full" style={{ width: `${rotation.pctOutperformingBtc}%` }} />
                  </div>
                  <div className="text-[10px] font-mono text-text-muted">
                    {rotation.outperforming} of {rotation.eligible} eligible coins · BTC 30d: {rotation.btcChange30d >= 0 ? '+' : ''}{rotation.btcChange30d.toFixed(1)}%
                    {rotation.untested > 0 && <span className="text-amber-400"> · {rotation.untested} not tested (no 30d data)</span>}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <p className="text-[11px] text-amber-400">
              Not enough data for a rotation read right now — it needs BTC&rsquo;s 30-day change and at least 10 eligible coins from the feed.
            </p>
          )}
          <p className="text-[11px] leading-relaxed text-text-muted">{CYCLE_COPY.rotationCaveat}</p>
        </Card>
      </div>

      {/* Cycle history reference table */}
      <div className="rounded-card border border-border bg-bg-card p-4 space-y-3">
        <h3 className="text-sm font-semibold text-text-primary">Prior cycles</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-wider text-text-muted">
                <th className="py-2 pr-3 text-left font-medium">Cycle</th>
                <th className="py-2 px-3 text-left font-medium">Peak</th>
                <th className="py-2 px-3 text-left font-medium">Trough</th>
                <th className="py-2 px-3 text-right font-medium">Max drawdown</th>
                <th className="py-2 px-3 text-right font-medium">Halving → peak</th>
                <th className="py-2 pl-3 text-left font-medium">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {CYCLE_HISTORY.map((c) => (
                <tr key={c.halving}>
                  <td className="py-2 pr-3 font-mono text-text-primary">{c.halving}{c.open ? ' (open)' : ''}</td>
                  <td className="py-2 px-3 font-mono text-text-secondary whitespace-nowrap">{c.peakLabel}</td>
                  <td className="py-2 px-3 font-mono text-text-secondary whitespace-nowrap">{c.troughLabel}</td>
                  <td className="py-2 px-3 font-mono text-right text-text-secondary">{c.maxDrawdownPct}%</td>
                  <td className="py-2 px-3 font-mono text-right text-text-secondary">{c.halvingToPeakMonths != null ? `${c.halvingToPeakMonths} mo` : '—'}</td>
                  <td className="py-2 pl-3 text-text-muted">{c.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ProvenanceNotice
          label="Hand-compiled reference table"
          staleLabel="Reference table overdue for review — the open cycle's row may be out of date"
          confidence="medium"
          stale={provenance.stale}
        >
          Peaks, troughs and drawdowns compiled from public price records on {provenance.verifiedAt} ({provenance.ageDays} days ago).
          Closed cycles do not change; the open cycle&rsquo;s figures can. Values are approximate — venues printed different extremes.
        </ProvenanceNotice>
      </div>

      <p className="text-[11px] leading-relaxed text-text-muted max-w-3xl">{CYCLE_COPY.absentMetricsNote}</p>
    </div>
  )
}
