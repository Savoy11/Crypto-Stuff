'use client'

import Link from 'next/link'
import { Info } from 'lucide-react'
import { clsx } from 'clsx'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { describeSource, getSource, requiredAttributions, SOURCE_STATUS_META } from '@/lib/data/dataSources'

interface SourceLineProps {
  /** Registry id — usually the /live-data route folder (see dataSources.ts). */
  id: string
  /** ISO timestamp the data was produced, for a "· updated 2m ago" suffix. */
  asOf?: string
  className?: string
}

function rel(asOf?: string): string | null {
  if (!asOf) return null
  try { return formatDistanceToNow(parseISO(asOf), { addSuffix: true }) } catch { return null }
}

/**
 * Compact provenance line for a page/section. Reads the canonical registry
 * (dataSources.ts) by id and links to the full /data-sources catalog, so
 * provenance shown in the UI always matches the documented source.
 *
 * Two shapes, and the difference is the point:
 *   provider data → "Source: CoinGecko, Binance · updated 2m ago · details"
 *   derived value → "Computed by Finance Now from DefiLlama, CoinGecko · …"
 *
 * A risk score, correlation matrix, drift report or AI brief is this app's own
 * work. Rendering it as "Source: DefiLlama" credits a provider with a number
 * they never published — the exact thing the house policy forbids. The wording
 * lives in describeSource() and is tested there.
 */
export function SourceLine({ id, asOf, className }: SourceLineProps) {
  const entry = getSource(id)

  // An unknown id used to render nothing at all, which is the worst available
  // behaviour: a typo'd id produces a page with NO attribution, and a missing
  // provenance line is indistinguishable from a surface that deliberately has
  // none. (This is not hypothetical — the macro TA page shipped with
  // `security-ohlcv`, which isn't a registry id, and rendered blank.) Loud in
  // development, silent in production, where a broken badge helps nobody.
  if (!entry) {
    if (process.env.NODE_ENV === 'development') {
      return (
        <div className={clsx('text-[11px] text-red-400', className)}>
          SourceLine: unknown source id &ldquo;{id}&rdquo; — add it to lib/data/dataSources.ts
        </div>
      )
    }
    return null
  }

  const status = SOURCE_STATUS_META[entry.status]
  const { lead, names } = describeSource(entry)
  const freshness = rel(asOf)
  const attributions = requiredAttributions(entry)

  return (
    <div className={clsx('flex items-center gap-1.5 flex-wrap text-[11px] text-text-muted', className)}>
      <span className={clsx('px-1 py-0.5 rounded border text-[9px] font-semibold leading-none', status.cls)}>{status.label}</span>
      <span>
        <span className="text-text-secondary">{lead}</span>
        {names.length > 0 && ` ${names.slice(0, 4).join(', ')}`}
      </span>
      {freshness && <span>· updated {freshness}</span>}
      <Link href="/data-sources" className="inline-flex items-center gap-0.5 text-accent-blue/80 hover:text-accent-blue">
        · <Info size={10} aria-hidden /> details
      </Link>

      {/* Licence-required attribution, verbatim and at the size the licence
          sets. Rendered as its own element rather than folded into the
          provenance sentence above: CoinGecko's API Terms clause 4 prescribes
          the MESSAGE ("Powered by CoinGecko"), and "Source: CoinGecko, Binance"
          is not that message however accurate it is. 11px clears the stated
          10px floor with a margin, and text-text-secondary keeps it legible
          rather than the muted grey the rest of this line uses. */}
      {attributions.map((a) => (
        <span key={a.text} className="text-[11px] leading-none text-text-secondary">
          ·{' '}
          {a.href ? (
            <a href={a.href} target="_blank" rel="noopener noreferrer" className="hover:text-accent-blue">
              {a.text}
            </a>
          ) : a.text}
        </span>
      ))}
    </div>
  )
}
