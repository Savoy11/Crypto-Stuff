import { NextRequest, NextResponse } from 'next/server'
import { getFund } from '@/lib/data/fundCatalog'
import { resolveFundSeries, listNportFilings, fetchNportReport } from '@/lib/server/nport'

// Full underlying-investment breakdown for ETFs and mutual funds.
//   GET /live-data/fund-holdings?symbol=SPY
//
// Source ladder — SEC EDGAR is the authoritative core (free, keyless,
// definitive); aggregators supplement freshness and sector metadata:
//   1. SEC N-PORT — the fund's own complete quarterly portfolio disclosure
//   2. FMP (needs FMP_API_KEY) — aggregator holdings + sector weights
//   3. Yahoo quoteSummary topHoldings (keyless) — top 10 + sector weights + asset allocation
//   4. Catalog indicative top holdings — always renders, labelled non-live
//
// Response: { ok, symbol, source, full, asOf, holdings, sectorWeights, assetAllocation, holdingsCount }

export const dynamic = 'force-dynamic'

const FMP_KEY = process.env.FMP_API_KEY && process.env.FMP_API_KEY !== 'your-fmp-api-key'
  ? process.env.FMP_API_KEY : undefined

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/json',
}

export type HoldingsSource = 'sec' | 'fmp' | 'yahoo' | 'catalog'

export interface HoldingRow {
  symbol: string | null
  name: string
  weightPct: number
  shares: number | null
  marketValue: number | null
}

export interface SectorWeight {
  sector: string
  weightPct: number
}

export interface AssetAllocationSlice {
  class: 'Stocks' | 'Bonds' | 'Cash' | 'Preferred' | 'Convertible' | 'Other'
  weightPct: number
}

export interface FundHoldingsResponse {
  ok: boolean
  symbol: string
  updatedAt: string
  source: HoldingsSource
  /** true when the complete holdings list is present (FMP), false for top-N subsets. */
  full: boolean
  /** Disclosure date of the holdings snapshot, when the provider reports one. */
  asOf: string | null
  holdings: HoldingRow[]
  sectorWeights: SectorWeight[]
  assetAllocation: AssetAllocationSlice[]
  /** Total number of positions in the fund, when known. */
  holdingsCount: number | null
  error?: string
}

// ─── SEC N-PORT (authoritative full holdings, keyless) ────────────────────────

interface FmpHoldingsResult { holdings: HoldingRow[]; asOf: string | null }

/** Very large funds disclose thousands of rows; cap the payload while keeping
 *  the true position count in holdingsCount. */
const MAX_ROWS = 1500

async function fetchSecHoldings(symbol: string): Promise<FmpHoldingsResult & { totalCount: number }> {
  const empty = { holdings: [], asOf: null, totalCount: 0 }
  const series = await resolveFundSeries(symbol)
  if (!series) return empty
  const filings = await listNportFilings(series.seriesId, 1)
  if (filings.length === 0) return empty
  const report = await fetchNportReport(filings[0])

  const rows = report.holdings.filter((h) => h.pctVal != null && h.pctVal > 0)
  // pctVal is percent of net assets; normalize defensively if a filer reports fractions.
  const total = rows.reduce((s, h) => s + (h.pctVal ?? 0), 0)
  const scale = total > 0 && total < 2 ? 100 : 1
  const holdings: HoldingRow[] = rows
    .map((h) => ({
      symbol: h.ticker,
      name: h.name,
      weightPct: (h.pctVal ?? 0) * scale,
      shares: h.balance,
      marketValue: h.valueUsd,
    }))
    .sort((a, b) => b.weightPct - a.weightPct)
  return { holdings: holdings.slice(0, MAX_ROWS), asOf: report.asOf, totalCount: holdings.length }
}

// ─── FMP (aggregator fallback, ETFs) ─────────────────────────────────────────

/** Parse rows from either the stable (`etf/holdings`) or legacy (`etf-holder`) shape. */
function parseFmpHoldings(rows: Array<Record<string, unknown>>): FmpHoldingsResult {
  const holdings: HoldingRow[] = []
  let asOf: string | null = null
  for (const row of rows) {
    const weight = Number(row.weightPercentage ?? row.weightPct ?? NaN)
    if (!Number.isFinite(weight) || weight <= 0) continue
    const symbol = typeof row.symbol === 'string' && row.symbol ? row.symbol
      : typeof row.asset === 'string' && row.asset ? row.asset : null
    const name = typeof row.name === 'string' && row.name ? row.name : symbol ?? 'Unknown'
    const shares = Number(row.sharesNumber ?? NaN)
    const marketValue = Number(row.marketValue ?? NaN)
    const updated = row.updatedAt ?? row.updated
    if (!asOf && typeof updated === 'string' && updated) asOf = updated.slice(0, 10)
    holdings.push({
      symbol: symbol?.toUpperCase() ?? null,
      name,
      weightPct: weight,
      shares: Number.isFinite(shares) ? shares : null,
      marketValue: Number.isFinite(marketValue) ? marketValue : null,
    })
  }
  holdings.sort((a, b) => b.weightPct - a.weightPct)
  return { holdings, asOf }
}

