// Server-side quote fetchers for equities, ETFs, and mutual funds.
// Used only by /live-data/security-* route handlers — never import from
// client components.
//
// The source ladder is REGISTRY-DRIVEN (see providers.ts): fetchSecurityQuotes
// walks getEquityQuoteProviders() — user-added custom quote feeds first, then
// built-ins by priority (FMP → Finnhub → Twelve Data → Tiingo → Alpha Vantage
// → Yahoo). Providers are enabled/disabled and keyed from the
// Integrations page; utilization is recorded per attempt so the page shows
// which source is actually serving. Route handlers fall through to static
// catalog reference prices when every live source fails, so pages always render.

import {
  getEquityQuoteProviders,
  getProviderKey,
  recordProviderFetch,
  type AnyActiveProvider,
  type CustomProviderDef,
} from './providers'
import { getEquity } from '@/lib/data/equityCatalog'
import { getFund } from '@/lib/data/fundCatalog'
import { pinnedFetch } from '@/lib/server/pinnedFetch'

export interface SecurityQuote {
  symbol: string
  /** True when this quote is a static catalog reference price, not a live reading. */
  reference?: boolean
  price: number
  /** Absolute change vs previous close. */
  change: number | null
  changePercent: number | null
  previousClose: number | null
  marketCap: number | null
  volume: number | null
}

/** Provider id that served the quotes ('yahoo-finance', 'fmp', 'custom-…') or 'reference'. */
export type QuoteSource = string

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

function requireKey(providerId: string): string {
  const key = getProviderKey(providerId)
  if (!key) throw new Error(`${providerId}: no API key configured`)
  return key
}

// ─── FMP (stable API) ──────────────────────────────────────────────────────────
// FMP retired the legacy /api/v3/* endpoints; the free tier uses /stable/*, and
// crucially only accepts a SINGLE symbol per quote (batch is paid). So FMP is
// used only for small requests (detail pages) where its market-cap/prev-close
// data is worth a per-symbol call; larger batches throw fast and the ladder
// falls to Yahoo (keyless, batched).
const FMP_STABLE = 'https://financialmodelingprep.com/stable'
const FMP_MAX_SYMBOLS = 4

export async function fetchFmpQuotes(symbols: string[]): Promise<Record<string, SecurityQuote>> {
  const key = requireKey('fmp')
  if (symbols.length > FMP_MAX_SYMBOLS) {
    throw new Error(`FMP free tier is single-symbol; skipping ${symbols.length}-symbol batch (use Yahoo)`)
  }
  const quotes: Record<string, SecurityQuote> = {}
  await Promise.all(symbols.map(async (symbol) => {
    const res = await fetch(`${FMP_STABLE}/quote?symbol=${encodeURIComponent(symbol)}&apikey=${key}`, { next: { revalidate: 60 } })
    if (!res.ok) throw new Error(`FMP ${res.status}`)
    const rows = await res.json() as Array<{
      symbol: string; price: number | null; change: number | null
      changePercentage: number | null; previousClose: number | null
      marketCap: number | null; volume: number | null
    }>
    const row = rows[0]
    if (!row || row.price == null) return
    quotes[row.symbol.toUpperCase()] = {
      symbol: row.symbol.toUpperCase(),
      price: row.price,
      change: row.change ?? null,
      changePercent: row.changePercentage ?? null,
      previousClose: row.previousClose ?? null,
      marketCap: row.marketCap ?? null,
      volume: row.volume ?? null,
    }
  }))
  if (Object.keys(quotes).length === 0) throw new Error('FMP returned no quotes')
  return quotes
}

// ─── Finnhub (per-symbol, 60 req/min free) ───────────────────────────────────

