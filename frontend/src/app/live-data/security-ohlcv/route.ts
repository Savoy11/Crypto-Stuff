import { NextRequest, NextResponse } from 'next/server'
import type { OhlcvCandle } from '@/lib/utils/indicators'
import { getEquityOhlcvProviders, getProviderKey, recordProviderFetch } from '@/lib/api/live/providers'
import { fetchCustomUrl, findArray, pickNumber, type ActiveCustom } from '@/lib/server/customFeeds'
import { adjustCandles } from '@/lib/utils/ohlcvAdjust'

// OHLCV proxy for equities / ETFs / mutual funds — feeds the TA and backtest
// pages. REGISTRY-DRIVEN ladder (getEquityOhlcvProviders): user-added custom
// json-ohlcv feeds first, then Tiingo → FMP as enabled/keyed on the
// Integrations page. Mirrors /live-data/ohlcv (crypto).
//   GET /live-data/security-ohlcv?symbol=AAPL&range=1Y
//
// Response: { ok, symbol, range, candles: OhlcvCandle[], source }
//
// ⚠ BOTH BUILT-IN RUNGS ARE KEYED. Yahoo Finance headed this ladder, keylessly,
// until 2026-08-06, when it was removed on terms grounds (see
// lib/server/sourceTerms.ts). With no Tiingo or FMP key the route returns
// ok:false / source:'none' and the TA, backtest and candlestick surfaces show
// their "no live source" state. Do not paper over that with synthetic candles.

export const dynamic = 'force-dynamic'

/** Ranges the route accepts, and how long each is cached. */
const RANGE_CONFIG: Record<string, { revalidate: number }> = {
  '1M':  { revalidate: 300 },
  '3M':  { revalidate: 900 },
  '6M':  { revalidate: 900 },
  '1Y':  { revalidate: 900 },
  '5Y':  { revalidate: 3600 },
  'MAX': { revalidate: 3600 },
}

export interface SecurityOhlcvResponse {
  ok: boolean
  symbol: string
  range: string
  candles: OhlcvCandle[]
  /** Provider id that served the candles ('tiingo', 'fmp', 'custom-…') or 'none'. */
  source: string
  error?: string
}

const RANGE_DAYS: Record<string, number> = { '1M': 22, '3M': 66, '6M': 130, '1Y': 260, '5Y': 1300, 'MAX': 10000 }

async function fetchFmpOhlcv(symbol: string, range: string): Promise<OhlcvCandle[]> {
  // UI-saved key (Integrations page) or FMP_API_KEY env var. FMP's free tier
  // uses the /stable API; the legacy /api/v3 endpoints are retired (403).
  const FMP_KEY = getProviderKey('fmp')
  if (!FMP_KEY) throw new Error('FMP key not configured')
  const res = await fetch(
    `https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${encodeURIComponent(symbol)}&apikey=${FMP_KEY}`,
    { next: { revalidate: RANGE_CONFIG[range].revalidate } }
  )
  if (!res.ok) throw new Error(`FMP ${res.status}`)
  // `adjClose` (split+dividend adjusted) is used when present so a split isn't a
  // cliff and FMP matches Tiingo's adjusted basis. NOTE: whether the
  // `/stable/historical-price-eod/full` payload carries adjClose varies by plan;
  // when absent we fall back to raw close (factor 1). If a split stock still
  // shows a cliff on the FMP path, switch to /stable/historical-price-eod/
  // dividend-adjusted — verify live with a key (see T11 assessment).
  const rows = await res.json() as Array<{
    date: string; open: number; high: number; low: number; close: number; volume: number; adjClose?: number
  }>
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('FMP: empty result')
  const sorted = rows
    .map((row) => ({
      raw: {
        time: Math.floor(new Date(row.date).getTime() / 1000),
        open: row.open, high: row.high, low: row.low, close: row.close,
        volume: row.volume ?? 0,
      } as OhlcvCandle,
      adjClose: row.adjClose,
    }))
    .sort((a, b) => a.raw.time - b.raw.time)
    .slice(-RANGE_DAYS[range])
  return adjustCandles(sorted.map((s) => s.raw), sorted.map((s) => s.adjClose))
}

async function fetchTiingoOhlcv(symbol: string, range: string): Promise<OhlcvCandle[]> {
  const key = getProviderKey('tiingo')
  if (!key) throw new Error('Tiingo key not configured')
  const start = new Date(Date.now() - RANGE_DAYS[range] * 1.5 * 86_400_000).toISOString().slice(0, 10)
  const res = await fetch(
    `https://api.tiingo.com/tiingo/daily/${encodeURIComponent(symbol.toLowerCase())}/prices?startDate=${start}&token=${key}`,
    { headers: { Accept: 'application/json' }, next: { revalidate: RANGE_CONFIG[range].revalidate } }
  )
  if (!res.ok) throw new Error(`Tiingo ${res.status}`)
  // Tiingo returns both raw (open/high/low/close/volume) and split+dividend
  // adjusted (adj*) fields. Use the adjusted set so a split is a continuous
  // series (not a cliff) and the output matches FMP's adjusted basis.
  const rows = await res.json() as Array<{
    date: string; open: number; high: number; low: number; close: number; volume: number
    adjOpen?: number; adjHigh?: number; adjLow?: number; adjClose?: number; adjVolume?: number
  }>
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('Tiingo: empty result')
  return rows
    .map((row) => ({
      time: Math.floor(new Date(row.date).getTime() / 1000),
      open: row.adjOpen ?? row.open, high: row.adjHigh ?? row.high,
      low: row.adjLow ?? row.low, close: row.adjClose ?? row.close,
      volume: row.adjVolume ?? row.volume ?? 0,
    }))
    .sort((a, b) => a.time - b.time)
}

// Custom json-ohlcv feeds: URL with {symbol} (and optional {range}); the
// response must contain an array of candles — time/OHLC fields are
// auto-detected or mapped via jsonFieldMap.
async function fetchCustomOhlcv(provider: ActiveCustom, symbol: string, range: string): Promise<OhlcvCandle[]> {
  const url = provider.url.replace('{symbol}', encodeURIComponent(symbol)).replace('{range}', range)
  const res = await fetchCustomUrl(provider, url, RANGE_CONFIG[range].revalidate)
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
        : provider.id === 'tiingo' ? await fetchTiingoOhlcv(symbol, range)
        : await fetchFmpOhlcv(symbol, range)
      recordProviderFetch(provider.id, { count: candles.length })
      return NextResponse.json({ ok: true, symbol, range, candles, source: provider.id } satisfies SecurityOhlcvResponse)
    } catch (e) {
      recordProviderFetch(provider.id, { error: e instanceof Error ? e.message : String(e) })
    }
  }

  // Distinguish "nothing is configured" from "the configured providers failed".
  // They need different fixes, and 'fetch_failed' sent a reader hunting for a
  // network problem when the actual answer was that no provider had a key.
  const configured = getEquityOhlcvProviders().length > 0
  return NextResponse.json({
    ok: false, symbol, range, candles: [], source: 'none',
    error: configured
      ? 'fetch_failed'
      : 'no_provider_configured: add a Tiingo or FMP API key on the Integrations page',
  } satisfies SecurityOhlcvResponse)
}
