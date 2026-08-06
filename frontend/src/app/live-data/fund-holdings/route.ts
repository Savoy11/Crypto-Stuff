import { NextRequest, NextResponse } from 'next/server'
import { getFund } from '@/lib/data/fundCatalog'
import { resolveFundSeries, listNportFilings, fetchNportReport } from '@/lib/server/nport'

// Full underlying-investment breakdown for ETFs and mutual funds.
//   GET /live-data/fund-holdings?symbol=SPY
//
// Source ladder — SEC EDGAR is the authoritative core (free, keyless,
// definitive); FMP supplements freshness and sector metadata:
//   1. SEC N-PORT — the fund's own complete quarterly portfolio disclosure
//   2. FMP (needs FMP_API_KEY) — aggregator holdings + sector weights
//   3. Catalog indicative top holdings — always renders, labelled non-live
//
// ⚠ Yahoo's quoteSummary topHoldings module was rung 3 until 2026-08-06,
// keylessly supplying a top-10 list, GICS sector weights and the stock/bond/
// cash asset mix. It was removed on terms grounds (lib/server/sourceTerms.ts).
// Consequences, all deliberate and visible rather than papered over:
//   • SECTOR WEIGHTS now need an FMP key. N-PORT carries no GICS
//     classification, so without a key the sector chart is simply absent.
//   • ASSET ALLOCATION has NO source at all. Neither N-PORT nor FMP's
//     holdings endpoint reports the stock/bond/cash split, so the field is
//     always [] and the UI omits the section. Do not reconstruct it by
//     bucketing N-PORT rows — that is a different number wearing this one's
//     label. If it matters, N-PORT does carry per-position asset categories
//     and deriving it *explicitly labelled as derived* would be honest work.
//
// Response: { ok, symbol, source, full, asOf, holdings, sectorWeights, assetAllocation, holdingsCount }

export const dynamic = 'force-dynamic'

const FMP_KEY = process.env.FMP_API_KEY && process.env.FMP_API_KEY !== 'your-fmp-api-key'
  ? process.env.FMP_API_KEY : undefined

export type HoldingsSource = 'sec' | 'fmp' | 'catalog'

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
  /**
   * Stock/bond/cash mix. Always empty since the Yahoo removal — no remaining
   * source publishes it. Kept in the response shape so consumers don't need a
   * conditional, and so restoring a source is a one-line change here.
   */
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

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol')?.trim().toUpperCase()
  if (!symbol) {
    return NextResponse.json({ ok: false, error: 'Pass ?symbol=SPY' }, { status: 400 })
  }
  // Optional explicit source (?source=sec|fmp); default is the auto ladder.
  // `?source=yahoo` is no longer accepted and falls through to Auto rather than
  // erroring — a saved link or bookmark should degrade, not break.
  const forcedParam = request.nextUrl.searchParams.get('source')
  const forced = forcedParam === 'sec' || forcedParam === 'fmp' ? forcedParam : null

  const entry = getFund(symbol)
  const base = { symbol, updatedAt: new Date().toISOString() }

  // SEC N-PORT covers ETFs and mutual funds alike; FMP's holdings endpoint is
  // ETF-only. Sector weights come from FMP alone now — the N-PORT filing has no
  // GICS classification, and the keyless fallback that used to supply them is
  // gone (see the header note).
  const wantSec = !forced || forced === 'sec'
  const wantFmp = !!FMP_KEY && entry?.type !== 'mutual' && (!forced || forced === 'fmp')
  const [secRes, fmpHoldingsRes, fmpSectorsRes] = await Promise.allSettled([
    wantSec ? fetchSecHoldings(symbol) : Promise.resolve({ holdings: [], asOf: null, totalCount: 0 }),
    wantFmp ? fetchFmpHoldings(symbol) : Promise.resolve({ holdings: [], asOf: null } as FmpHoldingsResult),
    wantFmp ? fetchFmpSectorWeights(symbol) : Promise.resolve([] as SectorWeight[]),
  ])

  const sec = secRes.status === 'fulfilled' ? secRes.value : { holdings: [], asOf: null, totalCount: 0 }
  const fmp = fmpHoldingsRes.status === 'fulfilled' ? fmpHoldingsRes.value : { holdings: [], asOf: null }
  const fmpSectors = fmpSectorsRes.status === 'fulfilled' ? fmpSectorsRes.value : []
  // No remaining source publishes the stock/bond/cash mix. Empty, always.
  const assetAllocation: AssetAllocationSlice[] = []

  // An explicit choice is respected: no silent fallback to other providers.
  if (forced) {
    const picked = forced === 'sec'
      ? { source: 'sec' as const, holdings: sec.holdings, asOf: sec.asOf, full: true, count: sec.totalCount || null }
      : { source: 'fmp' as const, holdings: fmp.holdings, asOf: fmp.asOf, full: true, count: fmp.holdings.length || null }
    return NextResponse.json({
      ok: true, ...base, source: picked.source, full: picked.full && picked.holdings.length > 0, asOf: picked.asOf,
      holdings: picked.holdings,
      sectorWeights: forced === 'fmp' ? fmpSectors : [],
      assetAllocation,
      holdingsCount: picked.count,
      ...(picked.holdings.length === 0 ? {
        error: forced === 'fmp' && !FMP_KEY
          ? 'FMP requires an API key (FMP_API_KEY) — not configured on this instance.'
          : `The selected source returned no holdings for ${symbol}. Switch back to Auto to use the best available source.`,
      } : {}),
    } satisfies FundHoldingsResponse)
  }

  if (sec.holdings.length > 0) {
    return NextResponse.json({
      ok: true, ...base, source: 'sec', full: true, asOf: sec.asOf,
      holdings: sec.holdings,
      sectorWeights: fmpSectors,
      assetAllocation,
      holdingsCount: sec.totalCount,
    } satisfies FundHoldingsResponse)
  }

  if (fmp.holdings.length > 0) {
    return NextResponse.json({
      ok: true, ...base, source: 'fmp', full: true, asOf: fmp.asOf,
      holdings: fmp.holdings,
      sectorWeights: fmpSectors,
      assetAllocation,
      holdingsCount: fmp.holdings.length,
    } satisfies FundHoldingsResponse)
  }

  // Last resort — the catalog's indicative top holdings, clearly non-live.
  return NextResponse.json({
    ok: true, ...base, source: 'catalog', full: false, asOf: null,
    holdings: (entry?.topHoldings ?? []).map((h) => ({
      symbol: h.symbol, name: h.name, weightPct: h.weightPct, shares: null, marketValue: null,
    })),
    sectorWeights: fmpSectors,
    assetAllocation,
    holdingsCount: null,
  } satisfies FundHoldingsResponse)
}
