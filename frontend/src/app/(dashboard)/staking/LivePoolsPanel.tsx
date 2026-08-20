'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ExternalLink, Radio, RefreshCw, Search } from 'lucide-react'
import { SourceLine } from '@/components/ui/SourceLine'
import { STALE_TIME_LONG, GC_TIME } from '@/lib/constants'
import { timeAgoCompact } from '@/lib/utils/format'
import type { StakingDiscoveryResponse, DiscoverySource } from '@/app/live-data/staking-discovery/route'

// ─── Live on-chain pools (W3-3, option B) ─────────────────────────────────────
//
// Extracted from the Staking Discovery page when it merged into /staking on
// 2026-08-20. The owner's review flagged the two staking pages as possibly
// "doing the same things" — they were: both rendered the same 55-provider
// curated catalog with near-identical filters. The live pool discovery below
// was the only thing Discovery had that /staking did not, so it became a tab
// here and the duplicate directory died with its page
// (/staking-discovery now redirects to /staking?tab=pools).

const SOURCE_LABELS: Record<DiscoverySource, string> = {
  defillama: 'DefiLlama', yearn: 'Yearn', pendle: 'Pendle', beefy: 'Beefy',
}

function fmtUsd(n: number) {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`
  return `$${(n / 1e3).toFixed(0)}K`
}

const LIVE_PREVIEW_ROWS = 12

function LiveOpportunities({ search }: { search: string }) {
  const [showAll, setShowAll] = useState(false)
  const { data, isLoading, isFetching, isError, refetch } = useQuery<StakingDiscoveryResponse>({
    queryKey: ['staking-discovery'],
    queryFn: () => fetch('/live-data/staking-discovery').then(r => r.json()),
    staleTime: STALE_TIME_LONG,
    gcTime: GC_TIME,
    refetchInterval: 1000 * 60 * 10,
  })

  const pools = useMemo(() => {
    const all = data?.pools ?? []
    if (!search) return all
    const q = search.toLowerCase()
    return all.filter(p =>
      p.project.toLowerCase().includes(q) ||
      p.opportunityName.toLowerCase().includes(q) ||
      p.symbol.toLowerCase().includes(q) ||
      p.chain.toLowerCase().includes(q)
    )
  }, [data, search])

  const visible = showAll ? pools : pools.slice(0, LIVE_PREVIEW_ROWS)
  const sourceSummary = data
    ? (Object.entries(data.sources) as Array<[DiscoverySource, number]>)
        .filter(([, n]) => n > 0)
        .map(([s, n]) => `${SOURCE_LABELS[s]} ${n}`)
        .join(' · ')
    : null

  return (
    <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
      {/* Section header */}
      <div className="p-4 flex items-center gap-3 flex-wrap border-b border-border">
        <div className="flex items-center gap-2">
          <Radio size={15} className="text-emerald-400" />
          <h2 className="text-sm font-semibold text-text-primary">Live On-Chain Opportunities</h2>
        </div>
        {data && (
          <span className="text-[11px] text-text-muted">
            {pools.length} pools{sourceSummary ? ` — ${sourceSummary}` : ''} · updated {timeAgoCompact(data.updatedAt)}
          </span>
        )}
        {data?.stale && (
          <span className="px-1.5 py-0.5 text-[10px] rounded border font-medium bg-amber-500/15 text-amber-300 border-amber-500/30">
            cached — discovery sources unreachable
          </span>
        )}
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-bg-elevated text-text-secondary hover:text-text-primary hover:border-border-hover transition-colors disabled:opacity-60"
        >
          <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
          {isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* States */}
      {isLoading && (
        <div className="px-4 py-8 text-center text-xs text-text-muted">Scanning DefiLlama, Yearn, Pendle, and Beefy…</div>
      )}
      {isError && !data && (
        <div className="px-4 py-8 text-center text-xs text-text-muted">
          Couldn&apos;t reach the discovery sources.{' '}
          <button onClick={() => refetch()} className="text-accent-blue hover:underline">Retry</button>
        </div>
      )}
      {data && pools.length === 0 && !isLoading && (
        <div className="px-4 py-8 text-center text-xs text-text-muted">No live pools match your search.</div>
      )}

      {/* Pool table */}
      {visible.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-bg-elevated/50">
                <th className="py-2 pl-4 pr-2 text-[10px] font-semibold text-text-muted uppercase tracking-wider">Opportunity</th>
                <th className="py-2 px-2 text-[10px] font-semibold text-text-muted uppercase tracking-wider">Asset</th>
                <th className="py-2 px-2 text-[10px] font-semibold text-text-muted uppercase tracking-wider">Chain</th>
                <th className="py-2 px-2 text-[10px] font-semibold text-text-muted uppercase tracking-wider">APY</th>
                <th className="py-2 px-2 text-[10px] font-semibold text-text-muted uppercase tracking-wider">TVL</th>
                <th className="py-2 pl-2 pr-4 text-[10px] font-semibold text-text-muted uppercase tracking-wider">Source</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(p => (
                <tr key={p.poolId} className="border-t border-border/50 hover:bg-bg-elevated/40 transition-colors">
                  <td className="py-2.5 pl-4 pr-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-xs text-text-primary">{p.project}</span>
                      {p.url && (
                        <a href={p.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${p.opportunityName}`}
                          className="text-text-muted hover:text-accent-blue transition-colors">
                          <ExternalLink size={11} />
                        </a>
                      )}
                    </div>
                    <div className="text-[10px] text-text-muted truncate max-w-[220px]">{p.opportunityName}</div>
                  </td>
                  <td className="py-2.5 px-2 font-mono text-xs text-text-primary">{p.symbol}</td>
                  <td className="py-2.5 px-2 text-xs text-text-muted">{p.chain}</td>
                  <td
                    className="py-2.5 px-2 text-sm font-bold text-emerald-400"
                    title={p.apyBase != null || p.apyReward != null
                      ? `Base ${p.apyBase ?? 0}% + rewards ${p.apyReward ?? 0}%`
                      : undefined}
                  >
                    {p.apy.toFixed(2)}%
                  </td>
                  <td className="py-2.5 px-2 text-xs font-mono text-text-secondary">{fmtUsd(p.tvlUsd)}</td>
                  <td className="py-2.5 pl-2 pr-4">
                    <span className="text-[10px] text-text-muted bg-bg-elevated border border-border px-1.5 py-0.5 rounded">
                      {SOURCE_LABELS[p.source]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Show all toggle + coverage note */}
      <div className="px-4 py-2.5 border-t border-border bg-bg-elevated/20 flex items-center gap-3 flex-wrap">
        {pools.length > LIVE_PREVIEW_ROWS && (
          <button onClick={() => setShowAll(v => !v)}
            className="text-xs text-accent-blue hover:underline font-medium">
            {showAll ? 'Show fewer' : `Show all ${pools.length} pools`}
          </button>
        )}
        <span className="text-[10px] text-text-muted">
          Live discovery scans on-chain sources only (DefiLlama yields, Yearn, Pendle, Beefy). Exchange and
          wallet staking rates have no public feeds — those platforms are covered by the curated Providers tab.
        </span>
      </div>
    </div>
  )
}


export function LivePoolsPanel() {
  const [search, setSearch] = useState('')
  return (
    <div className="space-y-4">
      <div className="relative max-w-xs">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search pools, assets, chains…"
          className="w-full rounded-lg border border-border bg-bg-elevated py-1.5 pl-8 pr-3 text-xs text-text-primary placeholder:text-text-muted/60 focus:border-accent-blue/50 focus:outline-none"
        />
      </div>
      <LiveOpportunities search={search} />
      <SourceLine id="staking-discovery" />
    </div>
  )
}
