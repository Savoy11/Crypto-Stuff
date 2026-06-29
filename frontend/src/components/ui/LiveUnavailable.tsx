'use client'

import { Info } from 'lucide-react'

interface LiveUnavailableProps {
  title?: string
  /** What is missing and why there is no live source for it. */
  message: string
  className?: string
  compact?: boolean
}

/**
 * Strict-live placeholder. Shown wherever a feature has no free real-time data
 * source, so a full live test surfaces exactly what is missing instead of
 * falling back to fabricated/mock figures.
 */
export function LiveUnavailable({ title = 'Not available with live data', message, className, compact }: LiveUnavailableProps) {
  return (
    <div
      className={`rounded-xl border border-amber-500/20 bg-amber-500/5 text-center ${compact ? 'p-4' : 'p-8'} ${className ?? ''}`}
    >
      <Info className={`mx-auto ${compact ? 'h-5 w-5' : 'h-7 w-7'} text-amber-400/70`} aria-hidden />
      <p className={`mt-2 font-medium text-slate-200 ${compact ? 'text-xs' : 'text-sm'}`}>{title}</p>
      <p className="mt-1 text-xs text-slate-400 max-w-md mx-auto leading-relaxed">{message}</p>
    </div>
  )
}
