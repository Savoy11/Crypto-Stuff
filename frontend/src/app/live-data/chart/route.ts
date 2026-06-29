import { NextRequest, NextResponse } from 'next/server'
import { coingeckoIdFor } from '@/lib/api/live/coingeckoIds'

// Server-side proxy for CoinGecko market_chart history. Maps the platform's
// internal asset id to a CoinGecko coin id, fetches daily price/volume series,
// and normalizes it to the chart component's candle shape.
//
// Query params:
//   id   = internal asset id (e.g. "btc")
//   days = lookback window in days (default 365)
//
// Response shape:
//   { ok: boolean, candles: PriceCandle[] }
// where PriceCandle = { date, open, high, low, close, volume } and volume is USD millions.

export const revalidate = 300

const BASE_URL = process.env.COINGECKO_BASE_URL?.replace(/\/$/, '') || 'https://api.coingecko.com/api/v3'
const API_KEY = process.env.COINGECKO_API_KEY && process.env.COINGECKO_API_KEY !== 'your-coingecko-api-key'
  ? process.env.COINGECKO_API_KEY
  : undefined

interface MarketChart {
  prices: [number, number][]
  total_volumes: [number, number][]
}

function toDateString(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id') ?? ''
  const daysParam = request.nextUrl.searchParams.get('days') ?? '365'
  const days = Number.isFinite(Number(daysParam)) && Number(daysParam) > 0 ? daysParam : '365'

  const cgId = coingeckoIdFor(id)
  if (!cgId) {
    return NextResponse.json({ ok: false, candles: [], error: 'unmapped' }, { status: 200 })
  }

  const params = new URLSearchParams({ vs_currency: 'usd', days })
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (API_KEY) headers['x-cg-demo-api-key'] = API_KEY

  try {
    const res = await fetch(`${BASE_URL}/coins/${cgId}/market_chart?${params.toString()}`, {
      headers,
      next: { revalidate: 300 },
    })

    if (!res.ok) {
      return NextResponse.json({ ok: false, candles: [], error: `upstream ${res.status}` }, { status: 200 })
    }

    const data = (await res.json()) as MarketChart
    const volumeByDate = new Map<string, number>()
    for (const [ms, vol] of data.total_volumes ?? []) {
      volumeByDate.set(toDateString(ms), vol)
    }

    const candles = (data.prices ?? []).map(([ms, price]) => {
      const date = toDateString(ms)
      const volUsd = volumeByDate.get(date) ?? 0
      return {
        date,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: volUsd / 1e6,
      }
    })

    return NextResponse.json({ ok: true, candles })
  } catch {
    return NextResponse.json({ ok: false, candles: [], error: 'fetch_failed' }, { status: 200 })
  }
}