export async function fetchFinnhubQuotes(symbols: string[]): Promise<Record<string, SecurityQuote>> {
  const key = requireKey('finnhub')
  if (symbols.length > 60) throw new Error(`Finnhub: batch of ${symbols.length} exceeds the free-tier rate budget (60/min)`)
  const quotes: Record<string, SecurityQuote> = {}
  for (const group of chunk(symbols, 10)) {
    await Promise.all(group.map(async (symbol) => {
      const res = await fetch(
        `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${key}`,
        { next: { revalidate: 60 } }
      )
      if (!res.ok) return
      const q = await res.json() as { c?: number; d?: number | null; dp?: number | null; pc?: number | null }
      if (!q.c) return // 0 = unknown symbol
      quotes[symbol.toUpperCase()] = {
        symbol: symbol.toUpperCase(),
        price: q.c,
        change: q.d ?? null,
        changePercent: q.dp ?? null,
        previousClose: q.pc ?? null,
        marketCap: null,
        volume: null,
      }
    }))
  }
  if (Object.keys(quotes).length === 0) throw new Error('Finnhub returned no quotes')
  return quotes
}

// ─── Twelve Data (batch, 8 credits/min free) ─────────────────────────────────

export async function fetchTwelveDataQuotes(symbols: string[]): Promise<Record<string, SecurityQuote>> {
  const key = requireKey('twelve-data')
  if (symbols.length > 8) throw new Error(`Twelve Data: batch of ${symbols.length} exceeds the free-tier credit budget (8/min)`)
  const res = await fetch(
    `https://api.twelvedata.com/quote?symbol=${symbols.join(',')}&apikey=${key}`,
    { next: { revalidate: 60 } }
  )
  if (!res.ok) throw new Error(`Twelve Data ${res.status}`)
  const payload = await res.json() as Record<string, unknown>

  type TdQuote = { symbol?: string; close?: string; change?: string; percent_change?: string; previous_close?: string; volume?: string }
  const entries: TdQuote[] = symbols.length === 1
    ? [payload as TdQuote]
    : Object.values(payload) as TdQuote[]

  const quotes: Record<string, SecurityQuote> = {}
  for (const q of entries) {
    const price = parseFloat(q?.close ?? '')
    if (!q?.symbol || !isFinite(price)) continue
    quotes[q.symbol.toUpperCase()] = {
      symbol: q.symbol.toUpperCase(),
      price,
      change: isFinite(parseFloat(q.change ?? '')) ? parseFloat(q.change!) : null,
      changePercent: isFinite(parseFloat(q.percent_change ?? '')) ? parseFloat(q.percent_change!) : null,
      previousClose: isFinite(parseFloat(q.previous_close ?? '')) ? parseFloat(q.previous_close!) : null,
      marketCap: null,
      volume: isFinite(parseFloat(q.volume ?? '')) ? parseFloat(q.volume!) : null,
    }
  }
  if (Object.keys(quotes).length === 0) throw new Error('Twelve Data returned no quotes')
  return quotes
}

// ─── Tiingo IEX (batch) ───────────────────────────────────────────────────────

export async function fetchTiingoQuotes(symbols: string[]): Promise<Record<string, SecurityQuote>> {
  const key = requireKey('tiingo')
  const quotes: Record<string, SecurityQuote> = {}
  for (const group of chunk(symbols, 50)) {
    const res = await fetch(
      `https://api.tiingo.com/iex/?tickers=${group.join(',').toLowerCase()}&token=${key}`,
      { headers: { Accept: 'application/json' }, next: { revalidate: 60 } }
    )
    if (!res.ok) throw new Error(`Tiingo ${res.status}`)
    const rows = await res.json() as Array<{
      ticker?: string; last?: number | null; tngoLast?: number | null
      prevClose?: number | null; volume?: number | null
    }>
    for (const row of rows) {
      const price = row.last ?? row.tngoLast
      if (!row.ticker || price == null) continue
      const prev = row.prevClose ?? null
      const change = prev != null ? price - prev : null
      quotes[row.ticker.toUpperCase()] = {
        symbol: row.ticker.toUpperCase(),
        price,
        change,
        changePercent: change != null && prev ? (change / prev) * 100 : null,
        previousClose: prev,
        marketCap: null,
        volume: row.volume ?? null,
      }
    }
  }
  if (Object.keys(quotes).length === 0) throw new Error('Tiingo returned no quotes')
  return quotes
}

