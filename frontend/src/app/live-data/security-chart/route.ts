import { NextRequest, NextResponse } from 'next/server'
import { fetchSecurityChart, type ChartRange, type SecurityChart } from '@/lib/api/live/marketData'

// Server-side proxy for price history of any Yahoo-quotable security
// (stocks, ETFs, mutual funds).
//   GET /live-data/security-chart?symbol=AAPL&range=1y
//
// Response: { ok, updatedAt, chart: SecurityChart } — or ok:false when no
// live source is reachable (the UI shows LiveUnavailable rather than
// fabricating a series).

export const dynamic = 'force-dynamic'

const VALID_RANGES: ChartRange[] = ['1mo', '3mo', '6mo', '1y', '5y', 'max']

export interface SecurityChartResponse {
  ok: boolean
  updatedAt: string | null
  chart: SecurityChart | null
  error?: string
}

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol')?.trim().toUpperCase()
  const range = (request.nextUrl.searchParams.get('range') ?? '1y') as ChartRange

  if (!symbol) {
    return NextResponse.json({ ok: false, error: 'Pass ?symbol=AAPL' }, { status: 400 })
  }
  if (!VALID_RANGES.includes(range)) {
    return NextResponse.json(
      { ok: false, error: `range must be one of ${VALID_RANGES.join(', ')}` },
      { status: 400 }
    )
  }

  try {
    const chart = await fetchSecurityChart(symbol, range)
    return NextResponse.json({
      ok: true, updatedAt: new Date().toISOString(), chart,
    } satisfies SecurityChartResponse)
  } catch {
    return NextResponse.json({
      ok: false, updatedAt: null, chart: null, error: 'fetch_failed',
    } satisfies SecurityChartResponse)
  }
}
