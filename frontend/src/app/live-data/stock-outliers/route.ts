import { NextRequest, NextResponse } from 'next/server'
import { getProviderKey } from '@/lib/api/live/providers'
import { SECTOR_INFO, type SectorId } from '@/lib/data/equityCatalog'
import type { StockUniverseResponse } from '@/app/live-data/stock-universe/route'

// Cross-sectional outlier detection over the stock universe.
//   GET /live-data/stock-outliers?min_mcap=2
//
// Pulls the universe, then computes SECTOR-RELATIVE z-scores on the metrics the
// universe carries (P/E where present, dividend yield, beta) and surfaces the
// statistical outliers per category. This is the cheap universe-wide pass; the
// Equity Screener agent enriches the flagged names with SEC financials/news.

export const dynamic = 'force-dynamic'

export interface OutlierItem {
  symbol: string
  name: string
  sector: SectorId
  sectorLabel: string
  metric: 'pe' | 'yield' | 'beta'
  value: number
  sectorAvg: number
  /** Standard deviations from the sector mean (signed). */
  z: number
}

export interface StockOutliersResponse {
  ok: boolean
  configured: boolean
  universeSize: number
  evaluated: number          // after the market-cap floor
  sectorsEvaluated: number
  peCoverage: number         // fraction of evaluated names with a usable P/E
  categories: {
    cheap: OutlierItem[]     // low P/E vs sector — potential value
    expensive: OutlierItem[] // high P/E vs sector — momentum / rich valuation
    highYield: OutlierItem[] // high dividend yield vs sector — income / value-trap
    highBeta: OutlierItem[]  // high beta vs sector — high risk/reward
    lowBeta: OutlierItem[]   // low beta vs sector — defensive
  }
  updatedAt: string
  note?: string
}

const MIN_SECTOR_N = 5      // need enough peers for a meaningful distribution
const Z_THRESHOLD = 1.75    // |z| above this counts as an outlier
const TOP_PER_CATEGORY = 10

interface Enriched {
  symbol: string; name: string; sector: SectorId
  pe: number | null; yield: number | null; beta: number
  peZ: number | null; yieldZ: number | null; betaZ: number | null
}

function meanStd(vals: number[]): { mean: number; std: number } {
  const n = vals.length
  if (n === 0) return { mean: 0, std: 0 }
  const mean = vals.reduce((s, v) => s + v, 0) / n
  if (n < 2) return { mean, std: 0 }
  const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)
  return { mean, std: Math.sqrt(variance) }
}