// ─── Alpha Vantage (per-symbol, 25 req/DAY free) ─────────────────────────────

export async function fetchAlphaVantageQuotes(symbols: string[]): Promise<Record<string, SecurityQuote>> {
  const key = requireKey('alpha-vantage')
  if (symbols.length > 5) throw new Error(`Alpha Vantage: batch of ${symbols.length} would burn the 25-requests/day free tier`)
  const quotes: Record<string, SecurityQuote> = {}
  await Promise.all(symbols.map(async (symbol) => {
    const res = await fetch(
      `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${key}`,
      { next: { revalidate: 300 } }
    )
    if (!res.ok) return
    const payload = await res.json() as { 'Global Quote'?: Record<string, string> }
    const q = payload['Global Quote']
    const price = parseFloat(q?.['05. price'] ?? '')
    if (!q || !isFinite(price)) return
    const prev = parseFloat(q['08. previous close'] ?? '')
    quotes[symbol.toUpperCase()] = {
      symbol: symbol.toUpperCase(),
      price,
      change: isFinite(parseFloat(q['09. change'] ?? '')) ? parseFloat(q['09. change']) : null,
      changePercent: isFinite(parseFloat(q['10. change percent'] ?? '')) ? parseFloat(q['10. change percent']) : null,
      previousClose: isFinite(prev) ? prev : null,
      marketCap: null,
      volume: isFinite(parseFloat(q['06. volume'] ?? '')) ? parseFloat(q['06. volume']) : null,
    }
  }))
  if (Object.keys(quotes).length === 0) throw new Error('Alpha Vantage returned no quotes')
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
        : (s.closes.length >= 1 ? s.closes[s.closes.length - 1] : s.previousClose)
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

// ─── Custom quote feeds (user-added on the Integrations page) ────────────────

/** Walk a dot-path ("data.last") into an object. */
function dig(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj)
}

/** First finite number found under the mapped path or any default candidate. */
function pickNumber(obj: unknown, mapped: string | undefined, candidates: string[]): number | null {
  for (const path of [mapped, ...candidates]) {
    if (!path) continue
    const v = dig(obj, path)
    const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN
    if (isFinite(n)) return n
  }
  return null
}

function pickString(obj: unknown, candidates: string[]): string | null {
  for (const path of candidates) {
    const v = dig(obj, path)
    if (typeof v === 'string' && v) return v
  }
  return null
}

function toQuote(obj: unknown, symbol: string, map: Record<string, string>): SecurityQuote | null {
  const price = pickNumber(obj, map.price, ['price', 'last', 'close', 'c', 'regularMarketPrice', 'latestPrice'])
  if (price == null) return null
  const previousClose = pickNumber(obj, map.previousClose, ['previousClose', 'prevClose', 'previous_close', 'pc'])
  let change = pickNumber(obj, map.change, ['change', 'd'])
  let changePercent = pickNumber(obj, map.changePercent, ['changePercent', 'percent_change', 'changesPercentage', 'dp'])
  if (change == null && previousClose != null) change = price - previousClose
  if (changePercent == null && change != null && previousClose) changePercent = (change / previousClose) * 100
  return {
    symbol: symbol.toUpperCase(),
    price,
    change,
    changePercent,
    previousClose,
    marketCap: pickNumber(obj, map.marketCap, ['marketCap', 'market_cap', 'mktcap']),
    volume: pickNumber(obj, map.volume, ['volume', 'vol']),
  }
}

