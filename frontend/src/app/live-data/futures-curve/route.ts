import { NextRequest, NextResponse } from 'next/server'
import { getCommodity, THINLY_TRADED_COMMODITIES } from '@/lib/data/commodityCatalog'
import { getRatesEntry } from '@/lib/data/ratesCatalog'
import { contractMonths, analyzeCurve, type CurvePoint, type CurveAnalysis } from '@/lib/data/termStructure'
import { recordProviderFetch } from '@/lib/api/live/providers'

// Futures term structure (P2-O4) — the forward curve for one contract.
//   GET /live-data/futures-curve?slug=gold          (commodity slug)
//   GET /live-data/futures-curve?slug=10-year-note-future&kind=rate
//
// NO NEW PROVIDER. Individual contract months resolve through the same Yahoo
// v8 chart API the app already uses for continuous front-months — verified
// 9/9 across NYMEX, COMEX and CBOT by the P2-O1 audit (owner machine,
// 2026-08-05), with CLU26.NYM matching the CL=F control exactly.
//
// Months are INDEPENDENT fetches — one contract failing says nothing about the
// others — so Promise.allSettled is the correct boundary here, not a fallback
// ladder (see CLAUDE.md, "Resilient multi-fetch"). Unlisted months simply
// don't resolve and are dropped: gold trades Feb/Apr/Jun/Aug/Dec, corn
// Mar/May/Jul/Sep/Dec, crude all twelve, and letting the market answer beats
// maintaining a second listing-cycle table that would drift.

export const dynamic = 'force-dynamic'

/** How many calendar months forward to request. */
const MONTHS_AHEAD = 8

/** Below this many resolved months, report no curve rather than draw a line. */
const MIN_POINTS = 3

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/json',
}

export interface FuturesCurveResponse {
  ok: boolean
  symbol: string
  name: string
  /** 'usd' | 'cents' for commodities, 'points' for rate futures. */
  quoteBasis: string
  unit: string | null
  updatedAt: string
  points: CurvePoint[]
  analysis: CurveAnalysis | null
  /** Months requested but not listed/resolvable — reported, never hidden. */
  unresolved: string[]
  error?: string
}

async function fetchMonthPrice(symbol: string): Promise<number | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1mo&interval=1d`
  const res = await fetch(url, { headers: BROWSER_HEADERS, next: { revalidate: 900 } })
  if (!res.ok) return null
  const body = await res.json() as {
    chart?: {
      result?: Array<{
        meta?: { regularMarketPrice?: number }
        indicators?: { quote?: Array<{ close?: Array<number | null> }> }
      }>
    }
  }
  const result = body?.chart?.result?.[0]
  if (!result) return null

  const meta = result.meta?.regularMarketPrice
  if (typeof meta === 'number' && Number.isFinite(meta) && meta > 0) return meta

  // Thin months sometimes carry bars without a meta price — fall back to the
  // last real close rather than dropping a contract that did quote.
  const closes = (result.indicators?.quote?.[0]?.close ?? []).filter(
    (c): c is number => typeof c === 'number' && Number.isFinite(c) && c > 0,
  )
  return closes.length > 0 ? closes[closes.length - 1] : null
}

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get('slug')
  const kind = request.nextUrl.searchParams.get('kind') === 'rate' ? 'rate' : 'commodity'

  if (!slug) {
    return NextResponse.json({ ok: false, error: 'Pass ?slug=<catalog slug>' }, { status: 400 })
  }

  // Resolve the contract from whichever catalog owns it.
  let symbol: string
  let name: string
  let exchange: string
  let quoteBasis: string
  let unit: string | null = null

  if (kind === 'rate') {
    const entry = getRatesEntry(slug)
    if (!entry) return NextResponse.json({ ok: false, error: `Unknown rate slug "${slug}"` }, { status: 404 })
    if (entry.category !== 'future') {
      // A yield index has no forward curve — the Treasury par curve is the
      // curve for those, and /macro/rates already renders it.
      return NextResponse.json(
        { ok: false, error: 'Yield indices have no contract curve — see the Treasury yield curve on /macro/rates' },
        { status: 400 },
      )
    }
    symbol = entry.symbol
    name = entry.name
    exchange = 'CBOT'
    quoteBasis = 'points'
  } else {
    const entry = getCommodity(slug)
    if (!entry) return NextResponse.json({ ok: false, error: `Unknown commodity slug "${slug}"` }, { status: 404 })
    // Thin markets are excluded for the same reason the macro TA scanner
    // excludes them: their months gap enough that a drawn curve would read as
    // a real forward curve when it is mostly absence.
    if (THINLY_TRADED_COMMODITIES.has(entry.symbol)) {
      return NextResponse.json({
        ok: false,
        error: 'Thinly-traded contract — its forward months quote too sparsely to draw an honest curve',
      }, { status: 200 })
    }
    symbol = entry.symbol
    name = entry.name
    exchange = entry.exchange
    quoteBasis = entry.quoteBasis
    unit = entry.unit
  }

  const months = contractMonths(symbol, exchange, MONTHS_AHEAD, new Date())
  if (months.length === 0) {
    return NextResponse.json({
      ok: false,
      error: `No contract-month symbol convention known for ${exchange}`,
    }, { status: 200 })
  }

  const settled = await Promise.allSettled(months.map((m) => fetchMonthPrice(m.symbol)))

  const points: CurvePoint[] = []
  const unresolved: string[] = []
  settled.forEach((res, i) => {
    const month = months[i]
    const price = res.status === 'fulfilled' ? res.value : null
    if (price == null) unresolved.push(month.symbol)
    else points.push({ symbol: month.symbol, label: month.label, monthsOut: month.monthsOut, price })
  })

  recordProviderFetch('yahoo-finance', { count: points.length })

  const body: FuturesCurveResponse = {
    ok: points.length >= MIN_POINTS,
    symbol,
    name,
    quoteBasis,
    unit,
    updatedAt: new Date().toISOString(),
    points,
    analysis: points.length >= MIN_POINTS ? analyzeCurve(points) : null,
    unresolved,
  }
  if (!body.ok) {
    body.error = `Only ${points.length} forward month${points.length === 1 ? '' : 's'} resolved — too few to describe a curve`
  }
  return NextResponse.json(body)
}
