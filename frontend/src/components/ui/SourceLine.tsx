'use client'

import Link from 'next/link'
import { Info } from 'lucide-react'
import { clsx } from 'clsx'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { getSource, SOURCE_STATUS_META } from '@/lib/data/dataSources'

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
 * Compact provenance line for a page/section: "Source: CoinGecko, Binance ·
 * updated 2m ago · details". Reads the canonical registry (dataSources.ts) by
 * id and links to the full /data-sources catalog, so provenance shown in the UI
 * always matches the documented source. Renders nothing if the id is unknown.
 */
export function SourceLine({ id, asOf, className }: SourceLineProps) {
  const entry = getSource(id)
  if (!entry) return null
  const status = SOURCE_STATUS_META[entry.status]
  const names = entry.providers.map(p => p.name).slice(0, 4).join(', ')
  const freshness = rel(asOf)

  return (
    <div className={clsx('flex items-center gap-1.5 flex-wrap text-[11px] text-text-muted', className)}>
      <span className={clsx('px-1 py-0.5 rounded border text-[9px] font-semibold leading-none', status.cls)}>{status.label}</span>
      <span><span className="text-text-secondary">Source:</span> {names}</span>
      {freshness && <span>· updated {freshness}</span>}
      <Link href="/data-sources" className="inline-flex items-center gap-0.5 text-accent-blue/80 hover:text-accent-blue">
        · <Info size={10} aria-hidden /> details
      </Link>
    </div>
  )
}