export async function fetchCustomQuotes(
  provider: CustomProviderDef & { config: { apiKey?: string } },
  symbols: string[]
): Promise<Record<string, SecurityQuote>> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  const apiKey = provider.config.apiKey
  const applyAuth = (url: string): string => {
    if (!apiKey) return url
    if (provider.authMethod === 'header' && provider.authHeaderName) headers[provider.authHeaderName] = apiKey
    else if (provider.authMethod === 'bearer') headers['Authorization'] = `Bearer ${apiKey}`
    else if (provider.authMethod === 'query' && provider.authQueryParam) {
      return `${url}${url.includes('?') ? '&' : '?'}${provider.authQueryParam}=${encodeURIComponent(apiKey)}`
    }
    return url
  }

  const map = provider.jsonFieldMap ?? {}
  const quotes: Record<string, SecurityQuote> = {}

  const getPayload = async (url: string): Promise<unknown> => {
    // pinnedFetch validates and then connects to a vetted address rather than
    // the name (M3). It costs the `next: { revalidate: 60 }` this call had —
    // Next's fetch cache doesn't cover requests with a custom dispatcher — so
    // custom quote feeds now hit upstream per request.
    const res = await pinnedFetch(applyAuth(url), { headers, signal: AbortSignal.timeout(10_000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const payload = await res.json() as unknown
    return provider.jsonArrayPath ? dig(payload, provider.jsonArrayPath) : payload
  }

  if (provider.url.includes('{symbol}') && !provider.url.includes('{symbols}')) {
    // Per-symbol endpoint
    const capped = symbols.slice(0, 40)
    for (const group of chunk(capped, 8)) {
      await Promise.all(group.map(async (symbol) => {
        try {
          const payload = await getPayload(provider.url.replace('{symbol}', encodeURIComponent(symbol)))
          const entry = Array.isArray(payload) ? payload[0] : payload
          const q = toQuote(entry, symbol, map)
          if (q) quotes[q.symbol] = q
        } catch { /* skip symbol */ }
      }))
    }
  } else {
    // Batch endpoint: {symbols} placeholder, or a fixed URL returning an array
    const url = provider.url.replace('{symbols}', symbols.map(encodeURIComponent).join(','))
    const payload = await getPayload(url)
    if (Array.isArray(payload)) {
      for (const entry of payload) {
        const symbol = pickString(entry, [map.symbol ?? 'symbol', 'symbol', 'ticker'])
        if (!symbol) continue
        const q = toQuote(entry, symbol, map)
        if (q) quotes[q.symbol] = q
      }
    } else if (payload && typeof payload === 'object') {
      for (const [key, entry] of Object.entries(payload as Record<string, unknown>)) {
        const q = toQuote(entry, key, map)
        if (q) quotes[q.symbol] = q
      }
    }
  }

  // Only return quotes for requested symbols
  const wanted = new Set(symbols.map((s) => s.toUpperCase()))
  for (const k of Object.keys(quotes)) if (!wanted.has(k)) delete quotes[k]
  if (Object.keys(quotes).length === 0) throw new Error('Custom feed returned no usable quotes')
  return quotes
}

// ─── Combined ladder (registry-driven) ────────────────────────────────────────

async function fetchFromProvider(p: AnyActiveProvider, symbols: string[]): Promise<Record<string, SecurityQuote>> {
  if (p.isCustom) return fetchCustomQuotes(p, symbols)
  switch (p.id) {
    case 'fmp':           return fetchFmpQuotes(symbols)
    case 'finnhub':       return fetchFinnhubQuotes(symbols)
    case 'twelve-data':   return fetchTwelveDataQuotes(symbols)
    case 'tiingo':        return fetchTiingoQuotes(symbols)
    case 'alpha-vantage': return fetchAlphaVantageQuotes(symbols)
    case 'yahoo-finance': return fetchYahooQuotes(symbols)
    default: throw new Error(`No fetcher for provider ${p.id}`)
  }
}

/**
 * Walk the provider ladder until every symbol is quoted.
 *
 * This is a **residual** ladder, not a first-success one (W4-C4). The previous
 * version returned as soon as a provider didn't throw, no matter how little it
 * covered: a rate-limited provider answering 12 of 50 symbols ended the walk,
 * and the other 38 fell through to catalog reference prices without Yahoo — the
 * free, keyless, reliable rung — ever being asked. The failure was invisible,
 * because 38 `reference: true` quotes render as a normal page with amber tags.
 *
 * Each provider is asked only for what is still missing, which also means a
 * partial answer costs the next provider a smaller request rather than a
 * duplicate one. Deliberately NOT `Promise.allSettled` over the ladder: that
 * fires every provider at once and burns rate limit on exactly the calls the
 * ladder exists to avoid (see CLAUDE.md, "Resilient multi-fetch").
 *
 * `source` names every provider that actually contributed, joined by `+`, so a
 * mixed result is attributable rather than credited to whichever answered first.
 */
export async function fetchSecurityQuotes(
  symbols: string[]
): Promise<{ quotes: Record<string, SecurityQuote>; source: QuoteSource }> {
  const providers = getEquityQuoteProviders()
  const wanted = [...new Set(symbols.map((s) => s.toUpperCase()))]

  const quotes: Record<string, SecurityQuote> = {}
  const contributors: string[] = []
  let remaining = wanted
  let lastError: Error | null = null

  for (const p of providers) {
    if (remaining.length === 0) break
    try {
      const got = await fetchFromProvider(p, remaining)
      let added = 0
      for (const [symbol, quote] of Object.entries(got)) {
        const key = symbol.toUpperCase()
        if (quotes[key]) continue
        quotes[key] = quote
        added++
      }
      recordProviderFetch(p.id, { count: added })
      if (added > 0) {
        contributors.push(p.id)
        remaining = remaining.filter((s) => !quotes[s])
      }
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e))
      recordProviderFetch(p.id, { error: lastError.message })
    }
  }

  // Nothing at all came back. Throwing (rather than returning an empty map) is
  // what makes the caller fall through to reference prices.
  if (contributors.length === 0) {
    throw lastError ?? new Error('No equity quote providers are enabled')
  }

  return { quotes, source: contributors.join('+') }
}

