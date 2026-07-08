import { NextRequest, NextResponse } from 'next/server'
import {
  RISK_PRESETS, adjustRiskFromSignals, DEFILLAMA_SLUG_BLOCKLIST,
  ALL_STAKING_SYMBOLS, COIN_SYMBOL_MAP, MATURE_CHAINS,
} from '@/lib/data/stakingDiscovery'
import { computeOverallRisk, getRiskLevel } from '@/lib/data/stakingProviders'
import type { ProviderCategory, RiskProfile } from '@/lib/data/stakingProviders'

export const dynamic = 'force-dynamic'

// ─── Shared output type ───────────────────────────────────────────────────────

export type DiscoverySource = 'defillama' | 'yearn' | 'pendle' | 'beefy'

export interface DiscoveredPool {
  poolId:          string
  project:         string      // Canonical protocol name (used for grouping)
  projectSlug:     string
  opportunityName: string      // Human-readable name for this specific opportunity
  symbol:          string
  chain:           string
  coinId:          string
  tvlUsd:          number
  apy:             number
  apyBase:         number | null
  apyReward:       number | null
  auditCount:      number
  url:             string | null
  projectUrl:      string | null  // Protocol homepage (distinct from opportunity URL)
  category:        ProviderCategory
  custodyModel:    'custodial' | 'non-custodial' | 'smart-contract'
  risks:           RiskProfile
  riskScore:       number
  riskLevel:       ReturnType<typeof getRiskLevel>
  hasReceiptToken: boolean
  chainMature:     boolean
  source:          DiscoverySource
}

