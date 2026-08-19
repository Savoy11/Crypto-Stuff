'use client'

import { clsx } from 'clsx'
import { AlertTriangle } from 'lucide-react'
import type { CompositeRisk } from '@/lib/risk/types'
import { bandForScore } from '@/lib/risk/engine'
import { getRiskTailwindClasses } from '@/lib/risk/presentation'

// Renders a CompositeRisk the way the per-coin risk panel renders composites:
// (the /risk-scores page this once matched was removed in the item 4 cut)
// canonical 0–100 higher-is-safer score with its band, per-dimension cards
// with weights and evidence, confidence and coverage always visible. Shared
// shape with that page on purpose — a composite must read the same wherever
// it appears.

function scoreColor(score: number | null): string {
  if (score == null) return 'text-text-muted'
  return getRiskTailwindClasses(bandForScore(score)).text
}

export function TradeRiskReport({ risk }: { risk: CompositeRisk }) {
  const bandStyle = getRiskTailwindClasses(risk.band)

  return (
    <div className="space-y-4">
      {/* Headline */}
      <div className="rounded-card border border-border bg-bg-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className={clsx('font-mono text-4xl font-bold tabular-nums', bandStyle.text)}>
            {risk.score.toFixed(0)}
          </span>
          <span className={clsx('px-2 py-0.5 rounded text-xs font-bold', bandStyle.badge)}>
            {risk.band.toUpperCase()} RISK
          </span>
          <span className="ml-auto text-xs text-text-muted font-mono tabular-nums">
            confidence {(risk.confidence * 100).toFixed(0)}% · coverage {(risk.coverage * 100).toFixed(0)}%
          </span>
        </div>
        <p className="mt-2 text-[11px] text-text-muted">
          Safety score, 0–100 where higher is safer — the app-wide canonical scale. Coverage is the
          share of the profile actually scored from your inputs; what you leave blank lowers
          confidence, never the score.
        </p>
      </div>

      {/* Dimensions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {risk.dimensions.map((dim) => (
          <div key={dim.key} className="rounded border border-border/60 bg-bg-card px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-text-secondary">{dim.label}</span>
              <span className="text-[10px] text-text-muted font-mono">w {(dim.weight * 100).toFixed(0)}%</span>
            </div>
            <p className={clsx('mt-1 font-mono text-lg font-bold tabular-nums', scoreColor(dim.score))}>
              {dim.score == null ? 'N/A' : dim.score.toFixed(0)}
            </p>
            <ul className="mt-1 space-y-0.5">
              {dim.evidence.map((ev, j) => (
                <li key={j} className="text-[11px] text-text-muted leading-snug">
                  <span className="text-text-secondary">{ev.metric}:</span>{' '}
                  {ev.value == null ? '—' : String(ev.value)}
                  {ev.note && <span className="text-text-muted/80"> · {ev.note}</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {risk.warnings.length > 0 && (
        <ul className="space-y-1">
          {risk.warnings.map((w, j) => (
            <li key={j} className="flex items-start gap-1.5 text-[11px] text-text-muted">
              <AlertTriangle size={11} className="mt-0.5 flex-shrink-0 text-amber-400" aria-hidden />
              {w}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