/**
 * Static catalog reference prices for whatever the live ladder missed, marked
 * `reference: true` so no consumer can mistake them for live readings. Shared
 * by /live-data/security-quotes and /api/v1/securities/quotes — the fallback
 * semantics are part of the quote surface, not one route's private behavior.
 */
export function referenceSecurityQuotes(symbols: string[]): Record<string, SecurityQuote> {
  const quotes: Record<string, SecurityQuote> = {}
  for (const raw of symbols) {
    const symbol = raw.toUpperCase()
    const ref = getEquity(symbol)?.referencePrice ?? getFund(symbol)?.referencePrice
    if (ref == null) continue
    quotes[symbol] = {
      symbol, price: ref, change: null, changePercent: null,
      previousClose: null, marketCap: null, volume: null, reference: true,
    }
  }
  return quotes
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
  const key = requireKey('fmp')
  const res = await fetch(
    `${FMP_STABLE}/historical-price-eod/full?symbol=${encodeURIComponent(symbol)}&apikey=${key}`,
    { next: { revalidate: 300 } }
  )
  if (!res.ok) throw new Error(`FMP chart ${res.status}`)
  // /stable returns the array directly (newest-first), not { historical: [...] }.
  const rows = await res.json() as Array<{ date: string; close: number }>
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('FMP chart: empty result')
  const days: Record<ChartRange, number> = { '1mo': 22, '3mo': 66, '6mo': 130, '1y': 260, '5y': 1300, 'max': 10000 }
  const points = rows
    .map((row) => ({ t: new Date(row.date).getTime(), close: row.close }))
    .sort((a, b) => a.t - b.t)
    .slice(-days[range])
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
    if (getProviderKey('fmp')) return fetchFmpChart(symbol, range)
    throw err
  }
}
