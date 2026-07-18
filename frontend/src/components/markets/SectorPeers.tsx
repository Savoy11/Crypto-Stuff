'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Users } from 'lucide-react'
import { EQUITY_CATALOG, SECTOR_INFO, type SectorId } from '@/lib/data/equityCatalog'
import { formatCompact, formatCurrency, formatPercent } from '@/lib/utils/format'
import { STALE_TIME_SHORT } from '@/lib/constants'
import type { SecurityQuotesResponse } from '@/app/live-data/security-quotes/route'

// Same-sector peers from the equity catalog with live quotes, so a stock's
// page shows where it sits among comparable names. Rows link to each peer.

const MAX_PEERS = 8

export function SectorPeers({ symbol, sector }: { symbol: string; sector: SectorId }) {
  const peers = EQUITY_CATALOG
    .filter(e => e.sector === sector && e.symbol !== symbol)
    .sort((a, b) => b.marketCapB - a.marketCapB)
    .slice(0, MAX_PEERS)

  const symbols = peers.map(p => p.symbol)
  const { data } = useQuery<SecurityQuotesResponse>({
    queryKey: ['security-quotes', 'peers', symbols.join(',')],
    queryFn: () => fetch(`/live-data/security-quotes?symbols=${encodeURIComponent(symbols.join(','))}`).then(r => r.json()),
    staleTime: STALE_TIME_SHORT,
    refetchInterval: 60_000,
    enabled: symbols.length > 0,
  })

  if (peers.length === 0) return null
  const sectorMeta = SECTOR_INFO[sector]

  return (
    <section className="rounded-card border border-border bg-bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-text-secondary flex items-center gap-2">
          <Users size={14} className="text-text-muted" aria-hidden />
          Sector Peers
        </h2>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-text-muted">
          <span className="size-1.5 rounded-full" style={{ backgroundColor: sectorMeta.color }} aria-hidden />
          {sectorMeta.label}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-text-muted border-b border-border/60">
              <th className="pb-2 pr-4 font-medium">Symbol</th>
              <th className="pb-2 pr-4 font-medium">Company</th>
              <th className="pb-2 pr-4 font-medium text-right">Price</th>
              <th className="pb-2 pr-4 font-medium text-right">Today</th>
              <th className="pb-2 font-medium text-right">Market Cap</th>
            </tr>
          </thead>
          <tbody>
            {peers.map(peer => {
              const q = data?.quotes?.[peer.symbol]
              const live = !!q && data?.source !== 'reference' && !q.reference
              const price = q?.price ?? peer.referencePrice
              const change = live ? q?.changePercent ?? null : null
              const mcap = q?.marketCap ?? peer.marketCapB * 1e9
              return (
                <tr key={peer.symbol} className="border-b border-border/30 last:border-0 hover:bg-bg-elevated/50 transition-colors">
                  <td className="py-2 pr-4">
                    <Link href={`/equities/${peer.symbol.toLowerCase()}`} className="font-mono font-medium text-accent-blue hover:underline">
                      {peer.symbol}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 text-text-secondary truncate max-w-[220px]">{peer.name}</td>
                  <td className="py-2 pr-4 text-right font-mono tabular-nums text-text-primary">
                    {formatCurrency(price)}
                    {!live && <span className="ml-1 text-[9px] text-amber-400/70 align-top font-sans">ref</span>}
                  </td>
                  <td className={clsx('py-2 pr-4 text-right font-mono tabular-nums',
                    change == null ? 'text-text-muted' : change >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                    {change == null ? '—' : formatPercent(change, 2)}
                  </td>
                  <td className="py-2 text-right font-mono tabular-nums text-text-secondary">{formatCompact(mcap)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
