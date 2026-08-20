'use client'

import Link from 'next/link'
import { Info, KeyRound } from 'lucide-react'

interface LiveUnavailableProps {
  title?: string
  /** What is missing and why there is no live source for it. */
  message: string
  className?: string
  compact?: boolean
  /**
   * Hide the Integrations link for the rare notice where a key genuinely
   * cannot fix it (e.g. the futures term structure, which has no source at any
   * price). Defaults to showing it — W3-7: nearly every one of these notices
   * NAMES the fix ("add a Tiingo or FMP key on the Integrations page") while
   * giving the reader nothing to click, which is a dead end wearing helpful
   * copy.
   */
  showIntegrationsLink?: boolean
}

/**
 * Strict-live placeholder. Shown wherever a feature has no free real-time data
 * source, so a full live test surfaces exactly what is missing instead of
 * falling back to fabricated/mock figures.
 */
export function LiveUnavailable({ title = 'Not available with live data', message, className, compact, showIntegrationsLink = true }: LiveUnavailableProps) {
  return (
    <div
      className={`rounded-xl border border-amber-500/20 bg-amber-500/5 text-center ${compact ? 'p-4' : 'p-8'} ${className ?? ''}`}
    >
      <Info className={`mx-auto ${compact ? 'h-5 w-5' : 'h-7 w-7'} text-amber-400/70`} aria-hidden />
      <p className={`mt-2 font-medium text-slate-200 ${compact ? 'text-xs' : 'text-sm'}`}>{title}</p>
      <p className="mt-1 text-xs text-slate-400 max-w-md mx-auto leading-relaxed">{message}</p>
      {showIntegrationsLink && (
        <Link
          href="/settings"
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-300 transition-colors hover:bg-amber-500/20"
        >
          <KeyRound size={12} aria-hidden /> Add a data source in Integrations
        </Link>
      )}
    </div>
  )
}
