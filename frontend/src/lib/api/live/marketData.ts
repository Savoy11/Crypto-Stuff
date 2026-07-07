// Server-side quote fetchers for equities, ETFs, and mutual funds.
// Used only by /live-data/security-* route handlers — never import from
// client components.
//
// Source ladder (first success wins):
//   1. Financial Modeling Prep — only when FMP_API_KEY is set (richest data)
//   2. Yahoo Finance spark API — keyless, batched, covers stocks/ETFs/funds
//   3. Stooq CSV — keyless batch fallback (intraday change approximation)
// Route handlers fall through to static catalog reference prices when every
// live source fails, so pages always render.

export interface SecurityQuote {
  symbol: string
  price: number
  /** Absolute change vs previous close (Stooq: vs today's open). */
  change: number | null
  changePercent: number | null
  previousClose: number | null
  marketCap: number | null
  volume: number | null
}

export type QuoteSource = 'fmp' | 'yahoo' | 'stooq' | 'reference'

const FMP_KEY = process.env.FMP_API_KEY && process.env.FMP_API_KEY !== 'your-fmp-api-key'
  ? process.env.FMP_API_KEY : undefined

// Yahoo occasionally rejects the default undici UA.
const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export function hasFmpKey(): boolean {
  return !!FMP_KEY
}

// ─── FMP ──────────────────────────────────────────────────────────────────────

export async function fetchFmpQuotes(symbols: string[]): Promise<Record<string, SecurityQuote>> {
  if (!FMP_KEY) throw new Error('FMP key not configured')
  const quotes: Record<string, SecurityQuote> = {}
  for (const group of chunk(symbols, 100)) {
    const res = await fetch(
      `https://financialmodelingprep.com/api/v3/quote/${group.join(',')}?apikey=${FMP_KEY}`,
      { next: { revalidate: 60 } }
    )
    if (!res.ok) throw new Error(`FMP ${res.status}`)
    const rows = await res.json() as Array<{
      symbol: string; price: number | null; change: number | null
      changesPercentage: number | null; previousClose: number | null
      marketCap: number | null; volume: number | null
    }>
    for (const row of rows) {
      if (row.price == null) continue
      quotes[row.symbol.toUpperCase()] = {
        symbol: row.symbol.toUpperCase(),
        price: row.price,
        change: row.change ?? null,
        changePercent: row.changesPercentage ?? null,
        previousClose: row.previousClose ?? null,
        marketCap: row.marketCap ?? null,
        volume: row.volume ?? null,
      }
    }
  }
  if (Object.keys(quotes).length === 0) throw new Error('FMP returned no quotes')
  return quotes
}

// ─── Yahoo spark ──────────────────────────────────────────────────────────────

interface SparkSeries {
  symbol: string
  closes: number[]
  previousClose: number | null
  marketPrice: number | null
}

function parseSparkPayload(payload: unknown): SparkSeries[] {
  const series: SparkSeries[] = []
  if (!payload || typeof payload !== 'object') return series
  const root = payload as Record<string, unknown>

  // Shape A: { spark: { result: [{ symbol, response: [{ meta, indicators }] }] } }
  const spark = root.spark as { result?: Array<Record<string, unknown>> } | undefined
  if (spark?.result) {
    for (const entry of spark.result) {
      const symbol = String(entry.symbol ?? '')
      const response = (entry.response as Array<Record<string, unknown>> | undefined)?.[0]
      if (!symbol || !response) continue
      const meta = response.meta as Record<string, unknown> | undefined
      const quote = ((response.indicators as Record<string, unknown> | undefined)
        ?.quote as Array<Record<string, unknown>> | undefined)?.[0]
      const closes = ((quote?.close ?? []) as Array<number | null>).filter((c): c is number => c != null)
      series.push({
        symbol,
        closes,
        previousClose: typeof meta?.chartPreviousClose === 'number' ? meta.chartPreviousClose : null,
        marketPrice: typeof meta?.regularMarketPrice === 'number' ? meta.regularMarketPrice : null,
      })
    }
    return series
  }

  // Shape B: { AAPL: { symbol, close: [...], chartPreviousClose } }
  for (const [key, value] of Object.entries(root)) {
    if (!value || typeof value !== 'object') continue
    const entry = value as Record<string, unknown>
    const closes = ((entry.close ?? []) as Array<number | null>).filter((c): c is number => c != null)
    if (closes.length === 0) continue
    series.push({
      symbol: String(entry.symbol ?? key),
      closes,
      previousClose: typeof entry.chartPreviousClose === 'number' ? entry.chartPreviousClose
        : typeof entry.previousClose === 'number' ? entry.previousClose : null,
      marketPrice: null,
    })
  }
  return series
}

