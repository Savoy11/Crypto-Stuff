import { NextRequest, NextResponse } from 'next/server'
import type { OhlcvCandle } from '@/lib/utils/indicators'
import { getEquityOhlcvProviders, getProviderKey, recordProviderFetch } from '@/lib/api/live/providers'
import { fetchCustomUrl, findArray, pickNumber, type ActiveCustom } from '@/lib/server/customFeeds'

// OHLCV proxy for equities / ETFs / mutual funds — feeds the TA and backtest
// pages. REGISTRY-DRIVEN ladder (getEquityOhlcvProviders): user-added custom
// json-ohlcv feeds first, then Yahoo Finance → Tiingo → FMP as enabled/keyed
// on the Integrations page. Mirrors /live-data/ohlcv (crypto).
//   GET /live-data/security-ohlcv?symbol=AAPL&range=1Y
//
// Response: { ok, symbol, range, candles: OhlcvCandle[], source }

export const dynamic = 'force-dynamic'

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
  /** Provider id that served the candles ('yahoo-finance', 'tiingo', 'fmp', 'custom-…') or 'none'. */
  source: string
  error?: string
}

const RANGE_DAYS: Record<string, number> = { '1M': 22, '3M': 66, '6M': 130, '1Y': 260, '5Y': 1300, 'MAX': 10000 }

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
  // UI-saved key (Integrations page) or FMP_API_KEY env var. FMP's free tier
  // uses the /stable API; the legacy /api/v3 endpoints are retired (403).
  const FMP_KEY = getProviderKey('fmp')
  if (!FMP_KEY) throw new Error('FMP key not configured')
  const res = await fetch(
    `https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${encodeURIComponent(symbol)}&apikey=${FMP_KEY}`,
    { next: { revalidate: 900 } }
  )
  if (!res.ok) throw new Error(`FMP ${res.status}`)
  const rows = await res.json() as Array<{ date: string; open: number; high: number; low: number; close: number; volume: number }>
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('FMP: empty result')
  return rows
    .map((row) => ({
      time: Math.floor(new Date(row.date).getTime() / 1000),
      open: row.open, high: row.high, low: row.low, close: row.close,
      volume: row.volume ?? 0,
    }))
    .sort((a, b) => a.time - b.time)
    .slice(-RANGE_DAYS[range])
}

async function fetchTiingoOhlcv(symbol: string, range: string): Promise<OhlcvCandle[]> {
  const key = getProviderKey('tiingo')
  if (!key) throw new Error('Tiingo key not configured')
  const start = new Date(Date.now() - RANGE_DAYS[range] * 1.5 * 86_400_000).toISOString().slice(0, 10)
  const res = await fetch(
    `https://api.tiingo.com/tiingo/daily/${encodeURIComponent(symbol.toLowerCase())}/prices?startDate=${start}&token=${key}`,
    { headers: { Accept: 'application/json' }, next: { revalidate: 900 } }
  )
  if (!res.ok) throw new Error(`Tiingo ${res.status}`)
  const rows = await res.json() as Array<{ date: string; open: number; high: number; low: number; close: number; volume: number }>
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('Tiingo: empty result')
  return rows
    .map((row) => ({
      time: Math.floor(new Date(row.date).getTime() / 1000),
      open: row.open, high: row.high, low: row.low, close: row.close,
      volume: row.volume ?? 0,
    }))
    .sort((a, b) => a.time - b.time)
}

// Custom json-ohlcv feeds: URL with {symbol} (and optional {range}); the
// response must contain an array of candles — time/OHLC fields are
// auto-detected or mapped via jsonFieldMap.
async function fetchCustomOhlcv(provider: ActiveCustom, symbol: string, range: string): Promise<OhlcvCandle[]> {
  const url = provider.url.replace('{symbol}', encodeURIComponent(symbol)).replace('{range}', range)
  const res = await fetchCustomUrl(provider, url, 900)
  const map = provider.jsonFieldMap ?? {}
  const candles: OhlcvCandle[] = []
  for (const entry of findArray(await res.json(), provider.jsonArrayPath)) {
    const rawTime = pickNumber(entry, map.time, ['time', 't', 'timestamp'])
    let time: number | null = rawTime != null ? (rawTime > 1e12 ? Math.floor(rawTime / 1000) : Math.floor(rawTime)) : null
    if (time == null) {
      const dateStr = entry && typeof entry === 'object' ? (entry as Record<string, unknown>)[map.date ?? 'date'] : null
      if (typeof dateStr === 'string') {
        const ms = Date.parse(dateStr)
        if (!isNaN(ms)) time = Math.floor(ms / 1000)
      }
    }
    const open = pickNumber(entry, map.open, ['open', 'o'])
    const high = pickNumber(entry, map.high, ['high', 'h'])
    const low = pickNumber(entry, map.low, ['low', 'l'])
    const close = pickNumber(entry, map.close, ['close', 'c'])
    if (time == null || open == null || high == null || low == null || close == null) continue
    candles.push({ time, open, high, low, close, volume: pickNumber(entry, map.volume, ['volume', 'v']) ?? 0 })
  }
  if (candles.length === 0) throw new Error('Custom feed returned no usable candles')
  return candles.sort((a, b) => a.time - b.time)
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

  for (const provider of getEquityOhlcvProviders()) {
    try {
      const candles = provider.isCustom
        ? await fetchCustomOhlcv(provider, symbol, range)
        : provider.id === 'yahoo-finance' ? await fetchYahooOhlcv(symbol, range)
        : provider.id === 'tiingo' ? await fetchTiingoOhlcv(symbol, range)
        : await fetchFmpOhlcv(symbol, range)
      recordProviderFetch(provider.id, { count: candles.length })
      return NextResponse.json({ ok: true, symbol, range, candles, source: provider.id } satisfies SecurityOhlcvResponse)
    } catch (e) {
      recordProviderFetch(provider.id, { error: e instanceof Error ? e.message : String(e) })
    }
  }

  return NextResponse.json({
    ok: false, symbol, range, candles: [], source: 'none', error: 'fetch_failed',
  } satisfies SecurityOhlcvResponse)
}
