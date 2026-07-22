import { NextResponse } from 'next/server'
import {
  CAEP_TRACKED_IDS, UTILITY_MAP, CATEGORY_INFO, SCORING_CONFIG,
  getRecommendationLevel, type RecommendationLevel,
} from '@/lib/data/coinCatalog'
import { fetchCoinGeckoPages } from '@/lib/server/coingeckoPages'
import { tenPointSafetyToCanonical } from '@/lib/risk/normalize'
import { bandForScore } from '@/lib/risk/engine'
import type { RiskBand } from '@/lib/risk/types'

export const dynamic = 'force-dynamic'

export interface CandidateCoin {
  cgId: string
  symbol: string
  name: string
  image: string
  price: number
  marketCap: number
  marketCapRank: number
  volume24h: number
  priceChange24h: number
  priceChange7d: number | null
  athChangePercent: number    // negative = below ATH
  category: string
  categoryLabel: string
  categoryColor: string
  utilityNote: string
  scores: {
    marketCap: number         // 1–10
    utility: number           // 1–10
    risk: number              // 1–10 (higher = less risky) — LEGACY, kept one release
    /** Canonical 0–100 safety score (higher = safer). R2 migration; prefer this. */
    riskCanonical: number     // 0–100
    /** Canonical band for riskCanonical (low/moderate/elevated/high/critical). */
    band: RiskBand
    overall: number           // weighted composite (still on the 1–10 sub-scores)
  }
  scoreReasons: {
    marketCap: string
    utility: string
    risk: string
  }
  recommendation: RecommendationLevel
  reasons: string[]           // human-readable bullet points
}

export interface CoinDiscoveryResponse {
  ok: boolean
  candidates: CandidateCoin[]
  alreadyTracked: number
  updatedAt: string
  source: { name: string; limit: number; url: string }
  error?: string
}

// ─── Scoring helpers ──────────────────────────────────────────────────────────

function scoreMarketCap(marketCap: number): { score: number; reason: string } {
  const tier = SCORING_CONFIG.marketCapTiers.find(t => marketCap >= t.min)
  return {
    score:  tier?.score ?? 1,
    reason: tier?.label ?? 'Micro cap',
  }
}

function scoreUtility(cgId: string): { score: number; reason: string; category: string; note: string } {
  const mapped = UTILITY_MAP[cgId]
  if (mapped) {
    return {
      score:    mapped.utilityScore,
      reason:   mapped.note,
      category: mapped.category,
      note:     mapped.note,
    }
  }
  // Heuristic fallbacks from symbol/id patterns
  const id = cgId.toLowerCase()
  if (id.includes('usd') || id.includes('stable') || id.includes('dai'))
    return { score: 7, reason: 'Likely stablecoin', category: 'stablecoin', note: 'Stablecoin (heuristic)' }
  if (id.includes('swap') || id.includes('dex') || id.includes('defi'))
    return { score: 6, reason: 'DeFi protocol (heuristic)', category: 'defi', note: 'DeFi protocol' }
  return { score: 4, reason: 'Category unknown — manual review recommended', category: 'unknown', note: '' }
}

function scoreRisk(coin: {
  marketCap: number
  volume24h: number
  priceChange24h: number
  athChangePercent: number
}): { score: number; reason: string } {
  let score = 5
  const reasons: string[] = []

  // Liquidity: volume/marketCap ratio — higher is better
  const liquidityRatio = coin.volume24h / Math.max(coin.marketCap, 1)
  if (liquidityRatio > 0.15) { score += 2; reasons.push('High liquidity (vol/mcap >15%)') }
  else if (liquidityRatio > 0.05) { score += 1; reasons.push('Adequate liquidity') }
  else { score -= 1; reasons.push('Low liquidity (vol/mcap <5%)') }

  // ATH drawdown — less drawdown = less volatility history
  const drawdown = Math.abs(coin.athChangePercent)
  if (drawdown < 50)       { score += 2; reasons.push('Near ATH (<50% drawdown)') }
  else if (drawdown < 70)  { score += 1; reasons.push('Moderate ATH drawdown (50–70%)') }
  else if (drawdown < 85)  { reasons.push('Significant ATH drawdown (70–85%)') }
  else                     { score -= 2; reasons.push('Severe ATH drawdown (>85%)') }

  // 24h volatility — high swings increase risk
  const absChange = Math.abs(coin.priceChange24h)
  if (absChange > 20)      { score -= 2; reasons.push('High 24h volatility (>20%)') }
  else if (absChange > 10) { score -= 1; reasons.push('Elevated 24h volatility (>10%)') }

  // Market cap floor — very small caps are higher risk
  if (coin.marketCap < 50_000_000)   { score -= 2; reasons.push('Very small market cap (<$50M)') }
  else if (coin.marketCap < 200_000_000) { score -= 1; reasons.push('Small market cap (<$200M)') }

  const clamped = Math.max(1, Math.min(10, score))
  return { score: clamped, reason: reasons.slice(0, 3).join(' · ') }
}

