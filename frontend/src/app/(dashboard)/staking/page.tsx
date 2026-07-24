'use client'

import React, { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle, TrendingUp, Clock, Lock, ExternalLink,
  ChevronDown, ChevronUp, Info, CheckCircle, XCircle, Zap,
  Building2, Wallet, Layers,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { SourceLine } from '@/components/ui/SourceLine'
import { clsx } from 'clsx'
import {
  STAKING_PROVIDERS, STAKING_COIN_INFO, DEFAULT_LIVE_APR_KEY,
  resolveYieldType, YIELD_TYPE_META,
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

function aprDisplay(
  staticApr: number,
  liveKey: string | undefined,
  rates: Partial<Record<string, number>>,
  sources: Partial<Record<string, 'live' | 'estimate'>>,
) {
  // Only providers with their OWN live-rate key show a live number/badge.
  // The old coin-level default-key fallback displayed a different provider's
  // rate (e.g. Lido's stETH APR on a CeFi card) as if it were this provider's.
  if (!liveKey) return { apr: staticApr, live: false }
  const live = rates[liveKey]
  if (live != null) return { apr: live, live: sources[liveKey] === 'live' }
  return { apr: staticApr, live: false }
}

/**
 * Resolve which live-rate key an asset row should read.
 *   1. An explicit asset.liveAprKey always wins.
 *   2. Self-custody wallets do NATIVE delegation, so the live network base rate
 *      (DEFAULT_LIVE_APR_KEY) is an honest reading of what the position earns
 *      (minus a small validator commission). Scoped to non-ETH coins: wallet ETH
 *      staking routes through assorted providers, so we don't show one LST's rate
 *      for it. CeFi/liquid are deliberately excluded — their rates aren't the raw
 *      network rate, so they must opt in with an explicit key.
 */
function resolveLiveAprKey(provider: StakingProvider, coinId: StakingCoinId, asset: StakingProvider['assets'][StakingCoinId]): string | undefined {
  if (asset?.liveAprKey) return asset.liveAprKey
  if (provider.category === 'wallet' && coinId !== 'eth') return DEFAULT_LIVE_APR_KEY[coinId]
  return undefined
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

      {/* Asset rows */}
      <div className="border-t border-border divide-y divide-border/50">
        {visibleAssets.map(([coinId, asset]) => {
          const info = STAKING_COIN_INFO[coinId]
          const { apr, live } = aprDisplay(asset.staticApr, resolveLiveAprKey(provider, coinId, asset), rates, sources)
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
                    <span className="text-[9px] text-emerald-500/70 ml-0.5">LIVE</span>
                  )}
                  {!live && !provider.defunct && (
                    <span className="text-[9px] text-amber-400/70 ml-0.5" title="Static estimate — not a live reading; verify with the provider">est</span>
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

export default function StakingPage() {
  const [coinFilter, setCoinFilter] = useState<StakingCoinId | 'all'>('all')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  // Off by default: "ETH staking" should mean ETH staking, not governance/lending.
  const [showAdjacent, setShowAdjacent] = useState(false)

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
      if (p.defunct) return false
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
  }, [categoryFilter, coinFilter, showAdjacent])

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
            description={`Staking Opportunities evaluates ${STAKING_PROVIDERS.length} providers across three categories: CeFi exchanges (highest counterparty risk), self-custody wallets, and liquid staking protocols (lowest custody risk). Each provider is scored on six risk dimensions.`}
            details={[
              { label: 'Risk dimensions', text: 'Custody · Counterparty · Smart contract · Slashing · Liquidity · Regulatory — each scored 1–10. Composite score is weighted with counterparty at 25%.' },
              { label: 'Live APY', text: 'Liquid-staking & restaking protocols pull live APY from DeFiLlama plus each protocol’s own API (Lido, Rocket Pool, Marinade, Jito, Stride). Self-custody wallets show the live on-chain network rate for native delegation. CeFi exchange rates are static estimates and may differ from current offerings.' },
              { label: 'Celsius warning', text: 'Celsius is included as an educational cautionary example — it is marked defunct and should not be used.' },
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
    </div>
  )
}
