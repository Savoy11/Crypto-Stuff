import { NextRequest, NextResponse } from 'next/server'
import { getCommodity, THINLY_TRADED_COMMODITIES } from '@/lib/data/commodityCatalog'
import { getRatesEntry } from '@/lib/data/ratesCatalog'
import { contractMonths, type CurvePoint, type CurveAnalysis } from '@/lib/data/termStructure'

// Futures term structure (P2-O4) — the forward curve for one contract.
//   GET /live-data/futures-curve?slug=gold          (commodity slug)
//   GET /live-data/futures-curve?slug=10-year-note-future&kind=rate
//
// ⚠ THIS SURFACE HAS NO SOURCE AS OF 2026-08-06 AND REPORTS SO.
//
// Individual contract months (CLU26.NYM, GCZ26.CMX, ZCH27.CBT) resolved through
// Yahoo's v8 chart API — verified 9/9 across NYMEX, COMEX and CBOT by the P2-O1
// audit (owner machine, 2026-08-05). Yahoo was then removed as a data source on
// terms grounds (lib/server/sourceTerms.ts), and NOTHING ELSE THE APP CAN REACH
// QUOTES A DATED CONTRACT MONTH: FMP, Tiingo, Finnhub, Twelve Data and Alpha
// Vantage all cover continuous front-months at best, and the exchanges' own
// settlement files are licensed.
//
// The route is kept, and kept honest: it still resolves the slug, still refuses
// thin contracts and yield indices for the reasons it always did, and then
// returns ok:false with a plain explanation. TermStructureCard already renders
// `error` verbatim, so the section says why there is no curve instead of
// vanishing — which would read as "this contract has no forward curve".
//
// To bring it back: add a provider that quotes dated contract months, restore
// a `fetchMonthPrice` against it, and delete CURVE_UNAVAILABLE. The month-symbol
// machinery in lib/data/termStructure.ts is untouched and still tested.

export const dynamic = 'force-dynamic'

/** How many calendar months forward to request. */
const MONTHS_AHEAD = 8

/** Shown verbatim by TermStructureCard. Says what is missing and why. */
const CURVE_UNAVAILABLE =
  'Forward curves are unavailable. Pricing individual contract months needs a provider that quotes dated contracts, and the one Finance Now used was withdrawn on terms grounds — no remaining free source quotes them. Front-month prices on this page are unaffected.'

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

  // The months resolve fine; there is simply nowhere left to price them.
  // Reporting them under `unresolved` keeps the response shape meaningful and
  // shows a reader exactly which contracts a restored provider would need.
  return NextResponse.json({
    ok: false,
    symbol,
    name,
    quoteBasis,
    unit,
    updatedAt: new Date().toISOString(),
    points: [],
    analysis: null,
    unresolved: months.map((m) => m.symbol),
    error: CURVE_UNAVAILABLE,
  } satisfies FuturesCurveResponse)
}
