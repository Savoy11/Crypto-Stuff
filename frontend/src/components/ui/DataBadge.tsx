'use client'

import { Radio, FlaskConical, MinusCircle, Clock } from 'lucide-react'
import { formatDistanceToNow, parseISO } from 'date-fns'

export type DataStatus = 'live' | 'estimate' | 'unavailable'

interface DataBadgeProps {
  status: DataStatus
  /** Provider/source name, e.g. "CoinGecko", "mempool.space". */
  source?: string
  /** ISO timestamp the value was produced — renders a relative "2m ago". */
  asOf?: string
  className?: string
  /** Hide the text label, show only the dot/icon (for dense tables). */
  iconOnly?: boolean
}

const CONFIG: Record<DataStatus, { label: string; icon: typeof Radio; cls: string }> = {
  live: {
    label: 'Live',
    icon: Radio,
    cls: 'text-emerald-300/90 border-emerald-500/20 bg-emerald-500/5',
  },
  estimate: {
    label: 'Est.',
    icon: FlaskConical,
    cls: 'text-amber-300/90 border-amber-500/20 bg-amber-500/5',
  },
  unavailable: {
    label: 'Not available',
    icon: MinusCircle,
    cls: 'text-slate-400 border-slate-500/20 bg-slate-500/5',
  },
}

function relAsOf(asOf?: string): string | null {
  if (!asOf) return null
  try {
    return formatDistanceToNow(parseISO(asOf), { addSuffix: true })
  } catch {
    return null
  }
}

/**
 * Provenance chip for a numeric field: declares whether a value is real-time
 * ("live"), a static-amount estimate ("est."), or has no source ("not
 * available"), with optional source name and freshness. See DATA-AVAILABILITY.md.
 */
export function DataBadge({ status, source, asOf, className, iconOnly }: DataBadgeProps) {
  const { label, icon: Icon, cls } = CONFIG[status]
  const rel = relAsOf(asOf)
  const title = [
    status === 'live' ? 'Live data' : status === 'estimate' ? 'Estimated' : 'No live source',
    source ? `via ${source}` : null,
    rel ? `updated ${rel}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium leading-none ${cls} ${className ?? ''}`}
    >
      <Icon size={10} aria-hidden className={status === 'live' ? 'animate-pulse' : ''} />
      {!iconOnly && <span>{label}</span>}
      {!iconOnly && source && <span className="opacity-60">· {source}</span>}
      {!iconOnly && rel && (
        <span className="inline-flex items-center gap-0.5 opacity-60">
          <Clock size={9} aria-hidden />
          {rel}
        </span>
      )}
    </span>
  )
}