export async function fetchYahooQuotes(symbols: string[]): Promise<Record<string, SecurityQuote>> {
  const quotes: Record<string, SecurityQuote> = {}
  for (const group of chunk(symbols, 20)) {
    const params = new URLSearchParams({
      symbols: group.join(','), range: '5d', interval: '1d',
      includeTimestamps: 'false',
    })
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/spark?${params}`, {
      headers: BROWSER_HEADERS, next: { revalidate: 60 },
    })
    if (!res.ok) throw new Error(`Yahoo spark ${res.status}`)
    for (const s of parseSparkPayload(await res.json())) {
      const price = s.marketPrice ?? s.closes[s.closes.length - 1]
      if (price == null) continue
      const prev = s.closes.length >= 2 && s.closes[s.closes.length - 1] === price
        ? s.closes[s.closes.length - 2]
        : s.previousClose ?? (s.closes.length >= 1 ? s.closes[s.closes.length - 1] : null)
      const change = prev != null ? price - prev : null
      quotes[s.symbol.toUpperCase()] = {
        symbol: s.symbol.toUpperCase(),
        price,
        change,
        changePercent: change != null && prev ? (change / prev) * 100 : null,
        previousClose: prev,
        marketCap: null,
        volume: null,
      }
    }
  }
  if (Object.keys(quotes).length === 0) throw new Error('Yahoo returned no quotes')
  return quotes
}

// ─── Stooq ────────────────────────────────────────────────────────────────────

export async function fetchStooqQuotes(symbols: string[]): Promise<Record<string, SecurityQuote>> {
  const quotes: Record<string, SecurityQuote> = {}
  for (const group of chunk(symbols, 40)) {
    const stooqSymbols = group.map((s) => `${s.toLowerCase()}.us`).join(',')
    const res = await fetch(
      `https://stooq.com/q/l/?s=${stooqSymbols}&f=sd2t2ohlcv&h&e=csv`,
      { headers: BROWSER_HEADERS, next: { revalidate: 60 } }
    )
    if (!res.ok) throw new Error(`Stooq ${res.status}`)
    const lines = (await res.text()).trim().split('\n').slice(1) // drop header
    for (const line of lines) {
      const [rawSymbol, , , open, , , close, volume] = line.split(',')
      const price = parseFloat(close)
      const openPrice = parseFloat(open)
      if (!rawSymbol || !isFinite(price)) continue
      const symbol = rawSymbol.replace(/\.US$/i, '').toUpperCase()
      // Stooq has no previous close in this format — change is vs today's open.
      const change = isFinite(openPrice) ? price - openPrice : null
      quotes[symbol] = {
        symbol,
        price,
        change,
        changePercent: change != null && openPrice ? (change / openPrice) * 100 : null,
        previousClose: null,
        marketCap: null,
        volume: isFinite(parseFloat(volume)) ? parseFloat(volume) : null,
      }
    }
  }
  if (Object.keys(quotes).length === 0) throw new Error('Stooq returned no quotes')
  return quotes
}

// ─── Combined ladder ──────────────────────────────────────────────────────────

export async function fetchSecurityQuotes(
  symbols: string[]
): Promise<{ quotes: Record<string, SecurityQuote>; source: QuoteSource }> {
  if (FMP_KEY) {
    try { return { quotes: await fetchFmpQuotes(symbols), source: 'fmp' } } catch { /* fall through */ }
  }
  try { return { quotes: await fetchYahooQuotes(symbols), source: 'yahoo' } } catch { /* fall through */ }
  return { quotes: await fetchStooqQuotes(symbols), source: 'stooq' }
}