export interface StakingDiscoveryResponse {
  ok:        boolean
  pools:     DiscoveredPool[]
  total:     number
  sources:   Record<DiscoverySource, number>
  updatedAt: string
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function symbolToCoinId(symbol: string): string | null {
  const base = symbol.split('-')[0].split('/')[0].toUpperCase()
  for (const [coinId, symbols] of Object.entries(COIN_SYMBOL_MAP)) {
    if (symbols.some(s => base.startsWith(s))) return coinId
  }
  return null
}

function hasReceiptToken(symbol: string): boolean {
  return /^(st|r[A-Z]|j[A-Z]|m[A-Z]|b[A-Z]|an[A-Z]|s[A-Z]{2})/.test(symbol) && symbol.length > 3
}

function buildPool(
  partial: {
    poolId: string; project: string; opportunityName: string; symbol: string; chain: string;
    coinId: string; tvlUsd: number; apy: number; apyBase?: number | null;
    apyReward?: number | null; auditCount?: number; url?: string | null;
    projectUrl?: string | null; category: ProviderCategory; source: DiscoverySource;
  },
  maxRisk: number
): DiscoveredPool | null {
  const chainMature  = MATURE_CHAINS.has(partial.chain)
  const receipt      = hasReceiptToken(partial.symbol)
  const auditCount   = partial.auditCount ?? 0
  const custodyModel = partial.category === 'cefi' ? 'custodial' : partial.category === 'wallet' ? 'non-custodial' : 'smart-contract'
  const risks = adjustRiskFromSignals(RISK_PRESETS[partial.category], {
    tvlUsd: partial.tvlUsd, auditCount,
    isSmartContract: partial.category === 'liquid', chainMature, hasReceiptToken: receipt,
  })
  const riskScore = computeOverallRisk(risks)
  if (riskScore > maxRisk) return null
  return {
    poolId:          partial.poolId,
    project:         partial.project,
    projectSlug:     partial.project.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    opportunityName: partial.opportunityName,
    symbol:          partial.symbol,
    chain:           partial.chain,
    coinId:          partial.coinId,
    tvlUsd:          partial.tvlUsd,
    apy:             parseFloat(partial.apy.toFixed(2)),
    apyBase:         partial.apyBase != null ? parseFloat(partial.apyBase.toFixed(2)) : null,
    apyReward:       partial.apyReward != null ? parseFloat(partial.apyReward.toFixed(2)) : null,
    auditCount,
    url:             partial.url ?? null,
    projectUrl:      partial.projectUrl ?? partial.url ?? null,
    category:        partial.category,
    custodyModel,
    risks,
    riskScore:       parseFloat(riskScore.toFixed(1)),
    riskLevel:       getRiskLevel(riskScore),
    hasReceiptToken: receipt,
    chainMature,
    source:          partial.source,
  }
}

// ─── DefiLlama ────────────────────────────────────────────────────────────────

interface DLPool {
  pool: string; project: string; symbol: string; chain: string;
  tvlUsd: number; apy: number; apyBase: number | null; apyReward: number | null;
  stablecoin: boolean; ilRisk: string | null; audits: string | null;
  category: string | null; url: string | null;
}

async function fetchDefiLlama(minTvl: number, minApy: number, maxRisk: number, coinFilter: string | null): Promise<DiscoveredPool[]> {
  const res = await fetch('https://yields.llama.fi/pools', {
    headers: { Accept: 'application/json' },
    next: { revalidate: 1800 },
  })
  if (!res.ok) return []
  const json = await res.json() as { data?: DLPool[] }
  const raw  = json.data ?? []
  const pools: DiscoveredPool[] = []

  for (const p of raw) {
    const baseSymbol = p.symbol.split('-')[0].split('/')[0].toUpperCase()
    if (!ALL_STAKING_SYMBOLS.has(baseSymbol)) continue
    if (DEFILLAMA_SLUG_BLOCKLIST.has(p.project.toLowerCase())) continue
    if (p.stablecoin || p.ilRisk === 'yes') continue
    if (p.tvlUsd < minTvl || (p.apy ?? 0) < minApy) continue
    const coinId = symbolToCoinId(baseSymbol)
    if (!coinId || (coinFilter && coinId !== coinFilter)) continue
    const category: ProviderCategory =
      (p.category ?? '').toLowerCase().includes('cefi') ? 'cefi' : 'liquid'
    const auditCount = p.audits ? (parseInt(p.audits, 10) || 0) : 0
    const pool = buildPool({
      poolId: p.pool, project: p.project,
      opportunityName: `${baseSymbol} on ${p.chain}`,
      symbol: p.symbol, chain: p.chain,
      coinId, tvlUsd: p.tvlUsd, apy: p.apy ?? 0,
      apyBase: p.apyBase, apyReward: p.apyReward,
      auditCount, url: p.url, projectUrl: p.url,
      category, source: 'defillama',
    }, maxRisk)
    if (pool) pools.push(pool)
  }
  return pools
}

// ─── Yearn Finance ────────────────────────────────────────────────────────────
// Endpoint: https://api.yearn.finance/v1/chains/1/vaults/all
// Returns ETH-chain vaults with net APY and TVL.

interface YearnVault {
  address:  string
  name:     string
  symbol:   string
  endorsed: boolean
  type:     string
  token:    { symbol: string; address: string }
  tvl:      { tvl: number } | null
  apy:      { net_apy: number; gross_apr: number } | null
  metadata: { displayName?: string } | null
}

async function fetchYearn(minTvl: number, minApy: number, maxRisk: number, coinFilter: string | null): Promise<DiscoveredPool[]> {
  const res = await fetch('https://api.yearn.finance/v1/chains/1/vaults/all', {
    headers: { Accept: 'application/json' },
    next: { revalidate: 1800 },
  })
  if (!res.ok) return []
  const vaults = await res.json() as YearnVault[]
  const pools: DiscoveredPool[] = []

  for (const v of vaults) {
    if (!v.endorsed) continue
    const tvl = v.tvl?.tvl ?? 0
    if (tvl < minTvl) continue
    const netApy = (v.apy?.net_apy ?? 0) * 100
    if (netApy < minApy) continue

    const coinId = symbolToCoinId(v.token.symbol)
    if (!coinId || (coinFilter && coinId !== coinFilter)) continue

    const vaultName = v.metadata?.displayName ?? v.name ?? v.token.symbol
    const pool = buildPool({
      poolId:          `yearn-${v.address}`,
      project:         'Yearn Finance',
      opportunityName: vaultName,
      symbol:          v.token.symbol,
      chain:           'Ethereum',
      coinId, tvlUsd: tvl, apy: netApy,
      apyBase: (v.apy?.gross_apr ?? 0) * 100, apyReward: null,
      auditCount: 3,
      url:        `https://yearn.finance/vaults/1/${v.address}`,
      projectUrl: 'https://yearn.finance',
      category: 'liquid', source: 'yearn',
    }, maxRisk)
    if (pool) pools.push(pool)
  }
  return pools
}

// ─── Pendle Finance ───────────────────────────────────────────────────────────
// Endpoint: https://api-v2.pendle.finance/core/v1/sdk/1/markets
// Yield tokenization markets — PT/YT on staked assets like wstETH, rETH, etc.

interface PendleMarket {
  address:         string
  name:            string
  totalLiquidity:  number
  impliedApy:      number
  underlyingAsset: { symbol: string; address: string } | null
  pt:              { symbol: string } | null
  yt:              { symbol: string; impliedApy?: number } | null
  isWhitelisted:   boolean
  expiry:          string | null
}

interface PendleResponse {
  results: PendleMarket[]
  total:   number
}

async function fetchPendle(minTvl: number, minApy: number, maxRisk: number, coinFilter: string | null): Promise<DiscoveredPool[]> {
  const res = await fetch('https://api-v2.pendle.finance/core/v1/sdk/1/markets?limit=100&order_by=liquidity:desc', {
    headers: { Accept: 'application/json' },
    next: { revalidate: 1800 },
  })
  if (!res.ok) return []
  const json = await res.json() as PendleResponse
  const markets = json.results ?? []
  const pools: DiscoveredPool[] = []

  for (const m of markets) {
    if (!m.isWhitelisted) continue
    if ((m.totalLiquidity ?? 0) < minTvl) continue

    // Use implied APY (annualized yield) expressed as percentage
    const apy = (m.impliedApy ?? 0) * 100
    if (apy < minApy) continue

    // Underlying asset tells us what's being staked
    const underlying = m.underlyingAsset?.symbol ?? m.pt?.symbol ?? ''
    const coinId = symbolToCoinId(underlying)
    if (!coinId || (coinFilter && coinId !== coinFilter)) continue

    // Skip expired markets
    if (m.expiry && new Date(m.expiry) < new Date()) continue

    const pool = buildPool({
      poolId:          `pendle-${m.address}`,
      project:         'Pendle Finance',
      opportunityName: m.name,
      symbol:          underlying,
      chain:           'Ethereum',
      coinId, tvlUsd: m.totalLiquidity, apy,
      apyBase: apy, apyReward: null,
      auditCount: 2,
      url:        `https://app.pendle.finance/trade/markets/${m.address}`,
      projectUrl: 'https://app.pendle.finance',
      category: 'liquid', source: 'pendle',
    }, maxRisk)
    if (pool) pools.push(pool)
  }
  return pools
}

// ─── Beefy Finance ────────────────────────────────────────────────────────────
// Endpoint: https://api.beefy.finance/vaults + https://api.beefy.finance/apy/breakdown
// Multichain yield optimizer — covers SOL, AVAX, BNB, MATIC chains.

interface BeefyVault {
  id:         string
  name:       string
  token:      string
  chain:      string
  status:     string
  assets:     string[]
  tvl?:       number
  platformId: string
}

interface BeefyApy {
  [vaultId: string]: {
    totalApy?:  number
    vaultApr?:  number
    tradingApr?: number
  } | number
}

const BEEFY_CHAIN_MAP: Record<string, string> = {
  bsc: 'BSC', avax: 'Avalanche', polygon: 'Polygon', arbitrum: 'Arbitrum',
  optimism: 'Optimism', base: 'Base', cronos: 'Cronos', fantom: 'Fantom',
  solana: 'Solana', moonbeam: 'Moonbeam', celo: 'Celo', ethereum: 'Ethereum',
}

async function fetchBeefy(minTvl: number, minApy: number, maxRisk: number, coinFilter: string | null): Promise<DiscoveredPool[]> {
  const [vaultRes, tvlRes, apyRes] = await Promise.allSettled([
    fetch('https://api.beefy.finance/vaults',         { next: { revalidate: 1800 } }),
    fetch('https://api.beefy.finance/tvl',            { next: { revalidate: 1800 } }),
    fetch('https://api.beefy.finance/apy/breakdown',  { next: { revalidate: 1800 } }),
  ])

  if (vaultRes.status !== 'fulfilled' || !vaultRes.value.ok) return []
  const vaults: BeefyVault[] = await vaultRes.value.json()

  // TVL: { [chainId]: { [vaultId]: number } }
  let tvlMap: Record<string, number> = {}
  if (tvlRes.status === 'fulfilled' && tvlRes.value.ok) {
    const tvlData: Record<string, Record<string, number>> = await tvlRes.value.json()
    for (const chainTvls of Object.values(tvlData)) {
      Object.assign(tvlMap, chainTvls)
    }
  }

  // APY breakdown
  let apyData: BeefyApy = {}
  if (apyRes.status === 'fulfilled' && apyRes.value.ok) {
    apyData = await apyRes.value.json()
  }

  const pools: DiscoveredPool[] = []

  for (const v of vaults) {
    if (v.status !== 'active') continue
    // Only include single-asset vaults (staking, not LP)
    if (!v.assets || v.assets.length !== 1) continue

    const coinId = symbolToCoinId(v.assets[0])
    if (!coinId || (coinFilter && coinId !== coinFilter)) continue

    const tvl = tvlMap[v.id] ?? 0
    if (tvl < minTvl) continue

    const apyEntry = apyData[v.id]
    let apy = 0
    if (typeof apyEntry === 'number') {
      apy = apyEntry * 100
    } else if (apyEntry && typeof apyEntry === 'object') {
      apy = ((apyEntry.totalApy ?? apyEntry.vaultApr ?? 0)) * 100
    }
    if (apy < minApy || apy > 300) continue  // filter out obviously broken APY values

    const chainName = BEEFY_CHAIN_MAP[v.chain] ?? v.chain
    const pool = buildPool({
      poolId:          `beefy-${v.id}`,
      project:         'Beefy Finance',
      opportunityName: v.name,
      symbol:          v.assets[0].toUpperCase(),
      chain:           chainName,
      coinId, tvlUsd: tvl, apy,
      apyBase: apy, apyReward: null,
      auditCount: 1,
      url:        `https://app.beefy.finance/vault/${v.id}`,
      projectUrl: 'https://app.beefy.finance',
      category: 'liquid', source: 'beefy',
    }, maxRisk)
    if (pool) pools.push(pool)
  }
  return pools
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const coinFilter   = req.nextUrl.searchParams.get('coin')?.toLowerCase() ?? null
  const maxRisk      = parseFloat(req.nextUrl.searchParams.get('max_risk') ?? '10')
  const minTvl       = parseFloat(req.nextUrl.searchParams.get('min_tvl') ?? '1000000')
  const minApy       = parseFloat(req.nextUrl.searchParams.get('min_apy') ?? '0.1')
  const sourceFilter = req.nextUrl.searchParams.get('source') ?? 'all'

  const [dlResult, yearnResult, pendleResult, beefyResult] = await Promise.allSettled([
    fetchDefiLlama(minTvl, minApy, maxRisk, coinFilter),
    fetchYearn(minTvl, minApy, maxRisk, coinFilter),
    fetchPendle(minTvl, minApy, maxRisk, coinFilter),
    fetchBeefy(minTvl, minApy, maxRisk, coinFilter),
  ])

  const dlPools     = dlResult.status     === 'fulfilled' ? dlResult.value     : []
  const yearnPools  = yearnResult.status  === 'fulfilled' ? yearnResult.value  : []
  const pendlePools = pendleResult.status === 'fulfilled' ? pendleResult.value : []
  const beefyPools  = beefyResult.status  === 'fulfilled' ? beefyResult.value  : []

  let all: DiscoveredPool[] = [
    ...dlPools,
    ...yearnPools,
    ...pendlePools,
    ...beefyPools,
  ]

  // Source filter
  if (sourceFilter !== 'all') {
    all = all.filter(p => p.source === sourceFilter)
  }

  // Deduplicate by poolId (safety net)
  const seen = new Set<string>()
  const pools = all.filter(p => {
    if (seen.has(p.poolId)) return false
    seen.add(p.poolId)
    return true
  })

  // Sort by TVL descending
  pools.sort((a, b) => b.tvlUsd - a.tvlUsd)

  const sources: Record<DiscoverySource, number> = {
    defillama: dlPools.length,
    yearn:     yearnPools.length,
    pendle:    pendlePools.length,
    beefy:     beefyPools.length,
  }

  return NextResponse.json({
    ok: true,
    pools,
    total: pools.length,
    sources,
    updatedAt: new Date().toISOString(),
  } satisfies StakingDiscoveryResponse)
}