function buildReasons(
  coin: { name: string; marketCap: number; priceChange24h: number },
  recommendation: RecommendationLevel,
  mcScore: number,
  utilScore: number,
  riskScore: number,
  utilNote: string
): string[] {
  const reasons: string[] = []
  const mcap = coin.marketCap >= 1e9
    ? `$${(coin.marketCap / 1e9).toFixed(1)}B`
    : `$${(coin.marketCap / 1e6).toFixed(0)}M`

  if (recommendation === 'strong-add') {
    reasons.push(`Established market cap of ${mcap} signals broad adoption`)
  } else if (recommendation === 'consider') {
    reasons.push(`Market cap of ${mcap} — notable but not top-tier`)
  } else {
    reasons.push(`Smaller market cap of ${mcap} — higher risk`)
  }

  if (utilNote) reasons.push(utilNote)
  if (utilScore <= 3) reasons.push('Limited utility — community/speculative value primarily')
  if (riskScore >= 8) reasons.push('Strong liquidity and stable price history')
  if (riskScore <= 3) reasons.push('Elevated risk: low liquidity or high volatility observed')
  if (Math.abs(coin.priceChange24h) > 15) reasons.push(`Significant 24h price movement (${coin.priceChange24h > 0 ? '+' : ''}${coin.priceChange24h.toFixed(1)}%)`)

  return reasons.slice(0, 4)
}

// ─── Route handler ────────────────────────────────────────────────────────────

type RawCoin = {
  id: string; symbol: string; name: string; image: string
  current_price: number; market_cap: number; market_cap_rank: number
  total_volume: number; price_change_percentage_24h: number
  price_change_percentage_7d_in_currency: number | null
  ath_change_percentage: number
}

export async function GET(req: Request) {
  const url   = new URL(req.url)
  const limit = Math.min(750, Math.max(50, parseInt(url.searchParams.get('limit') ?? '250', 10)))
  const pages = Math.ceil(limit / 250)

  // Sequential, throttle-aware paging. Issuing these pages in parallel 429'd
  // every one of them on CoinGecko's free tier, turning a partial result into a
  // total 503 (verified 2026-07-22). See lib/server/coingeckoPages.
  const { pages: pageRows, errors: upstreamErrors } = await fetchCoinGeckoPages<RawCoin>(
    pages,
    (page) =>
      'https://api.coingecko.com/api/v3/coins/markets' +
      `?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}` +
      '&sparkline=false&price_change_percentage=7d',
    { revalidate: 900 },
  )
  const rawCoins: RawCoin[] = pageRows.flat().slice(0, limit)

  // Upstream failed entirely — say so instead of returning an empty-but-ok payload
  if (rawCoins.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        candidates: [],
        alreadyTracked: 0,
        updatedAt: new Date().toISOString(),
        source: { name: 'CoinGecko', limit, url: 'https://api.coingecko.com/api/v3/coins/markets' },
        error: `CoinGecko markets unavailable (${upstreamErrors.join('; ') || 'empty response'})`,
      } satisfies CoinDiscoveryResponse,
      { status: 503 }
    )
  }

  const alreadyTracked = rawCoins.filter(c => CAEP_TRACKED_IDS.has(c.id)).length

  const candidates: CandidateCoin[] = rawCoins
    .filter(c => !CAEP_TRACKED_IDS.has(c.id) && c.market_cap > 0)
    .map(c => {
      const mc   = scoreMarketCap(c.market_cap)
      const util = scoreUtility(c.id)
      const risk = scoreRisk({
        marketCap:        c.market_cap,
        volume24h:        c.total_volume,
        priceChange24h:   c.price_change_percentage_24h ?? 0,
        athChangePercent: c.ath_change_percentage ?? -50,
      })

      const { weights } = SCORING_CONFIG
      const overall = parseFloat(
        (mc.score * weights.marketCap + util.score * weights.utility + risk.score * weights.risk).toFixed(2)
      )

      const recommendation = getRecommendationLevel(overall)
      const catInfo = CATEGORY_INFO[util.category] ?? CATEGORY_INFO.unknown

      return {
        cgId:           c.id,
        symbol:         c.symbol.toUpperCase(),
        name:           c.name,
        image:          c.image,
        price:          c.current_price,
        marketCap:      c.market_cap,
        marketCapRank:  c.market_cap_rank,
        volume24h:      c.total_volume,
        priceChange24h: parseFloat((c.price_change_percentage_24h ?? 0).toFixed(2)),
        priceChange7d:  c.price_change_percentage_7d_in_currency != null
                          ? parseFloat(c.price_change_percentage_7d_in_currency.toFixed(2))
                          : null,
        athChangePercent: parseFloat((c.ath_change_percentage ?? -50).toFixed(1)),
        category:        util.category,
        categoryLabel:   catInfo.label,
        categoryColor:   catInfo.color,
        utilityNote:     util.note,
        scores: {
          marketCap: mc.score,
          utility:   util.score,
          risk:      risk.score,
          // R2: scoreRisk is 1–10 higher=SAFER, so rescale (preserve polarity).
          // NOT tenPointRiskToSafety — that inverter would flip a safe coin to critical.
          riskCanonical: parseFloat(tenPointSafetyToCanonical(risk.score).toFixed(1)),
          band:          bandForScore(tenPointSafetyToCanonical(risk.score)),
          overall,
        },
        scoreReasons: {
          marketCap: mc.reason,
          utility:   util.reason,
          risk:      risk.reason,
        },
        recommendation,
        reasons: buildReasons(
          { name: c.name, marketCap: c.market_cap, priceChange24h: c.price_change_percentage_24h ?? 0 },
          recommendation, mc.score, util.score, risk.score, util.note
        ),
      }
    })
    .sort((a, b) => b.scores.overall - a.scores.overall)

  return NextResponse.json({
    ok: true,
    candidates,
    alreadyTracked,
    updatedAt: new Date().toISOString(),
    source: {
      name: 'CoinGecko',
      limit,
      url: 'https://api.coingecko.com/api/v3/coins/markets',
    },
  } satisfies CoinDiscoveryResponse)
}