// ─── History (charts) ─────────────────────────────────────────────────────────

export type ChartRange = '1mo' | '3mo' | '6mo' | '1y' | '5y' | 'max'

export interface ChartPoint { t: number; close: number }

export interface SecurityChart {
  symbol: string
  range: ChartRange
  points: ChartPoint[]
  previousClose: number | null
  fiftyTwoWeekHigh: number | null
  fiftyTwoWeekLow: number | null
  currency: string
}

const RANGE_INTERVAL: Record<ChartRange, string> = {
  '1mo': '1d', '3mo': '1d', '6mo': '1d', '1y': '1d', '5y': '1wk', 'max': '1mo',
}

export async function fetchYahooChart(symbol: string, range: ChartRange): Promise<SecurityChart> {
  const params = new URLSearchParams({ range, interval: RANGE_INTERVAL[range], events: 'div,splits' })
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${params}`,
    { headers: BROWSER_HEADERS, next: { revalidate: 300 } }
  )
  if (!res.ok) throw new Error(`Yahoo chart ${res.status}`)
  const payload = await res.json() as {
    chart?: { result?: Array<{
      meta?: {
        chartPreviousClose?: number; currency?: string
        fiftyTwoWeekHigh?: number; fiftyTwoWeekLow?: number
      }
      timestamp?: number[]
      indicators?: { quote?: Array<{ close?: Array<number | null> }> }
    }> }
  }
  const result = payload.chart?.result?.[0]
  if (!result?.timestamp) throw new Error('Yahoo chart: empty result')
  const closes = result.indicators?.quote?.[0]?.close ?? []
  const points: ChartPoint[] = []
  result.timestamp.forEach((t, i) => {
    const close = closes[i]
    if (close != null) points.push({ t: t * 1000, close })
  })
  if (points.length === 0) throw new Error('Yahoo chart: no points')
  return {
    symbol: symbol.toUpperCase(),
    range,
    points,
    previousClose: result.meta?.chartPreviousClose ?? null,
    fiftyTwoWeekHigh: result.meta?.fiftyTwoWeekHigh ?? null,
    fiftyTwoWeekLow: result.meta?.fiftyTwoWeekLow ?? null,
    currency: result.meta?.currency ?? 'USD',
  }
}

export async function fetchFmpChart(symbol: string, range: ChartRange): Promise<SecurityChart> {
  if (!FMP_KEY) throw new Error('FMP key not configured')
  const days: Record<ChartRange, number> = { '1mo': 22, '3mo': 66, '6mo': 130, '1y': 260, '5y': 1300, 'max': 10000 }
  const res = await fetch(
    `https://financialmodelingprep.com/api/v3/historical-price-full/${encodeURIComponent(symbol)}?serietype=line&timeseries=${days[range]}&apikey=${FMP_KEY}`,
    { next: { revalidate: 300 } }
  )
  if (!res.ok) throw new Error(`FMP chart ${res.status}`)
  const payload = await res.json() as { historical?: Array<{ date: string; close: number }> }
  if (!payload.historical?.length) throw new Error('FMP chart: empty result')
  const points = payload.historical
    .map((row) => ({ t: new Date(row.date).getTime(), close: row.close }))
    .sort((a, b) => a.t - b.t)
  const closes = points.map((p) => p.close)
  return {
    symbol: symbol.toUpperCase(),
    range,
    points,
    previousClose: closes.length >= 2 ? closes[closes.length - 2] : null,
    fiftyTwoWeekHigh: Math.max(...closes.slice(-260)),
    fiftyTwoWeekLow: Math.min(...closes.slice(-260)),
    currency: 'USD',
  }
}

export async function fetchSecurityChart(symbol: string, range: ChartRange): Promise<SecurityChart> {
  try {
    return await fetchYahooChart(symbol, range)
  } catch (err) {
    if (FMP_KEY) return fetchFmpChart(symbol, range)
    throw err
  }
}
