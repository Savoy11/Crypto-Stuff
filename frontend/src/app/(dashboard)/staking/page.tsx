'use client'

import { ModuleGate } from '@/components/layout/ModuleGate'
import React, { useState, useMemo, useRef, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle, TrendingUp, Clock, Lock, ExternalLink,
  ChevronDown, ChevronUp, Info, CheckCircle, XCircle, Zap,
  Building2, Wallet, Layers,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { LivePoolsPanel } from './LivePoolsPanel'
import { SourceLine } from '@/components/ui/SourceLine'
import { ProvenanceNotice } from '@/components/ui/ProvenanceNotice'
import { clsx } from 'clsx'
import { aprDisplay, resolveLiveAprKey } from '@/lib/utils/aprDisplay'
import {
  STAKING_PROVIDERS, STAKING_COIN_INFO,
  resolveYieldType, YIELD_TYPE_META,
  getStakingDataProvenance, STAKING_DATA_LAST_VERIFIED, STAKING_DATA_STALE_AFTER_DAYS,
  type StakingProvider, type StakingCoinId, type ProviderCategory,
} from '@/lib/data/stakingProviders'
import type { StakingRatesResponse } from '@/app/live-data/staking-rates/route'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function categoryIcon(cat: ProviderCategory) {
  if (cat === 'cefi')   return Building2
  if (cat === 'wallet') return Wallet
  return Layers
}

function categoryLabel(cat: ProviderCategory) {
  if (cat === 'cefi')   return 'Exchange / CeFi'
  if (cat === 'wallet') return 'Self-Custody Wallet'
  return 'Liquid Staking'
}

function categoryBadgeClass(cat: ProviderCategory) {
  if (cat === 'cefi')   return 'bg-blue-500/15 text-blue-300 border-blue-500/30'
  if (cat === 'wallet') return 'bg-violet-500/15 text-violet-300 border-violet-500/30'
  return 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
}

// ─── Provider Card ────────────────────────────────────────────────────────────

function ProviderCard({
  provider,
  coinFilter,
  showAdjacent,
  rates,
  sources,
}: {
  provider: StakingProvider
  coinFilter: StakingCoinId | 'all'
  showAdjacent: boolean
  rates: Partial<Record<string, number>>
  sources: Partial<Record<string, 'live' | 'estimate'>>
}) {
  const [expanded, setExpanded] = useState(false)
  const CategoryIcon = categoryIcon(provider.category)

  const visibleAssets = useMemo(() => {
    const entries = Object.entries(provider.assets) as [StakingCoinId, NonNullable<(typeof provider.assets)[StakingCoinId]>][]
    return entries.filter(([id, asset]) => {
      if (coinFilter !== 'all' && id !== coinFilter) return false
      // Hide governance-token / lending yield unless explicitly shown
      if (!showAdjacent && !YIELD_TYPE_META[resolveYieldType(provider, asset)].stakesQueriedAsset) return false
      return true
    })
  }, [provider, coinFilter, showAdjacent])

  // Resolve each visible row's live/estimate status once, so the card can both
  // render rows and disclose — at the card level — when it has no live feed at all.
  const assetRows = useMemo(
    () =>
      visibleAssets.map(([coinId, asset]) => {
        const { apr, live } = aprDisplay(asset.staticApr, resolveLiveAprKey(provider, coinId, asset), rates, sources)
        return { coinId, asset, apr, live }
      }),
    [visibleAssets, provider, rates, sources],
  )

  // A live, non-defunct provider whose every shown rate is a static estimate
  // gets an explicit card-level disclosure — not just the per-row `est` tag.
  const allEstimated = !provider.defunct && assetRows.length > 0 && assetRows.every(r => !r.live)

  if (visibleAssets.length === 0) return null

  return (
    <div className={clsx(
      'rounded-xl border overflow-hidden',
      provider.defunct
        ? 'border-red-500/30 bg-red-950/20'
        : 'border-border bg-bg-card'
    )}>
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={clsx(
            'size-9 rounded-lg flex items-center justify-center shrink-0 border',
            provider.defunct
              ? 'bg-red-500/10 border-red-500/30'
              : 'bg-bg-elevated border-border'
          )}>
            {provider.defunct
              ? <XCircle size={18} className="text-red-400" />
              : <CategoryIcon size={18} className="text-text-muted" />
            }
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {provider.website && !provider.defunct ? (
                <a
                  href={provider.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-sm text-text-primary hover:text-accent-blue transition-colors flex items-center gap-1 group"
                >
                  {provider.name}
                  <ExternalLink size={11} className="text-text-muted group-hover:text-accent-blue shrink-0" />
                </a>
              ) : (
                <span className={clsx('font-bold text-sm', provider.defunct ? 'text-red-300' : 'text-text-primary')}>
                  {provider.name}
                </span>
              )}
              {provider.defunct && (
                <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-red-500/20 text-red-300 border border-red-500/30">
                  DEFUNCT {provider.defunctDate}
                </span>
              )}
              {!provider.defunct && (
                <span className={clsx('px-1.5 py-0.5 text-[10px] font-medium rounded border', categoryBadgeClass(provider.category))}>
                  {categoryLabel(provider.category)}
                </span>
              )}
              {provider.tvlBillions != null && (
                <span className="text-[10px] text-text-muted">TVL ~${provider.tvlBillions}B</span>
              )}
              {provider.auditCount != null && (
                <span className="text-[10px] text-emerald-400/70 flex items-center gap-1">
                  <CheckCircle size={10} /> {provider.auditCount} audits
                </span>
              )}
            </div>
            <p className={clsx('text-xs mt-1 leading-relaxed', provider.defunct ? 'text-red-300/60' : 'text-text-muted')}>
              {provider.tagline}
            </p>
          </div>

          {/* Direct call-to-action to the provider's actual staking page */}
          {provider.website && !provider.defunct && (
            <a
              href={provider.website}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 self-start flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-accent-blue/40 bg-accent-blue/10 text-accent-blue hover:bg-accent-blue/20 hover:border-accent-blue/60 transition-colors"
              title={`Open ${provider.name}'s staking page`}
            >
              {provider.category === 'cefi' ? 'Stake' : provider.category === 'wallet' ? 'Open wallet' : 'Open app'}
              <ExternalLink size={12} className="shrink-0" />
            </a>
          )}

        </div>
      </div>

      {/* Card-level disclosure: no live rate feed for this provider */}
      {allEstimated && (
        <div className="px-4 pb-3 -mt-1">
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2">
            <AlertTriangle size={12} className="text-amber-400 shrink-0 mt-0.5" />
            <span className="text-[11px] text-amber-300/80 leading-relaxed">
              No live rate feed for {provider.name} — the APY{assetRows.length > 1 ? 's' : ''} below{' '}
              {assetRows.length > 1 ? 'are' : 'is'} a static estimate, not a current reading.{' '}
              {provider.website ? 'Verify the current rate on their site before staking.' : 'Verify the current rate before staking.'}
            </span>
          </div>
        </div>
      )}

      {/* Asset rows */}
      <div className="border-t border-border divide-y divide-border/50">
        {assetRows.map(({ coinId, asset, apr, live }) => {
          const info = STAKING_COIN_INFO[coinId]
          const yieldType = resolveYieldType(provider, asset)
          const yieldMeta = YIELD_TYPE_META[yieldType]

          return (
            <div key={coinId} className="p-3">
              <div className="flex items-center gap-3 flex-wrap">
                {/* Coin */}
                <div className="flex items-center gap-2 w-20 shrink-0">
                  <div className="size-5 rounded-full flex items-center justify-center" style={{ backgroundColor: info.color + '30', border: `1px solid ${info.color}60` }}>
                    <span className="text-[9px] font-bold" style={{ color: info.color }}>{info.symbol[0]}</span>
                  </div>
                  <span className="text-xs font-semibold text-text-primary">{info.symbol}</span>
                </div>

                {/* APY */}
                <div className="flex items-center gap-1 w-28 shrink-0">
                  <TrendingUp size={12} className="text-emerald-400 shrink-0" />
                  <span className={clsx('text-sm font-bold font-mono', provider.defunct ? 'text-red-400 line-through' : 'text-emerald-400')}>
                    {provider.defunct ? `${apr.toFixed(1)}%` : `${apr.toFixed(2)}%`}
                  </span>
                  {live && !provider.defunct && (
                    <span
                      className="ml-1 text-[9px] font-semibold uppercase tracking-wide px-1 py-0.5 rounded border bg-emerald-500/10 text-emerald-400/90 border-emerald-500/25"
                      title="Live rate — fetched from a protocol/network feed"
                    >
                      live
                    </span>
                  )}
                  {!live && !provider.defunct && (
                    <span
                      className="ml-1 text-[9px] font-semibold uppercase tracking-wide px-1 py-0.5 rounded border bg-amber-500/10 text-amber-400/90 border-amber-500/25"
                      title="Static estimate — not a live reading; verify the current rate with the provider"
                    >
                      est
                    </span>
                  )}
                  {provider.defunct && (
                    <span className="text-[9px] text-red-400/60 ml-1">ADVERTISED</span>
                  )}
                </div>

                {/* Lockup */}
                <div className="flex items-center gap-1 w-32 shrink-0">
                  <Lock size={11} className="text-text-muted shrink-0" />
                  <span className="text-xs text-text-secondary">
                    {asset.lockupDays === 0 ? 'No lockup' : `${asset.lockupDays}d unbonding`}
                  </span>
                </div>

                {/* Min stake */}
                <div className="flex items-center gap-1 w-28 shrink-0">
                  <span className="text-xs text-text-muted">Min:</span>
                  <span className="text-xs text-text-secondary font-mono">
                    {asset.minStakeNative === 0 ? 'None' : `${asset.minStakeNative} ${info.symbol}`}
                  </span>
                </div>

                {/* Receipt token */}
                {asset.receiptToken && (
                  <div className="flex items-center gap-1">
                    <Zap size={11} className="text-cyan-400 shrink-0" />
                    <span className="text-xs text-cyan-300 font-mono">{asset.receiptToken}</span>
                    {asset.liquid && <span className="text-[9px] text-cyan-400/60">liquid</span>}
                  </div>
                )}

                {/* Yield type — distinguishes native/liquid/cefi/restaking from
                    governance-token or lending yield that doesn't stake the coin */}
                <span
                  className={clsx('ml-auto px-1.5 py-0.5 text-[10px] font-medium rounded border shrink-0', yieldMeta.badge)}
                  title={yieldMeta.description}
                >
                  {yieldMeta.label}
                  {!yieldMeta.stakesQueriedAsset && <span className="ml-1 opacity-70">· not {info.symbol} staking</span>}
                </span>

              </div>

              {/* Features */}
              <div className="mt-2 flex flex-wrap gap-1">
                {asset.features.map(f => (
                  <span key={f} className={clsx(
                    'text-[10px] px-1.5 py-0.5 rounded border',
                    provider.defunct
                      ? 'bg-red-900/20 text-red-300/50 border-red-500/20'
                      : 'bg-bg-elevated text-text-muted border-border'
                  )}>
                    {f}
                  </span>
                ))}
              </div>

              {asset.lockupNote && (
                <div className="mt-1.5 flex items-start gap-1.5">
                  <Clock size={10} className="text-amber-400 mt-0.5 shrink-0" />
                  <span className="text-[10px] text-amber-300/70">{asset.lockupNote}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Provider description (expanded) */}
      {!provider.defunct && (
        <>
          <button
            onClick={() => setExpanded(v => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 border-t border-border text-xs text-text-muted hover:text-text-secondary hover:bg-bg-elevated transition-colors"
          >
            <span className="flex items-center gap-2">
              <Info size={12} />
              About {provider.name}
            </span>
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {expanded && (
            <div className="border-t border-border bg-bg-elevated/30 p-4 space-y-3">
              <p className="text-xs text-text-muted leading-relaxed">{provider.description}</p>

              {provider.custodyModel === 'custodial' && (
                <div className="flex items-start gap-2 text-xs text-amber-300/70 bg-amber-500/5 border border-amber-500/15 rounded p-2">
                  <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                  <span>Custodial — {provider.name} controls your private keys.</span>
                </div>
              )}
              {provider.custodyModel === 'non-custodial' && (
                <div className="flex items-start gap-2 text-xs text-emerald-300/70 bg-emerald-500/5 border border-emerald-500/15 rounded p-2">
                  <CheckCircle size={12} className="shrink-0 mt-0.5" />
                  <span>Non-custodial — you control your private keys at all times.</span>
                </div>
              )}
              {provider.custodyModel === 'smart-contract' && (
                <div className="flex items-start gap-2 text-xs text-cyan-300/70 bg-cyan-500/5 border border-cyan-500/15 rounded p-2">
                  <Layers size={12} className="shrink-0 mt-0.5" />
                  <span>Smart contract — assets are held by audited on-chain code. You hold the receipt token in your own wallet.</span>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Network APY Reference ────────────────────────────────────────────────────

function NetworkAprReference() {
  return (
    <div className="rounded-xl border border-border bg-bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp size={14} className="text-emerald-400" />
        <span className="text-sm font-semibold text-text-primary">Protocol-Level Base APY</span>
        <span className="text-xs text-text-muted">(what the network pays before provider fees)</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {(Object.entries(STAKING_COIN_INFO) as [StakingCoinId, typeof STAKING_COIN_INFO[StakingCoinId]][]).map(([, info]) => (
          <div key={info.symbol} className="bg-bg-elevated rounded-lg p-2.5 border border-border">
            <div className="flex items-center gap-1.5 mb-1">
              <div className="size-4 rounded-full flex items-center justify-center" style={{ backgroundColor: info.color + '30', border: `1px solid ${info.color}60` }}>
                <span className="text-[8px] font-bold" style={{ color: info.color }}>{info.symbol[0]}</span>
              </div>
              <span className="text-xs font-semibold text-text-primary">{info.symbol}</span>
            </div>
            <p className="text-[10px] text-text-muted leading-relaxed">{info.aprNote}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Asset dropdown ───────────────────────────────────────────────────────────

function AssetDropdown({
  coinFilter, setCoinFilter, coins,
}: {
  coinFilter: StakingCoinId | 'all'
  setCoinFilter: (v: StakingCoinId | 'all') => void
  coins: StakingCoinId[]
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const selected = coinFilter !== 'all' ? STAKING_COIN_INFO[coinFilter] : null

  return (
    <div className="flex items-center gap-3">
      <div className="text-xs text-text-muted font-medium whitespace-nowrap">Filter by Asset</div>
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen(v => !v)}
          className={clsx(
            'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all min-w-[140px]',
            selected
              ? 'text-white'
              : 'border-border text-text-muted hover:text-text-primary hover:border-border-hover'
          )}
          style={selected ? { backgroundColor: selected.color + '30', borderColor: selected.color + '80', color: selected.color } : {}}
        >
          {selected ? (
            <>
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: selected.color }}
              />
              <span className="flex-1 text-left">{selected.symbol} — {selected.name}</span>
            </>
          ) : (
            <span className="flex-1 text-left">All Assets</span>
          )}
          <ChevronDown size={12} className={`flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div className="absolute left-0 top-full mt-1 z-20 bg-bg-card border border-border rounded-lg shadow-lg overflow-hidden w-56">
            <button
              onClick={() => { setCoinFilter('all'); setOpen(false) }}
              className={clsx(
                'w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors',
                coinFilter === 'all'
                  ? 'bg-accent-blue/15 text-accent-blue font-medium'
                  : 'text-text-secondary hover:bg-bg-elevated'
              )}
            >
              <span className="w-2 h-2 rounded-full bg-text-muted flex-shrink-0" />
              <span>All Assets</span>
              {coinFilter === 'all' && <span className="ml-auto text-[10px]">✓</span>}
            </button>
            <div className="border-t border-border/50 my-0.5" />
            {coins.map(coin => {
              const info = STAKING_COIN_INFO[coin]
              return (
                <button
                  key={coin}
                  onClick={() => { setCoinFilter(coin); setOpen(false) }}
                  className={clsx(
                    'w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors',
                    coinFilter === coin
                      ? 'font-medium'
                      : 'text-text-secondary hover:bg-bg-elevated'
                  )}
                  style={coinFilter === coin ? { backgroundColor: info.color + '18', color: info.color } : {}}
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: info.color }} />
                  <span className="font-mono font-semibold w-10">{info.symbol}</span>
                  <span className="text-text-muted truncate">{info.name}</span>
                  {coinFilter === coin && <span className="ml-auto text-[10px]">✓</span>}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type CategoryFilter = 'all' | ProviderCategory

type StakingTab = 'providers' | 'pools'

function StakingPageInner() {
  // W3-3, option B (2026-08-20): Staking Discovery merged into this page. Its
  // curated directory duplicated the provider cards below almost exactly; the
  // live on-chain pool discovery — the one thing it had that this page did not
  // — is now the Live Pools tab. /staking-discovery redirects to ?tab=pools so
  // old links land on the surviving surface, not a 404.
  const params = useSearchParams()
  const [tab, setTab] = useState<StakingTab>(params.get('tab') === 'pools' ? 'pools' : 'providers')
  const [coinFilter, setCoinFilter] = useState<StakingCoinId | 'all'>('all')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  // Off by default: "ETH staking" should mean ETH staking, not governance/lending.
  const [showAdjacent, setShowAdjacent] = useState(false)
  // Celsius — the educational cautionary example — previously lived only on the
  // Discovery directory's toggle; the merge carries it here so it stays reachable.
  const [showDefunct, setShowDefunct] = useState(false)

  const { data: ratesData } = useQuery<StakingRatesResponse>({
    queryKey: ['staking-rates'],
    queryFn: () => fetch('/live-data/staking-rates').then(r => r.json()),
    staleTime: 1000 * 60 * 10,
    refetchInterval: 1000 * 60 * 20,
  })

  const rates = ratesData?.rates ?? {}
  const sources = ratesData?.sources ?? {}
  const updatedAt = ratesData?.updatedAt

  const liveCount = Object.values(sources).filter(s => s === 'live').length

  const filteredProviders = useMemo(() => {
    return STAKING_PROVIDERS.filter(p => {
      if (p.defunct && !showDefunct) return false
      if (categoryFilter !== 'all' && p.category !== categoryFilter) return false
      // Provider must have at least one asset that survives the coin + adjacency filters
      const entries = Object.entries(p.assets) as [StakingCoinId, NonNullable<(typeof p.assets)[StakingCoinId]>][]
      const hasVisible = entries.some(([id, asset]) => {
        if (coinFilter !== 'all' && id !== coinFilter) return false
        if (!showAdjacent && !YIELD_TYPE_META[resolveYieldType(p, asset)].stakesQueriedAsset) return false
        return true
      })
      return hasVisible
    })
  }, [categoryFilter, coinFilter, showAdjacent, showDefunct])

  const COINS = Object.keys(STAKING_COIN_INFO) as StakingCoinId[]
  const CATEGORIES: { value: CategoryFilter; label: string }[] = [
    { value: 'all',    label: 'All Providers' },
    { value: 'cefi',   label: 'Exchange / CeFi' },
    { value: 'wallet', label: 'Self-Custody Wallet' },
    { value: 'liquid', label: 'Liquid Staking' },
  ]

  return (
    <div className="space-y-5 p-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <PageHeader
            title="Staking Opportunities"
            subtitle="Compare APY, lock-up periods, and custody risk across exchanges, wallets, and liquid staking protocols"
            description={`Staking Opportunities compares ${STAKING_PROVIDERS.filter(p => !p.defunct).length} active providers across three categories: CeFi exchanges (highest counterparty risk), self-custody wallets, and liquid staking protocols (lowest custody risk).`}
            details={[
              // D-10 fix: this header used to describe six-dimension risk
              // scores and a 0–100 composite that never render on this page
              // (they appear on Staking Discovery and /api/v1), and claimed
              // Celsius "is included" while this page unconditionally filters
              // defunct providers. Rendering the scores here is tool candidate
              // NT7 — an open decision, so the copy now matches the page.
              { label: 'Risk profiles', text: 'Each provider carries a curated six-dimension risk profile (custody, counterparty, contract, slashing, liquidity, regulatory). The composite renders on the public API only — the per-pool badge was removed from the app on 2026-08-18 (item 4).' },
              { label: 'Live APY', text: 'Liquid-staking & restaking protocols pull live APY from DeFiLlama plus each protocol’s own API (Lido, Rocket Pool, Marinade, Jito, Stride). Self-custody wallets show the live on-chain network rate for native delegation. CeFi exchange rates are static estimates and may differ from current offerings.' },
              { label: 'Defunct providers', text: 'Failed providers are excluded here. Celsius — the educational cautionary example — is behind the "Show defunct platforms" toggle below.' },
            ]}
          />
        </div>
        <div className="text-right text-xs text-text-muted">
          {liveCount > 0 && (
            <div className="text-emerald-400/70">{liveCount} live rate{liveCount > 1 ? 's' : ''}</div>
          )}
          {updatedAt && (
            <div>Updated {new Date(updatedAt).toLocaleTimeString()}</div>
          )}
        </div>
      </div>

      {/* Data provenance — reads the same registry that powers /data-sources */}
      <SourceLine id="staking-rates" asOf={updatedAt} />
      {/* Provenance / freshness notice for the curated provider catalog. The
          SourceLine above covers the live APR feeds; this covers the risk
          profiles, terms, and reference APRs underneath them, which are
          hand-maintained and were previously shown with no indication of age
          (audit finding M5). Same shape as the transfer-fees notice. */}
      {(() => {
        const prov = getStakingDataProvenance()
        return (
          <ProvenanceNotice
            label="Provider risk profiles & terms"
            staleLabel="Provider risk data may be out of date"
            confidence={prov.confidence}
            stale={prov.stale}
          >
            — {prov.source.toLowerCase()}, compiled{' '}
            {new Date(STAKING_DATA_LAST_VERIFIED).toLocaleDateString()} ({prov.ageDays} days ago)
            {prov.stale && `, past the ${STAKING_DATA_STALE_AFTER_DAYS}-day review window`}.
            {liveCount > 0
              ? ` ${liveCount} APR${liveCount > 1 ? 's are' : ' is'} live; every other rate, lock-up, minimum, and risk score is a curated estimate — confirm current terms with the provider.`
              : ' All rates, lock-ups, minimums, and risk scores below are curated estimates — confirm current terms with the provider.'}
          </ProvenanceNotice>
        )
      })()}

      {/* Tab switcher (W3-3): curated directory vs live on-chain pools */}
      <div className="flex gap-1 bg-bg-elevated p-1 rounded-lg w-fit">
        {([['providers', 'Providers'], ['pools', 'Live Pools']] as [StakingTab, string][]).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx('px-4 py-1.5 rounded-md text-sm font-medium transition-colors',
              tab === t ? 'bg-bg-card text-text-primary shadow-sm' : 'text-text-muted hover:text-text-secondary')}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'pools' && <LivePoolsPanel />}

      {tab === 'providers' && (<>
      {/* Network base APY reference */}
      <NetworkAprReference />

      {/* Filters */}
      <div className="space-y-3">
        {/* Coin filter — dropdown */}
        <AssetDropdown coinFilter={coinFilter} setCoinFilter={setCoinFilter} coins={COINS} />

        {/* Category filter + defunct toggle */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1">
            {CATEGORIES.map(cat => (
              <button
                key={cat.value}
                onClick={() => setCategoryFilter(cat.value)}
                className={clsx(
                  'px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                  categoryFilter === cat.value
                    ? 'bg-accent-blue/20 text-accent-blue border-accent-blue/40'
                    : 'border-border text-text-muted hover:text-text-primary'
                )}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Adjacent-yield toggle */}
          <button
            onClick={() => setShowAdjacent(v => !v)}
            title="Governance-token staking (e.g. Aave, Convex) and lending yield (e.g. Nexo) earn on a different token or by lending — they don't stake the selected coin. Hidden by default."
            className={clsx(
              'ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
              showAdjacent
                ? 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/40'
                : 'border-border text-text-muted hover:text-text-primary'
            )}
          >
            <Info size={12} />
            {showAdjacent ? 'Hiding nothing — showing adjacent yield' : 'Show adjacent yield (governance / lending)'}
          </button>

          <button
            onClick={() => setShowDefunct(v => !v)}
            title="Failed platforms kept as cautionary examples — Celsius is the canonical one"
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
              showDefunct
                ? 'bg-red-500/15 text-red-300 border-red-500/40'
                : 'border-border text-text-muted hover:text-text-primary'
            )}
          >
            <XCircle size={12} />
            {showDefunct ? 'Hide' : 'Show'} defunct platforms
          </button>

        </div>
      </div>

      {/* Provider count */}
      <div className="text-xs text-text-muted">
        Showing {filteredProviders.length} provider{filteredProviders.length !== 1 ? 's' : ''}
        {coinFilter !== 'all' && ` supporting ${STAKING_COIN_INFO[coinFilter].symbol}`}
        {categoryFilter !== 'all' && ` in ${CATEGORIES.find(c => c.value === categoryFilter)?.label}`}
      </div>

      {/* Provider cards */}
      <div className="space-y-3">
        {filteredProviders.map(provider => (
          <ProviderCard
            key={provider.id}
            provider={provider}
            coinFilter={coinFilter}
            showAdjacent={showAdjacent}
            rates={rates}
            sources={sources}
          />
        ))}
      </div>

      {/* Footer note */}
      <div className="rounded-lg border border-border bg-bg-elevated p-3 text-xs text-text-muted leading-relaxed">
        <span className="font-semibold text-text-secondary">Disclaimer: </span>
        APY figures are indicative and fluctuate based on network conditions, total validators, and protocol fees.
        Exchange (CeFi) staking rates are static estimates — check each platform directly for current rates.
        Liquid-staking / restaking APRs are fetched live from DeFiLlama and public protocol APIs; self-custody
        wallet rows show the live network base rate for native delegation (gross of validator commission).
        Risk scores are editorial assessments and do not constitute financial advice. Always do your own research before staking.
      </div>
      </>)}
    </div>
  )
}

// Entitlement gate. Wrapping here rather than inside StakingPageInner's JSX is
// deliberate: a disabled module must not mount the component at all, so its
// queries and stores never run for a user who cannot see the results.
export default function StakingPage() {
  return (
    <ModuleGate module="crypto">
      <Suspense>
        <StakingPageInner />
      </Suspense>
    </ModuleGate>
  )
}
