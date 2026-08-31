'use client'

import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import { TrendingDown, TrendingUp, Minus, AlertTriangle } from 'lucide-react'
import { describeCurve } from '@/lib/data/termStructure'
import { SourceLine } from '@/components/ui/SourceLine'
import { STALE_TIME_LONG } from '@/lib/constants'
import type { FuturesCurveResponse } from '@/app/live-data/futures-curve/route'

// Forward curve for one futures contract (P2-O4).
//
// The detail pages already carry the caveat that "ETFs track futures with roll
// costs and tracking error". This turns that sentence into a number: the shape
// of the curve IS the roll cost, and it is the reason a fund like USO can lag
// crude badly over a long hold while tracking it fine day to day.

const SHAPE_STYLE = {
  contango:       { label: 'Contango',       Icon: TrendingUp,   tone: 'text-orange-400',  chip: 'bg-orange-500/10 text-orange-400 border-orange-500/30' },
  backwardation:  { label: 'Backwardation',  Icon: TrendingDown, tone: 'text-emerald-400', chip: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  flat:           { label: 'Flat',           Icon: Minus,        tone: 'text-text-muted',  chip: 'bg-slate-500/10 text-slate-300 border-slate-500/30' },
} as const

/** Axis/tooltip formatter honouring the contract's own quoting convention. */
function formatLevel(value: number, quoteBasis: string, unit: string | null): string {
  const decimals = value >= 1000 ? 0 : value >= 20 ? 2 : 3
  const n = value.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  // A $-prefixed axis would mislabel 472¢ corn as $472 — the same rule the
  // price chart and formatInstrumentQuote() follow.
  if (quoteBasis === 'cents') return `${n}¢${unit ? `/${unit}` : ''}`
  if (quoteBasis === 'points') return n
  return `$${n}${unit ? `/${unit}` : ''}`
}

export function TermStructureCard({ slug, kind = 'commodity' }: { slug: string; kind?: 'commodity' | 'rate' }) {
  const { data, isLoading } = useQuery<FuturesCurveResponse>({
    queryKey: ['futures-curve', kind, slug],
    queryFn: () => fetch(`/live-data/futures-curve?slug=${encodeURIComponent(slug)}&kind=${kind}`).then((r) => r.json()),
    staleTime: STALE_TIME_LONG,
    retry: 1,
  })

  if (isLoading) {
    return (
      <div className="rounded-card border border-border bg-bg-card p-4">
        <h2 className="text-sm font-medium text-text-secondary">Forward curve</h2>
        <p className="mt-1 text-xs text-text-muted">Fetching contract months…</p>
      </div>
    )
  }

  // Every not-available path says WHY — a silently missing section would read
  // as "this contract has no curve" rather than "we couldn't price one".
  if (!data?.ok || !data.analysis) {
    return (
      <div className="rounded-card border border-border bg-bg-card p-4">
        <h2 className="text-sm font-medium text-text-secondary">Forward curve</h2>
        <p className="mt-1.5 text-xs text-text-muted leading-relaxed">
          {data?.error ?? 'The forward curve couldn’t be built for this contract right now.'}
        </p>
      </div>
    )
  }

  const { analysis, points, quoteBasis, unit, unresolved } = data
  const style = SHAPE_STYLE[analysis.shape]

  return (
    <div className="rounded-card border border-border bg-bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-medium text-text-secondary">Forward curve</h2>
        <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold border', style.chip)}>
          <style.Icon size={11} aria-hidden /> {style.label}
        </span>
        <span className="ml-auto font-mono tabular-nums text-xs text-text-muted">
          {analysis.spreadPct >= 0 ? '+' : ''}{analysis.spreadPct.toFixed(2)}% over {analysis.monthsSpan}mo
        </span>
      </div>

      <div className="mt-3 h-44">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2433" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: '#64748b', fontSize: 10 }}
              axisLine={{ stroke: '#1e2433' }}
              tickLine={false}
            />
            <YAxis
              domain={['auto', 'auto']}
              tick={{ fill: '#64748b', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={62}
              tickFormatter={(v: number) => formatLevel(v, quoteBasis, null)}
            />
            <Tooltip
              contentStyle={{ background: '#1a1d26', border: '1px solid #1e2433', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: '#94a3b8' }}
              formatter={(v: unknown) => [formatLevel(Number(v), quoteBasis, unit), 'Settle']}
            />
            <Line
              type="monotone"
              dataKey="price"
              stroke={analysis.shape === 'backwardation' ? '#10b981' : analysis.shape === 'contango' ? '#f97316' : '#64748b'}
              strokeWidth={2}
              dot={{ r: 2.5 }}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-2 text-xs text-text-muted leading-relaxed">{describeCurve(analysis)}</p>

      {!analysis.monotonic && (
        <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-amber-400">
          <AlertTriangle size={11} className="mt-0.5 shrink-0" aria-hidden />
          The curve changes direction rather than sloping cleanly, so the single figure above
          smooths over a humped shape — read the months, not just the label.
        </p>
      )}

      <p className="mt-2 pt-2 border-t border-border/60 text-[11px] text-text-muted leading-relaxed">
        {points.length} listed month{points.length === 1 ? '' : 's'} from {analysis.nearest.label} to{' '}
        {analysis.furthest.label}.
        {unresolved.length > 0 && ` ${unresolved.length} requested month${unresolved.length === 1 ? '' : 's'} isn’t listed or didn’t quote — most contracts trade only part of the calendar.`}
      </p>
      <div className="mt-2">
        <SourceLine id="futures-curve" />
      </div>
    </div>
  )
}
