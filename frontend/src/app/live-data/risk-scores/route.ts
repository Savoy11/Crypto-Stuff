import { NextResponse } from 'next/server'
import { COINGECKO_IDS } from '@/lib/api/live/coingeckoIds'
import { ASSET_LIST } from '@/lib/data/assetList'
import { recordProviderFetch } from '@/lib/api/live/providers'
import {
  ATTESTATION_META, COMPOSITION_MAP, META_AS_OF, MONITORED_STABLECOINS, STRUCTURE_META,
} from '@/lib/data/stablecoinMeta'
import { composeRisk } from '@/lib/risk/engine'
import {
  CRYPTO_ASSET_RISK_PROFILE, scoreLiquidity, scoreScale, scoreTrend, scoreVolatility,
} from '@/lib/risk/profiles/cryptoAsset'
import {
  applyFatalFlaws, scoreAdoption, scoreNewsSentiment, scorePeg, scoreReserve, scoreStructure,
  STABLECOIN_FATAL_FLAWS, STABLECOIN_RISK_PROFILE, type OverriddenRisk,
} from '@/lib/risk/profiles/stablecoin'
import type { DimensionScore } from '@/lib/risk/types'
import type { LiveNewsArticle } from '@/app/live-data/news/route'

// Composite risk scores, computed live from free sources — no backend needed.
//   GET /live-data/risk-scores
//
// Stablecoins (5 pillars): Reserve (DefiLlama + curated attestations), Peg
// (spot + 7d sparkline), Structure (mechanism/regulation/incidents), Adoption
// (supply + chains), News (Finance Now Free news pipeline sentiment). A fatal-flaw
// override slashes the composite multiplicatively when a structural pillar is
// critical — a dead reserve can't be averaged away by good sentiment.
//
// Major assets (5 pillars): Volatility (7d hourly sparkline, annualized),
// Liquidity (volume/mcap), Scale, 30d Trend, News. Decentralization metrics
// need paid indexers, so that pillar is absent, not approximated.
//
// Data honesty: every pillar carries its own confidence and evidence; missing
// data lowers coverage/confidence, never fabricates a score.

export const dynamic = 'force-dynamic'

export interface ScoredAsset {
  assetId: string
  symbol: string
  name: string
  price: number | null
  marketCap: number | null
  change24h: number | null
  risk: OverriddenRisk
}

export interface RiskScoresResponse {
  ok: boolean
  updatedAt: string
  metaAsOf: string
  /** Age of the curated metadata snapshot in days. */
  metaAgeDays: number
  /**
   * True when that snapshot is old enough to be dragging reserve scores down
   * on its own. The attestation-age penalty is real and correctly applied —
   * we genuinely hold no newer attestation — but the cause is our refresh
   * cadence, not necessarily the issuer's, and the UI must say so rather than
   * implying an issuer stopped attesting.
   */
  metaStale: boolean
  profileVersions: { stablecoin: string; cryptoAsset: string }
  sources: { defillama: boolean; coingecko: boolean; news: boolean }
  stablecoins: ScoredAsset[]
  majors: ScoredAsset[]
  error?: string
}

const STABLE_IDS = MONITORED_STABLECOINS.map((s) => s.toLowerCase())

// Every tracked non-pegged asset with a verified CoinGecko id gets the
// major-asset profile — one batched markets call covers them all, so asset
// detail pages across the platform share this scoring surface.
const MAJOR_IDS = ASSET_LIST
  .filter((a) => a.category !== 'stablecoin' && COINGECKO_IDS[a.id])
  .map((a) => a.id)

// Peg mechanism fallback when DefiLlama is unreachable (its pegMechanism field
// is the live source; this mirrors current public issuer designs).
const MECHANISM_FALLBACK: Record<string, string> = {
  USDC: 'fiat-backed', USDT: 'fiat-backed', TUSD: 'fiat-backed', PYUSD: 'fiat-backed',
  USDP: 'fiat-backed', GUSD: 'fiat-backed', DAI: 'crypto-backed', FRAX: 'crypto-backed', LUSD: 'crypto-backed',
}

const CG_BASE = process.env.COINGECKO_BASE_URL?.replace(/\/$/, '') || 'https://api.coingecko.com/api/v3'
const CG_KEY = process.env.COINGECKO_API_KEY && process.env.COINGECKO_API_KEY !== 'your-coingecko-api-key'
  ? process.env.COINGECKO_API_KEY : undefined

interface CgMarketRow {
  id: string
  name: string
  current_price: number | null
  market_cap: number | null
  total_volume: number | null
  price_change_percentage_24h: number | null
  price_change_percentage_30d_in_currency?: number | null
  sparkline_in_7d?: { price?: number[] }
}

