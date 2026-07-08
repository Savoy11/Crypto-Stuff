import { NextRequest, NextResponse } from 'next/server'
import type { OhlcvCandle } from '@/lib/utils/indicators'

// OHLCV proxy for equities / ETFs / mutual funds — Yahoo Finance chart API,
// FMP fallback when a key is configured. Mirrors /live-data/ohlcv (crypto).
//   GET /live-data/security-ohlcv?symbol=AAPL&range=1Y
//
// Response: { ok, symbol, range, candles: OhlcvCandle[], source }

export const dynamic = 'force-dynamic'

const FMP_KEY = process.env.FMP_API_KEY && process.env.FMP_API_KEY !== 'your-fmp-api-key'
  ? process.env.FMP_API_KEY : undefined

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/json',
}

const RANGE_CONFIG: Record<string, { yahooRange: string; interval: string; revalidate: number }> = {
  '1M':  { yahooRange: '1mo', interval: '1d',  revalidate: 300 },
  '3M':  { yahooRange: '3mo', interval: '1d',  revalidate: 900 },
  '6M':  { yahooRange: '6mo', interval: '1d',  revalidate: 900 },
  '1Y':  { yahooRange: '1y',  interval: '1d',  revalidate: 900 },
  '5Y':  { yahooRange: '5y',  interval: '1wk', revalidate: 3600 },
  'MAX': { yahooRange: 'max', interval: '1mo', revalidate: 3600 },
}

export interface SecurityOhlcvResponse {
  ok: boolean
  symbol: string
  range: string
  candles: OhlcvCandle[]
  source: 'yahoo' | 'fmp' | 'none'
  error?: string
}

async function fetchYahooOhlcv(symbol: string, range: string): Promise<OhlcvCandle[]> {
  const cfg = RANGE_CONFIG[range]
  const params = new URLSearchParams({ range: cfg.yahooRange, interval: cfg.interval })
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${params}`,
    { headers: BROWSER_HEADERS, next: { revalidate: cfg.revalidate } }
  )
  if (!res.ok) throw new Error(`Yahoo ${res.status}`)
  const payload = await res.json() as {
    chart?: { result?: Array<{
      timestamp?: number[]
      indicators?: { quote?: Array<{
        open?: Array<number | null>; high?: Array<number | null>
        low?: Array<number | null>; close?: Array<number | null>
        volume?: Array<number | null>
      }> }
    }> }
  }
  const result = payload.chart?.result?.[0]
  const quote = result?.indicators?.quote?.[0]
  if (!result?.timestamp || !quote) throw new Error('Yahoo: empty result')
  const candles: OhlcvCandle[] = []
  result.timestamp.forEach((t, i) => {
    const open = quote.open?.[i]; const high = quote.high?.[i]
    const low = quote.low?.[i];   const close = quote.close?.[i]
    if (open == null || high == null || low == null || close == null) return
    candles.push({ time: t, open, high, low, close, volume: quote.volume?.[i] ?? 0 })
  })
  if (candles.length === 0) throw new Error('Yahoo: no candles')
  return candles
}

async function fetchFmpOhlcv(symbol: string, range: string): Promise<OhlcvCandle[]> {
  if (!FMP_KEY) throw new Error('FMP key not configured')
  const days: Record<string, number> = { '1M': 22, '3M': 66, '6M': 130, '1Y': 260, '5Y': 1300, 'MAX': 10000 }
  const res = await fetch(
    `https://financialmodelingprep.com/api/v3/historical-price-full/${encodeURIComponent(symbol)}?timeseries=${days[range]}&apikey=${FMP_KEY}`,
    { next: { revalidate: 900 } }
  )
  if (!res.ok) throw new Error(`FMP ${res.status}`)
  const payload = await res.json() as {
    historical?: Array<{ date: string; open: number; high: number; low: number; close: number; volume: number }>
  }
  if (!payload.historical?.length) throw new Error('FMP: empty result')
  return payload.historical
    .map((row) => ({
      time: Math.floor(new Date(row.date).getTime() / 1000),
      open: row.open, high: row.high, low: row.low, close: row.close,
      volume: row.volume ?? 0,
    }))
    .sort((a, b) => a.time - b.time)
}

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol')?.trim().toUpperCase()
  const range = (request.nextUrl.searchParams.get('range') ?? '1Y').toUpperCase()

  if (!symbol) {
    return NextResponse.json({ ok: false, error: 'Pass ?symbol=AAPL' }, { status: 400 })
  }
  if (!RANGE_CONFIG[range]) {
    return NextResponse.json(
      { ok: false, error: `range must be one of ${Object.keys(RANGE_CONFIG).join(', ')}` },
      { status: 400 }
    )
  }

  try {
    const candles = await fetchYahooOhlcv(symbol, range)
    return NextResponse.json({ ok: true, symbol, range, candles, source: 'yahoo' } satisfies SecurityOhlcvResponse)
  } catch {
    try {
      const candles = await fetchFmpOhlcv(symbol, range)
      return NextResponse.json({ ok: true, symbol, range, candles, source: 'fmp' } satisfies SecurityOhlcvResponse)
    } catch {
      return NextResponse.json({
        ok: false, symbol, range, candles: [], source: 'none', error: 'fetch_failed',
      } satisfies SecurityOhlcvResponse)
    }
  }
}