async function fetchFmpHoldings(symbol: string): Promise<FmpHoldingsResult> {
  const urls = [
    `https://financialmodelingprep.com/stable/etf/holdings?symbol=${encodeURIComponent(symbol)}&apikey=${FMP_KEY}`,
    `https://financialmodelingprep.com/api/v3/etf-holder/${encodeURIComponent(symbol)}?apikey=${FMP_KEY}`,
  ]
  for (const url of urls) {
    try {
      const res = await fetch(url, { next: { revalidate: 3600 } })
      if (!res.ok) continue
      const rows = await res.json()
      if (!Array.isArray(rows) || rows.length === 0) continue
      const parsed = parseFmpHoldings(rows as Array<Record<string, unknown>>)
      if (parsed.holdings.length > 0) return parsed
    } catch { /* try next shape */ }
  }
  return { holdings: [], asOf: null }
}

async function fetchFmpSectorWeights(symbol: string): Promise<SectorWeight[]> {
  const urls = [
    `https://financialmodelingprep.com/stable/etf/sector-weightings?symbol=${encodeURIComponent(symbol)}&apikey=${FMP_KEY}`,
    `https://financialmodelingprep.com/api/v3/etf-sector-weightings/${encodeURIComponent(symbol)}?apikey=${FMP_KEY}`,
  ]
  for (const url of urls) {
    try {
      const res = await fetch(url, { next: { revalidate: 3600 } })
      if (!res.ok) continue
      const rows = await res.json()
      if (!Array.isArray(rows) || rows.length === 0) continue
      const weights: SectorWeight[] = []
      for (const row of rows as Array<{ sector?: string; weightPercentage?: string | number }>) {
        if (!row.sector) continue
        // Legacy shape reports strings like "24.53%"; stable reports numbers.
        const weight = typeof row.weightPercentage === 'string'
          ? parseFloat(row.weightPercentage)
          : Number(row.weightPercentage ?? NaN)
        if (!Number.isFinite(weight) || weight <= 0) continue
        weights.push({ sector: row.sector, weightPct: weight })
      }
      if (weights.length > 0) return weights.sort((a, b) => b.weightPct - a.weightPct)
    } catch { /* try next shape */ }
  }
  return []
}

// ─── Yahoo quoteSummary topHoldings (keyless) ─────────────────────────────────

const YAHOO_SECTOR_LABELS: Record<string, string> = {
  technology: 'Technology',
  financial_services: 'Financial Services',
  healthcare: 'Healthcare',
  consumer_cyclical: 'Consumer Cyclical',
  communication_services: 'Communication Services',
  industrials: 'Industrials',
  consumer_defensive: 'Consumer Defensive',
  energy: 'Energy',
  basic_materials: 'Basic Materials',
  realestate: 'Real Estate',
  utilities: 'Utilities',
}

interface YahooTopHoldings {
  holdings?: Array<{ symbol?: string; holdingName?: string; holdingPercent?: number }>
  sectorWeightings?: Array<Record<string, number>>
  stockPosition?: number
  bondPosition?: number
  cashPosition?: number
  otherPosition?: number
  preferredPosition?: number
  convertiblePosition?: number
}

interface YahooResult {
  holdings: HoldingRow[]
  sectorWeights: SectorWeight[]
  assetAllocation: AssetAllocationSlice[]
}