/** One batched markets call for every scored asset — rate-limit friendly. */
async function fetchCgMarkets(): Promise<Map<string, CgMarketRow>> {
  const cgIds = [...STABLE_IDS, ...MAJOR_IDS].map((id) => COINGECKO_IDS[id]).filter(Boolean)
  const params = new URLSearchParams({
    vs_currency: 'usd', ids: cgIds.join(','), per_page: '250', page: '1',
    sparkline: 'true', price_change_percentage: '24h,30d',
  })
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (CG_KEY) headers['x-cg-demo-api-key'] = CG_KEY
  const res = await fetch(`${CG_BASE}/coins/markets?${params}`, { headers, next: { revalidate: 900 } })
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`)
  const rows = await res.json() as CgMarketRow[]
  const byCgId = new Map(rows.map((r) => [r.id, r]))
  recordProviderFetch('coingecko', { count: rows.length })
  return byCgId
}

interface LlamaCoin {
  symbol: string
  name: string
  pegType?: string
  pegMechanism?: string
  circulating?: { peggedUSD?: number }
  price?: number
  chains?: string[]
}

async function fetchLlamaStables(): Promise<Map<string, LlamaCoin>> {
  const res = await fetch('https://stablecoins.llama.fi/stablecoins?includePrices=true', {
    headers: { Accept: 'application/json' },
    next: { revalidate: 300 },
  })
  if (!res.ok) throw new Error(`DefiLlama ${res.status}`)
  const data = await res.json() as { peggedAssets?: LlamaCoin[] }
  const target = new Set<string>(MONITORED_STABLECOINS)
  // Multiple DefiLlama tokens share a ticker — keep the largest per symbol
  // (same canonicalization rule as the reserves route).
  const bySymbol = new Map<string, LlamaCoin>()
  for (const coin of data.peggedAssets ?? []) {
    const sym = coin.symbol?.toUpperCase() ?? ''
    if (!target.has(sym)) continue
    const existing = bySymbol.get(sym)
    if (!existing || (coin.circulating?.peggedUSD ?? 0) > (existing.circulating?.peggedUSD ?? 0)) {
      bySymbol.set(sym, coin)
    }
  }
  return bySymbol
}

/** Per-asset sentiment tallies from the Finance Now Free news pipeline (self-fetch). */
async function fetchNewsSentiment(origin: string): Promise<Map<string, { positive: number; negative: number; total: number }>> {
  const res = await fetch(new URL('/live-data/news?limit=100', origin), { cache: 'no-store' })
  if (!res.ok) throw new Error(`news route ${res.status}`)
  const data = await res.json() as { articles?: LiveNewsArticle[] }
  const tally = new Map<string, { positive: number; negative: number; total: number }>()
  for (const article of data.articles ?? []) {
    for (const assetId of article.relatedAssets ?? []) {
      const t = tally.get(assetId) ?? { positive: 0, negative: 0, total: 0 }
      t.total++
      if (article.sentiment === 'positive') t.positive++
      if (article.sentiment === 'negative') t.negative++
      tally.set(assetId, t)
    }
  }
  return tally
}

function daysBetween(a: string, b: string): number {
  return Math.round(Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86_400_000)
}

const todayIso = () => new Date().toISOString().slice(0, 10)

/** How stale the curated metadata snapshot itself is, in days. */
const metaAgeDays = () => daysBetween(META_AS_OF, todayIso())

export async function GET(req: Request) {
  const [llamaRes, cgRes, newsRes] = await Promise.allSettled([
    fetchLlamaStables(),
    fetchCgMarkets(),
    fetchNewsSentiment(new URL(req.url).origin),
  ])
  const llama = llamaRes.status === 'fulfilled' ? llamaRes.value : new Map<string, LlamaCoin>()
  const cg = cgRes.status === 'fulfilled' ? cgRes.value : new Map<string, CgMarketRow>()
  const news = newsRes.status === 'fulfilled' ? newsRes.value : new Map<string, { positive: number; negative: number; total: number }>()

  const base: Omit<RiskScoresResponse, 'stablecoins' | 'majors' | 'ok'> = {
    updatedAt: new Date().toISOString(),
    metaAsOf: META_AS_OF,
    metaAgeDays: metaAgeDays(),
    // 120d is the same cutoff scoreReserve uses for a stale attestation: past
    // it, the snapshot alone can push every issuer into the ×0.6 tier.
    metaStale: metaAgeDays() > 120,
    profileVersions: { stablecoin: STABLECOIN_RISK_PROFILE.version, cryptoAsset: CRYPTO_ASSET_RISK_PROFILE.version },
    sources: {
      defillama: llamaRes.status === 'fulfilled',
      coingecko: cgRes.status === 'fulfilled',
      news: newsRes.status === 'fulfilled',
    },
  }

  if (llama.size === 0 && cg.size === 0) {
    return NextResponse.json({
      ok: false, ...base, stablecoins: [], majors: [],
      error: 'Neither DefiLlama nor CoinGecko was reachable — no scores computed.',
    } satisfies RiskScoresResponse)
  }

  // ── Stablecoins ────────────────────────────────────────────────────────────
  const stablecoins: ScoredAsset[] = []
  for (const symbol of MONITORED_STABLECOINS) {
    const assetId = symbol.toLowerCase()
    const coin = llama.get(symbol)
    const cgRow = cg.get(COINGECKO_IDS[assetId] ?? '')
    const meta = ATTESTATION_META[symbol]
    const structure = STRUCTURE_META[symbol]
    const mechanism = coin?.pegMechanism ?? MECHANISM_FALLBACK[symbol] ?? 'unknown'

    const scores: DimensionScore[] = [
      scoreReserve({
        composition: COMPOSITION_MAP[symbol] ?? [],
        collateralizationRatio: meta?.collateralizationRatio ?? null,
        pegMechanism: mechanism,
        // Measured against TODAY, not against META_AS_OF. Comparing two
        // hardcoded dates froze this at whatever the age was on the snapshot
        // date, so the >120d "stale attestation ×0.6" tier was unreachable for
        // the entire dataset — permanently, not just today. Every monitored
        // issuer's last attestation on file is now 590–660 days old and was
        // being scored as if it were under 62.
        //
        // "The most recent attestation we hold is N days old" is a true and
        // risk-relevant statement even when the issuer has attested since —
        // an unverifiable reserve claim is exactly what this dimension exists
        // to penalise. The response flags metaStale so the UI can say the
        // number improves with a metadata refresh rather than implying the
        // issuer went quiet.
        attestationAgeDays: meta?.lastAttestedDate ? daysBetween(meta.lastAttestedDate, todayIso()) : null,
      }),
      scorePeg({
        price: coin?.price ?? cgRow?.current_price ?? null,
        history: cgRow?.sparkline_in_7d?.price ?? [],
      }),
      scoreStructure({
        pegMechanism: mechanism,
        regulatedIssuer: structure?.regulatedIssuer ?? false,
        incidentPenalty: structure?.incidentPenalty ?? 0,
        incidentNote: structure?.incidentNote,
      }),
      scoreAdoption({
        circulatingUsd: coin?.circulating?.peggedUSD ?? null,
        chainCount: coin?.chains?.length ?? 0,
      }),
      scoreNewsSentiment(news.get(assetId) ?? { positive: 0, negative: 0, total: 0 }),
    ]

    try {
      const composite = composeRisk(STABLECOIN_RISK_PROFILE, scores)
      stablecoins.push({
        assetId, symbol,
        name: coin?.name ?? cgRow?.name ?? symbol,
        price: coin?.price ?? cgRow?.current_price ?? null,
        marketCap: coin?.circulating?.peggedUSD ?? cgRow?.market_cap ?? null,
        change24h: cgRow?.price_change_percentage_24h ?? null,
        risk: applyFatalFlaws(composite, STABLECOIN_FATAL_FLAWS),
      })
    } catch { /* no dimension had data — omit rather than fabricate */ }
  }

  // ── Major assets ───────────────────────────────────────────────────────────
  const majors: ScoredAsset[] = []
  for (const assetId of MAJOR_IDS) {
    const cgRow = cg.get(COINGECKO_IDS[assetId])
    if (!cgRow) continue // no market data — a news-only composite would mislead

    const scores: DimensionScore[] = [
      scoreVolatility(cgRow.sparkline_in_7d?.price ?? []),
      scoreLiquidity(cgRow.total_volume, cgRow.market_cap),
      scoreScale(cgRow.market_cap),
      scoreTrend(cgRow.price_change_percentage_30d_in_currency ?? null),
      scoreNewsSentiment(news.get(assetId) ?? { positive: 0, negative: 0, total: 0 }),
    ]

    try {
      const composite = composeRisk(CRYPTO_ASSET_RISK_PROFILE, scores)
      majors.push({
        assetId,
        symbol: assetId.toUpperCase(),
        name: cgRow.name,
        price: cgRow.current_price,
        marketCap: cgRow.market_cap,
        change24h: cgRow.price_change_percentage_24h,
        risk: applyFatalFlaws(composite, []), // uniform shape; no fatal-flaw rules for majors yet
      })
    } catch { /* no dimension had data — omit */ }
  }

  stablecoins.sort((a, b) => b.risk.score - a.risk.score)
  majors.sort((a, b) => b.risk.score - a.risk.score)

  return NextResponse.json({
    ok: true, ...base, stablecoins, majors,
  } satisfies RiskScoresResponse)
}