export async function GET(req: NextRequest) {
  const minMcap = Math.max(0, parseFloat(req.nextUrl.searchParams.get('min_mcap') ?? '2') || 0)
  const origin = req.nextUrl.origin

  const empty = (extra: Partial<StockOutliersResponse> = {}): StockOutliersResponse => ({
    ok: true, configured: !!getProviderKey('fmp'), universeSize: 0, evaluated: 0,
    sectorsEvaluated: 0, peCoverage: 0,
    categories: { cheap: [], expensive: [], highYield: [], highBeta: [], lowBeta: [] },
    updatedAt: new Date().toISOString(), ...extra,
  })

  let uni: StockUniverseResponse
  try {
    const res = await fetch(`${origin}/live-data/stock-universe`, { next: { revalidate: 3600 } })
    uni = await res.json() as StockUniverseResponse
  } catch {
    return NextResponse.json(empty({ ok: false, note: 'universe unavailable' }), { status: 503 })
  }

  const universe = uni.entries ?? []
  const pool = universe.filter((e) => e.marketCapB >= minMcap && e.sector !== 'other')

  // Group by sector and compute per-metric sector stats
  const bySector = new Map<SectorId, typeof pool>()
  for (const e of pool) {
    const arr = bySector.get(e.sector) ?? []
    arr.push(e)
    bySector.set(e.sector, arr)
  }

  const enriched: Enriched[] = []
  let sectorsEvaluated = 0
  let peCount = 0
  for (const [sector, members] of bySector) {
    if (members.length < MIN_SECTOR_N) continue
    sectorsEvaluated++
    const peStats = meanStd(members.map((m) => m.peRatio).filter((v): v is number => v != null && v > 0))
    const yStats  = meanStd(members.map((m) => m.dividendYieldPct).filter((v): v is number => v != null && v > 0))
    const bStats  = meanStd(members.map((m) => m.beta).filter((v): v is number => Number.isFinite(v)))
    for (const m of members) {
      const pe = m.peRatio != null && m.peRatio > 0 ? m.peRatio : null
      const yld = m.dividendYieldPct != null && m.dividendYieldPct > 0 ? m.dividendYieldPct : null
      if (pe != null) peCount++
      enriched.push({
        symbol: m.symbol, name: m.name, sector,
        pe, yield: yld, beta: m.beta,
        peZ:    pe != null && peStats.std > 0 ? (pe - peStats.mean) / peStats.std : null,
        yieldZ: yld != null && yStats.std > 0 ? (yld - yStats.mean) / yStats.std : null,
        betaZ:  bStats.std > 0 ? (m.beta - bStats.mean) / bStats.std : null,
      })
    }
  }

  const sectorAvg = (sector: SectorId, metric: 'pe' | 'yield' | 'beta'): number => {
    const members = (bySector.get(sector) ?? [])
    const vals = members.map((m) => metric === 'pe' ? m.peRatio : metric === 'yield' ? m.dividendYieldPct : m.beta)
      .filter((v): v is number => v != null && (metric === 'beta' || v > 0))
    return meanStd(vals).mean
  }

  const item = (e: Enriched, metric: 'pe' | 'yield' | 'beta', value: number, z: number): OutlierItem => ({
    symbol: e.symbol, name: e.name, sector: e.sector, sectorLabel: SECTOR_INFO[e.sector].label,
    metric, value: parseFloat(value.toFixed(2)), sectorAvg: parseFloat(sectorAvg(e.sector, metric).toFixed(2)),
    z: parseFloat(z.toFixed(2)),
  })

  const cheap = enriched.filter((e) => e.peZ != null && e.peZ <= -Z_THRESHOLD)
    .sort((a, b) => (a.peZ! - b.peZ!)).slice(0, TOP_PER_CATEGORY).map((e) => item(e, 'pe', e.pe!, e.peZ!))
  const expensive = enriched.filter((e) => e.peZ != null && e.peZ >= Z_THRESHOLD)
    .sort((a, b) => (b.peZ! - a.peZ!)).slice(0, TOP_PER_CATEGORY).map((e) => item(e, 'pe', e.pe!, e.peZ!))
  const highYield = enriched.filter((e) => e.yieldZ != null && e.yieldZ >= Z_THRESHOLD)
    .sort((a, b) => (b.yieldZ! - a.yieldZ!)).slice(0, TOP_PER_CATEGORY).map((e) => item(e, 'yield', e.yield!, e.yieldZ!))
  const highBeta = enriched.filter((e) => e.betaZ != null && e.betaZ >= Z_THRESHOLD)
    .sort((a, b) => (b.betaZ! - a.betaZ!)).slice(0, TOP_PER_CATEGORY).map((e) => item(e, 'beta', e.beta, e.betaZ!))
  const lowBeta = enriched.filter((e) => e.betaZ != null && e.betaZ <= -Z_THRESHOLD)
    .sort((a, b) => (a.betaZ! - b.betaZ!)).slice(0, TOP_PER_CATEGORY).map((e) => item(e, 'beta', e.beta, e.betaZ!))

  return NextResponse.json({
    ok: true,
    configured: uni.configured ?? false,
    universeSize: universe.length,
    evaluated: enriched.length,
    sectorsEvaluated,
    peCoverage: enriched.length ? parseFloat((peCount / enriched.length).toFixed(2)) : 0,
    categories: { cheap, expensive, highYield, highBeta, lowBeta },
    updatedAt: new Date().toISOString(),
    note: uni.configured ? undefined : 'Curated fallback universe — add an FMP key for the full universe. P/E outliers use curated values; beta/yield are broader with FMP.',
  } satisfies StockOutliersResponse)
}
