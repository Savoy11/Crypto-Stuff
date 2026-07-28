import { clsx } from 'clsx'

// Always-visible freshness line for hand-maintained reference data.
//
// The app has several large curated tables (exchange withdrawal fees, staking
// provider risk profiles, stablecoin issuer metadata). Each exposes an
// identically-shaped provenance object from its data module — verifiedAt,
// ageDays, stale, confidence — and each page rendered its own copy of this
// chip row. This is that row, once.
//
// Deliberately always rendered, not only when stale: "compiled 30 days ago" is
// information the reader needs in order to trust a number, and a notice that
// only appears past a threshold trains people to read its absence as "live".
// Pages that also want an escalating warning when the data goes stale (see
// /reserves) can still add one — this does not replace it.

export type ProvenanceConfidence = 'high' | 'medium' | 'low'

const CONFIDENCE_META: Record<ProvenanceConfidence, { label: string; chip: string }> = {
  high:   { label: 'High confidence',   chip: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  medium: { label: 'Medium confidence', chip: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  low:    { label: 'Low confidence',    chip: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
}

export interface ProvenanceNoticeProps {
  /** Heading shown when the data is within its review window. */
  label: string
  /** Heading shown once stale — should name what might be wrong, not just "stale". */
  staleLabel: string
  confidence: ProvenanceConfidence
  stale: boolean
  /** Trailing sentence(s): what the data is, how old, and what to verify. */
  children: React.ReactNode
}

export function ProvenanceNotice({
  label,
  staleLabel,
  confidence,
  stale,
  children,
}: ProvenanceNoticeProps) {
  const conf = CONFIDENCE_META[confidence]
  return (
    <div
      className={clsx(
        'flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-3 py-2 text-xs',
        stale
          ? 'border-amber-500/30 bg-amber-500/5 text-amber-300/90'
          : 'border-slate-700/60 bg-slate-800/30 text-slate-400'
      )}
    >
      <span className="font-medium">{stale ? `⚠ ${staleLabel}` : label}</span>
      <span className={clsx('px-1.5 py-0.5 rounded border text-[10px] font-semibold', conf.chip)}>
        {conf.label}
      </span>
      <span className="opacity-80">{children}</span>
    </div>
  )
}
