'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ExternalLink, ChevronDown, ChevronUp, CheckCircle, AlertTriangle, Shield, Building2, Wallet, Layers, Search, RefreshCw, Radio } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { RiskScoreBadge } from '@/components/assets/RiskScoreBadge'
import { STALE_TIME_LONG, GC_TIME } from '@/lib/constants'
import { clsx } from 'clsx'
import {
  STAKING_PROVIDERS,
  STAKING_COIN_INFO,
  type StakingProvider, type ProviderCategory, type StakingCoinId,
} from '@/lib/data/stakingProviders'
import type { StakingDiscoveryResponse, DiscoverySource } from '@/app/live-data/staking-discovery/route'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTvl(b: number) {
  if (b >= 1) return `$${b.toFixed(1)}B`
  return `$${(b * 1000).toFixed(0)}M`
}

function categoryMeta(cat: ProviderCategory) {
  return {
    cefi:   { label: 'Exchange / CeFi',  Icon: Building2, color: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
    wallet: { label: 'Self-Custody',      Icon: Wallet,    color: 'bg-violet-500/15 text-violet-300 border-violet-500/30' },
    liquid: { label: 'DeFi Protocol',     Icon: Layers,    color: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' },
  }[cat]
}

// ─── Platform card ─────────────────────────────────────────────────────────────

function PlatformCard({ provider }: { provider: StakingProvider }) {
  const [expanded,  setExpanded]  = useState(false)

  const cat        = categoryMeta(provider.category)
  const CatIcon    = cat.Icon

  const assets = Object.values(provider.assets) as NonNullable<typeof provider.assets[StakingCoinId]>[]
  const bestApy = Math.max(...assets.map(a => a.staticApr))
  const assetCount = assets.length

  return (
    <div className={clsx(
      'bg-bg-card border rounded-xl overflow-hidden transition-all',
      provider.defunct ? 'border-red-500/40' : 'border-border',
    )}>
      {/* Defunct banner */}
      {provider.defunct && (
        <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/30 flex items-center gap-2">
          <AlertTriangle size={13} className="text-red-400 shrink-0" />
          <span className="text-xs text-red-300 font-medium">
            DEFUNCT — {provider.defunctDate} · {provider.defunctNote?.slice(0, 120)}…
          </span>
        </div>
      )}

      {/* Header row */}
      <div className="p-4 flex items-start gap-3">
        {/* Icon */}
        <div className={clsx(
          'size-10 rounded-lg border flex items-center justify-center shrink-0 mt-0.5',
          provider.defunct ? 'bg-red-500/10 border-red-500/30' : 'bg-bg-elevated border-border',
        )}>
          <CatIcon size={17} className={provider.defunct ? 'text-red-400' : 'text-text-muted'} />
        </div>

        {/* Name + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {provider.website ? (
              <a href={provider.website} target="_blank" rel="noopener noreferrer"
                className="font-bold text-text-primary hover:text-accent-blue transition-colors flex items-center gap-1 group">
                {provider.name}
                <ExternalLink size={12} className="text-text-muted group-hover:text-accent-blue shrink-0" />
              </a>
            ) : (
              <span className="font-bold text-text-primary">{provider.name}</span>
            )}

            <span className={clsx('px-1.5 py-0.5 text-[10px] rounded border font-medium', cat.color)}>
              {cat.label}
            </span>

            {provider.auditCount != null && provider.auditCount > 0 && (
              <span className="text-emerald-400/70 text-[10px] flex items-center gap-0.5">
                <CheckCircle size={10} /> {provider.auditCount} audit{provider.auditCount > 1 ? 's' : ''}
              </span>
            )}
          </div>

          <p className="text-xs text-text-muted mt-0.5 line-clamp-2">{provider.tagline}</p>

          {/* Stats row */}
          <div className="flex flex-wrap gap-4 mt-2 text-xs">
            <span className="text-text-muted">
              <span className="text-text-primary font-medium">{assetCount}</span> asset{assetCount !== 1 ? 's' : ''}
            </span>
            {!provider.defunct && (
              <span className="text-text-muted">
                Best APY <span className="text-emerald-400 font-bold">{bestApy.toFixed(1)}%</span>
              </span>
            )}
            {provider.tvlBillions != null && (
              <span className="text-text-muted">
                TVL <span className="text-text-primary font-mono">{fmtTvl(provider.tvlBillions)}</span>
              </span>
            )}
            {provider.founded && (
              <span className="text-text-muted">Founded <span className="text-text-primary">{provider.founded}</span></span>
            )}
          </div>
        </div>

      </div>

      {/* Expand toggle */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full px-4 py-2.5 flex items-center gap-2 text-xs text-text-muted hover:text-text-secondary border-t border-border bg-bg-elevated/20 hover:bg-bg-elevated/50 transition-colors"
      >
        {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        <span className="font-medium">{expanded ? 'Hide' : 'Show'} staking opportunities</span>
        {!expanded && (
          <span className="ml-auto flex flex-wrap gap-2">
            {assets.slice(0, 5).map(a => {
              const info = STAKING_COIN_INFO[a.coinId]
              return (
                <span key={a.coinId} className="flex items-center gap-1">
                  <span className="font-mono text-text-primary text-[10px]">{info?.symbol ?? a.coinId.toUpperCase()}</span>
                  {!provider.defunct && <span className="text-emerald-400 text-[10px]">{a.staticApr.toFixed(1)}%</span>}
                </span>
              )
            })}
            {assets.length > 5 && <span className="text-text-muted text-[10px]">+{assets.length - 5} more</span>}
          </span>
        )}
      </button>

      {/* Opportunity table */}
      {expanded && (
        <div className="border-t border-border overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-bg-elevated/50">
                <th className="py-2 pl-4 pr-2 text-[10px] font-semibold text-text-muted uppercase tracking-wider">Asset</th>
                <th className="py-2 px-2 text-[10px] font-semibold text-text-muted uppercase tracking-wider">APY</th>
                <th className="py-2 px-2 text-[10px] font-semibold text-text-muted uppercase tracking-wider">Min Stake</th>
                <th className="py-2 px-2 text-[10px] font-semibold text-text-muted uppercase tracking-wider">Lockup</th>
                <th className="py-2 px-2 text-[10px] font-semibold text-text-muted uppercase tracking-wider text-center">Type</th>
                <th className="py-2 pl-2 pr-4 text-[10px] font-semibold text-text-muted uppercase tracking-wider">Notes</th>
              </tr>
            </thead>
            <tbody>
              {assets.map(asset => {
                const info        = STAKING_COIN_INFO[asset.coinId]
                return (
                  <tr key={asset.coinId} className="border-t border-border/50 hover:bg-bg-elevated/40 transition-colors">
                    {/* Asset */}
                    <td className="py-2.5 pl-4 pr-2">
                      <div className="font-mono font-bold text-xs text-text-primary">{info?.symbol ?? asset.coinId.toUpperCase()}</div>
                      <div className="text-[10px] text-text-muted">{info?.name}</div>
                    </td>
                    {/* APY */}
                    <td className="py-2.5 px-2">
                      {provider.defunct ? (
                        <span className="text-red-400 font-bold text-sm line-through opacity-60">{asset.staticApr.toFixed(2)}%</span>
                      ) : (
                        <span className="text-emerald-400 font-bold text-sm">{asset.staticApr.toFixed(2)}%</span>
                      )}
                    </td>
                    {/* Min stake */}
                    <td className="py-2.5 px-2 text-xs text-text-muted font-mono">
                      {asset.minStakeNative === 0 ? <span className="text-text-secondary">None</span> : `${asset.minStakeNative} ${info?.symbol ?? ''}`}
                    </td>
                    {/* Lockup */}
                    <td className="py-2.5 px-2 text-xs">
                      {asset.lockupDays === 0 ? (
                        <span className="text-emerald-400">Flexible</span>
                      ) : (
                        <span className="text-amber-400">{asset.lockupDays}d</span>
                      )}
                    </td>
                    {/* Type */}
                    <td className="py-2.5 px-2 text-center">
                      {asset.receiptToken ? (
                        <span className="text-cyan-400 text-[10px] font-medium bg-cyan-500/10 border border-cyan-500/20 px-1.5 py-0.5 rounded">
                          {asset.receiptToken}
                        </span>
                      ) : asset.liquid ? (
                        <span className="text-cyan-400 text-[10px]">Liquid</span>
                      ) : (
                        <span className="text-text-muted text-[10px]">Locked</span>
                      )}
                    </td>
                    {/* Notes */}
                    <td className="py-2.5 pl-2 pr-4 text-[10px] text-text-muted max-w-[200px]">
                      {asset.lockupNote ?? asset.features[0] ?? '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* Description + risk breakdown */}
          <div className="border-t border-border/50 px-4 py-3 bg-bg-elevated/10">
            <p className="text-xs text-text-secondary">{provider.description}</p>
          </div>

        </div>
      )}
    </div>
  )
}

// ─── Live on-chain opportunities ──────────────────────────────────────────────

const SOURCE_LABELS: Record<DiscoverySource, string> = {
  defillama: 'DefiLlama', yearn: 'Yearn', pendle: 'Pendle', beefy: 'Beefy',
}

function timeAgo(iso: string): string {
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (secs < 60) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
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
            {pools.length} pools{sourceSummary ? ` — ${sourceSummary}` : ''} · updated {timeAgo(data.updatedAt)}
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
                <th className="py-2 px-2 text-[10px] font-semibold text-text-muted uppercase tracking-wider">Safety</th>
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
                  <td className="py-2.5 px-2">
                    <RiskScoreBadge score={p.riskCanonical} band={p.band} size="xs" />
                  </td>
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
          wallet staking rates have no public feeds — those platforms are covered by the curated directory below.
        </span>
      </div>
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

type CategoryFilter = 'all' | ProviderCategory

const CATEGORY_FILTERS: Array<{ id: CategoryFilter; label: string }> = [
  { id: 'all',    label: 'All Platforms' },
  { id: 'cefi',   label: 'Exchanges'     },
  { id: 'wallet', label: 'Self-Custody'  },
  { id: 'liquid', label: 'DeFi / Liquid' },
]

export default function StakingPlatformsPage() {
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [search, setSearch]                 = useState('')
  const [showDefunct, setShowDefunct]       = useState(false)

  const filtered = STAKING_PROVIDERS.filter(p => {
    if (p.defunct && !showDefunct) return false
    if (categoryFilter !== 'all' && p.category !== categoryFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (!p.name.toLowerCase().includes(q) && !p.tagline.toLowerCase().includes(q)) return false
    }
    return true
  })

  const counts = {
    all:    STAKING_PROVIDERS.filter(p => !p.defunct).length,
    cefi:   STAKING_PROVIDERS.filter(p => p.category === 'cefi'   && !p.defunct).length,
    wallet: STAKING_PROVIDERS.filter(p => p.category === 'wallet' && !p.defunct).length,
    liquid: STAKING_PROVIDERS.filter(p => p.category === 'liquid' && !p.defunct).length,
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageHeader
          title="Staking Platforms"
          subtitle="Compare every major staking platform and their available opportunities"
          description="Browse exchanges, self-custody wallets, and DeFi protocols that offer staking. Live on-chain opportunities are discovered from DefiLlama, Yearn, Pendle, and Beefy; expand any directory platform to see supported assets, APY rates, lockup periods, and receipt tokens."
          details={[
            { label: 'CeFi exchanges',  text: 'Coinbase, Binance, Kraken, OKX, Bybit, and KuCoin — custodial staking with the platform holding your keys.' },
            { label: 'Self-custody',    text: 'Ledger Live, MetaMask, Phantom, Trust Wallet, and Exodus — you control your keys, delegation is on-chain.' },
            { label: 'DeFi protocols',  text: 'Lido, Rocket Pool, Marinade, Jito, EtherFi, Uniswap, and more — smart-contract based with liquid receipt tokens.' },
          ]}
        />
        <div className="flex gap-3 text-sm shrink-0 flex-wrap">
          {CATEGORY_FILTERS.slice(1).map(f => (
            <div key={f.id} className="bg-bg-card border border-border rounded-lg px-3 py-2 text-center min-w-[64px]">
              <div className="text-lg font-bold text-text-primary">{counts[f.id as keyof typeof counts]}</div>
              <div className="text-xs text-text-muted">{f.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search platforms…"
            className="w-full pl-8 pr-3 py-2 text-sm bg-bg-card border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue"
          />
        </div>

        {/* Category pills */}
        <div className="flex gap-1 bg-bg-elevated p-1 rounded-lg shrink-0">
          {CATEGORY_FILTERS.map(f => (
            <button key={f.id} onClick={() => setCategoryFilter(f.id)}
              className={clsx('px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap',
                categoryFilter === f.id ? 'bg-bg-card text-text-primary shadow-sm' : 'text-text-muted hover:text-text-secondary')}>
              {f.label}
              {f.id !== 'all' && <span className="ml-1 opacity-50">{counts[f.id as keyof typeof counts]}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Live on-chain opportunities — only for filters the discovery sources
          can serve. CeFi/wallet rates have no public feeds (see section note). */}
      {(categoryFilter === 'all' || categoryFilter === 'liquid') && (
        <LiveOpportunities search={search} />
      )}

      {/* Platform directory (curated) */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-primary">Platform Directory</h2>
        <span className="text-xs text-text-muted">{filtered.length} platforms · curated reference</span>
      </div>
      <div className="space-y-3">
        {filtered.map(p => <PlatformCard key={p.id} provider={p} />)}
      </div>

      {/* Defunct toggle */}
      <div className="flex items-center justify-center gap-2">
        <button
          onClick={() => setShowDefunct(v => !v)}
          className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          <Shield size={12} />
          {showDefunct ? 'Hide' : 'Show'} defunct platforms (cautionary examples)
        </button>
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-text-muted">
          <Search size={36} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No platforms match your filters.</p>
        </div>
      )}

      <p className="text-xs text-text-muted text-center pb-4">
        APY figures are indicative — actual rates vary with network conditions. Always verify on the platform&apos;s website before staking.
      </p>
    </div>
  )
}