async function fetchYahooHoldings(symbol: string): Promise<YahooResult> {
  const empty: YahooResult = { holdings: [], sectorWeights: [], assetAllocation: [] }
  let top: YahooTopHoldings | undefined
  for (const host of ['query1.finance.yahoo.com', 'query2.finance.yahoo.com']) {
    try {
      const res = await fetch(
        `https://${host}/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=topHoldings&formatted=false`,
        { headers: BROWSER_HEADERS, next: { revalidate: 3600 } }
      )
      if (!res.ok) continue
      const payload = await res.json() as { quoteSummary?: { result?: Array<{ topHoldings?: YahooTopHoldings }> } }
      top = payload.quoteSummary?.result?.[0]?.topHoldings
      if (top) break
    } catch { /* try next host */ }
  }
  if (!top) return empty

  const holdings: HoldingRow[] = (top.holdings ?? [])
    .filter((h) => Number.isFinite(h.holdingPercent) && (h.holdingPercent ?? 0) > 0)
    .map((h) => ({
      symbol: h.symbol?.toUpperCase() ?? null,
      name: h.holdingName ?? h.symbol ?? 'Unknown',
      weightPct: (h.holdingPercent ?? 0) * 100,
      shares: null,
      marketValue: null,
    }))
    .sort((a, b) => b.weightPct - a.weightPct)

  const sectorWeights: SectorWeight[] = []
  for (const entry of top.sectorWeightings ?? []) {
    for (const [key, fraction] of Object.entries(entry)) {
      if (!Number.isFinite(fraction) || fraction <= 0) continue
      sectorWeights.push({ sector: YAHOO_SECTOR_LABELS[key] ?? key, weightPct: fraction * 100 })
    }
  }
  sectorWeights.sort((a, b) => b.weightPct - a.weightPct)

  const allocation: AssetAllocationSlice[] = []
  const slices: Array<[AssetAllocationSlice['class'], number | undefined]> = [
    ['Stocks', top.stockPosition],
    ['Bonds', top.bondPosition],
    ['Cash', top.cashPosition],
    ['Preferred', top.preferredPosition],
    ['Convertible', top.convertiblePosition],
    ['Other', top.otherPosition],
  ]
  for (const [cls, fraction] of slices) {
    if (fraction != null && Number.isFinite(fraction) && fraction > 0.0005) {
      allocation.push({ class: cls, weightPct: fraction * 100 })
    }
  }

  return { holdings, sectorWeights, assetAllocation: allocation }
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol')?.trim().toUpperCase()
  if (!symbol) {
    return NextResponse.json({ ok: false, error: 'Pass ?symbol=SPY' }, { status: 400 })
  }

  const entry = getFund(symbol)
  const base = { symbol, updatedAt: new Date().toISOString() }

  // SEC N-PORT covers ETFs and mutual funds alike; FMP's holdings endpoint is
  // ETF-only. Sector weights / asset mix still come from FMP or Yahoo — the
  // N-PORT filing has no GICS classification.
  const wantFmp = !!FMP_KEY && entry?.type !== 'mutual'
  const [secRes, fmpHoldingsRes, fmpSectorsRes, yahooRes] = await Promise.allSettled([
    fetchSecHoldings(symbol),
    wantFmp ? fetchFmpHoldings(symbol) : Promise.resolve({ holdings: [], asOf: null } as FmpHoldingsResult),
    wantFmp ? fetchFmpSectorWeights(symbol) : Promise.resolve([] as SectorWeight[]),
    fetchYahooHoldings(symbol),
  ])

  const sec = secRes.status === 'fulfilled' ? secRes.value : { holdings: [], asOf: null, totalCount: 0 }
  const fmp = fmpHoldingsRes.status === 'fulfilled' ? fmpHoldingsRes.value : { holdings: [], asOf: null }
  const fmpSectors = fmpSectorsRes.status === 'fulfilled' ? fmpSectorsRes.value : []
  const yahoo = yahooRes.status === 'fulfilled' ? yahooRes.value : { holdings: [], sectorWeights: [], assetAllocation: [] }

  if (sec.holdings.length > 0) {
    return NextResponse.json({
      ok: true, ...base, source: 'sec', full: true, asOf: sec.asOf,
      holdings: sec.holdings,
      sectorWeights: fmpSectors.length > 0 ? fmpSectors : yahoo.sectorWeights,
      assetAllocation: yahoo.assetAllocation,
      holdingsCount: sec.totalCount,
    } satisfies FundHoldingsResponse)
  }

  if (fmp.holdings.length > 0) {
    return NextResponse.json({
      ok: true, ...base, source: 'fmp', full: true, asOf: fmp.asOf,
      holdings: fmp.holdings,
      sectorWeights: fmpSectors.length > 0 ? fmpSectors : yahoo.sectorWeights,
      assetAllocation: yahoo.assetAllocation,
      holdingsCount: fmp.holdings.length,
    } satisfies FundHoldingsResponse)
  }

  // Bond/commodity funds often disclose only an asset mix — still worth showing.
  if (yahoo.holdings.length > 0 || yahoo.sectorWeights.length > 0 || yahoo.assetAllocation.length > 0) {
    return NextResponse.json({
      ok: true, ...base, source: 'yahoo', full: false, asOf: null,
      holdings: yahoo.holdings,
      sectorWeights: yahoo.sectorWeights,
      assetAllocation: yahoo.assetAllocation,
      holdingsCount: null,
    } satisfies FundHoldingsResponse)
  }

  // Last resort — the catalog's indicative top holdings, clearly non-live.
  return NextResponse.json({
    ok: true, ...base, source: 'catalog', full: false, asOf: null,
    holdings: (entry?.topHoldings ?? []).map((h) => ({
      symbol: h.symbol, name: h.name, weightPct: h.weightPct, shares: null, marketValue: null,
    })),
    sectorWeights: [],
    assetAllocation: [],
    holdingsCount: null,
  } satisfies FundHoldingsResponse)
}
