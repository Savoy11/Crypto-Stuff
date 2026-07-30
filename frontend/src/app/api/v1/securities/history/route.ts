import { NextRequest, NextResponse } from 'next/server'
import { CORS, options } from '../../../_cors'
import { fetchSecurityChart, type ChartRange } from '@/lib/api/live/marketData'

// Public agent API — price history for any Yahoo-quotable symbol (stocks,
// ETFs, mutual funds, futures, FX pairs, yield indices). Close-only series;
// for full OHLCV candles agents should use the app's TA tools, which read
// /live-data/security-ohlcv.

export const dynamic = 'force-dynamic'
export { options as OPTIONS }

const VALID_RANGES: ChartRange[] = ['1mo', '3mo', '6mo', '1y', '5y', 'max']

export interface V1SecurityHistoryResponse {
  symbol: string
  range: ChartRange
  currency: string
  /** [ISO date, close] pairs, oldest first. */
  points: Array<{ date: string; close: number }>
  previousClose: number | null
  fiftyTwoWeekHigh: number | null
  fiftyTwoWeekLow: number | null
  updatedAt: string
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')?.trim().toUpperCase()
  const range = (req.nextUrl.searchParams.get('range') ?? '1y') as ChartRange

  if (!symbol) {
    return NextResponse.json({ error: 'Pass ?symbol=AAPL (Yahoo notation).' }, { status: 400, headers: CORS })
  }
  if (!VALID_RANGES.includes(range)) {
    return NextResponse.json(
      { error: `range must be one of ${VALID_RANGES.join(', ')}` },
      { status: 400, headers: CORS },
    )
  }

  try {
    const chart = await fetchSecurityChart(symbol, range)
    return NextResponse.json({
      symbol: chart.symbol,
      range: chart.range,
      currency: chart.currency,
      points: chart.points.map((p) => ({ date: new Date(p.t).toISOString().slice(0, 10), close: p.close })),
      previousClose: chart.previousClose,
      fiftyTwoWeekHigh: chart.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: chart.fiftyTwoWeekLow,
      updatedAt: new Date().toISOString(),
    } satisfies V1SecurityHistoryResponse, { headers: CORS })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : `no price history available for ${symbol}` },
      { status: 502, headers: CORS },
    )
  }
}
