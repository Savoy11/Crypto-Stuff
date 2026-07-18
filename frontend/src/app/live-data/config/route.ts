import { NextRequest, NextResponse } from 'next/server'
import {
  getAllProviders,
  saveProviderConfig,
  addCustomProvider,
  removeCustomProvider,
  updateCustomProvider,
  type CustomProviderDef,
} from '@/lib/api/live/providers'
import { guardSensitiveRoute } from '@/lib/server/apiGuard'
import { validatePublicHttpUrl } from '@/lib/server/urlSafety'

export const dynamic = 'force-dynamic'

// GET /live-data/config
export async function GET() {
  const providers = getAllProviders().map((p) => ({
    ...p,
    config: {
      ...p.config,
      hasKey: !!(p.config.apiKey),
      apiKey: undefined, // never send raw key to browser
    },
  }))
  return NextResponse.json({ providers })
}

// POST /live-data/config
export async function POST(req: NextRequest) {
  const denied = guardSensitiveRoute(req, 'provider-config', 30)
  if (denied) return denied

  const body = (await req.json()) as {
    providerId?: string
    action: 'save' | 'test' | 'toggle' | 'add-custom' | 'update-custom' | 'remove'
    apiKey?: string
    enabled?: boolean
    customDef?: Omit<CustomProviderDef, 'id'>
  }

  const { providerId, action } = body

  // ── Update custom provider ─────────────────────────────────────────────────
  if (action === 'update-custom') {
    if (!providerId) return NextResponse.json({ error: 'providerId required' }, { status: 400 })
    const def = body.customDef
    if (!def || !def.name || !def.url || !def.category || !def.format) {
      return NextResponse.json({ error: 'name, url, category and format are required' }, { status: 400 })
    }
    const urlError = validatePublicHttpUrl(def.url)
    if (urlError) return NextResponse.json({ error: urlError }, { status: 400 })
    updateCustomProvider(providerId, def as Omit<CustomProviderDef, 'id' | 'isCustom'>)
    if (body.apiKey !== undefined) {
      saveProviderConfig(providerId, { apiKey: body.apiKey || undefined })
    }
    return NextResponse.json({ ok: true })
  }

  // ── Add custom provider ────────────────────────────────────────────────────
  if (action === 'add-custom') {
    const def = body.customDef
    if (!def || !def.name || !def.url || !def.category || !def.format) {
      return NextResponse.json({ error: 'name, url, category and format are required' }, { status: 400 })
    }
    const urlError = validatePublicHttpUrl(def.url)
    if (urlError) return NextResponse.json({ error: urlError }, { status: 400 })
    const id = `custom-${Date.now()}`
    addCustomProvider({ ...def, id, isCustom: true } as CustomProviderDef)
    return NextResponse.json({ ok: true, id })
  }

  // ── Remove custom provider ─────────────────────────────────────────────────
  if (action === 'remove') {
    if (!providerId) return NextResponse.json({ error: 'providerId required' }, { status: 400 })
    removeCustomProvider(providerId)
    return NextResponse.json({ ok: true })
  }

  // All remaining actions require providerId
  if (!providerId) return NextResponse.json({ error: 'providerId required' }, { status: 400 })

  const all = getAllProviders()
  const provider = all.find((p) => p.id === providerId)
  if (!provider) return NextResponse.json({ error: 'Unknown provider' }, { status: 400 })

  // ── Toggle ────────────────────────────────────────────────────────────────
  if (action === 'toggle') {
    saveProviderConfig(providerId, { enabled: body.enabled ?? false })
    return NextResponse.json({ ok: true })
  }

  // ── Save key ──────────────────────────────────────────────────────────────
  if (action === 'save') {
    const update: Record<string, unknown> = {}
    if (body.apiKey !== undefined) update.apiKey = body.apiKey || undefined
    if (body.enabled !== undefined) update.enabled = body.enabled
    saveProviderConfig(providerId, update)
    return NextResponse.json({ ok: true })
  }

  // ── Test ──────────────────────────────────────────────────────────────────
  if (action === 'test') {
    const key = body.apiKey ?? provider.config.apiKey
    try {
      const result = await testProvider(provider, key)
      // "No test available" is a neutral outcome, NOT a provider failure —
      // recording it as 'error' would silently bench the provider (getNews/
      // SocialProviders exclude error-status providers from the data pipeline).
      const untestable = !result.ok && result.error === 'No test available for this provider'
      saveProviderConfig(providerId, {
        lastTested: new Date().toISOString(),
        lastStatus: result.ok ? 'active' : untestable ? undefined : 'error',
        lastError: result.ok || untestable ? undefined : result.error,
        ...(body.apiKey ? { apiKey: body.apiKey } : {}),
      })
      return NextResponse.json(result)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      saveProviderConfig(providerId, { lastTested: new Date().toISOString(), lastStatus: 'error', lastError: msg })
      return NextResponse.json({ ok: false, error: msg })
    }
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

// ─── Provider test functions ──────────────────────────────────────────────────

type TestResult = { ok: boolean; error?: string; detail?: string }

async function testProvider(provider: { id: string; isCustom?: boolean; url?: string }, key?: string): Promise<TestResult> {
  if ((provider as { isCustom?: boolean }).isCustom) {
    return testCustomProvider((provider as { url?: string }).url ?? '', key)
  }
  switch (provider.id) {
    case 'coingecko':     return testCoinGecko(key)
    case 'coinmarketcap': return testCoinMarketCap(key)
    case 'binance':       return testBinance()
    case 'cryptopanic':   return testCryptoPanic(key)
    case 'messari':       return testMessari(key)
    case 'newsapi':       return testNewsAPI(key)
    case 'fmp':           return testFmp(key)
    case 'finnhub':       return testFinnhub(key)
    case 'twelve-data':   return testTwelveData(key)
    case 'tiingo':        return testTiingo(key)
    case 'alpha-vantage': return testAlphaVantage(key)
    case 'yahoo-finance': return testYahooFinance()
    case 'stooq':         return testStooq()
    case 'yahoo-news':    return testRssFeed('https://finance.yahoo.com/news/rssindex', 'Yahoo Finance News')
    case 'marketwatch':   return testRssFeed('https://feeds.content.dowjones.io/public/rss/mw_topstories', 'MarketWatch')
    case 'cnbc':          return testRssFeed('https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114', 'CNBC')
    case 'reddit-stocks': return testRedditStocks()
    case 'stocktwits':    return testStocktwits()
    case 'anthropic': case 'openai': case 'google': case 'groq': case 'xai':
    case 'deepseek': case 'mistral': case 'together': case 'cohere':
      return testLlmProvider(provider.id, key)
    default:              return { ok: false, error: 'No test available for this provider' }
  }
}

async function testCustomProvider(url: string, key?: string): Promise<TestResult> {
  if (!url) return { ok: false, error: 'No URL configured for this provider' }
  const urlError = validatePublicHttpUrl(url)
  if (urlError) return { ok: false, error: urlError }
  try {
    // Simple reachability check — don't follow redirects (a redirect could
    // point at an internal address); a 2xx/3xx counts as reachable.
    const res = await fetch(url.replace('{asset}', 'bitcoin').replace(/\{symbols?\}/g, 'AAPL'), {
      headers: { Accept: 'application/json, application/rss+xml, */*' },
      signal: AbortSignal.timeout(8000),
      redirect: 'manual',
    })
    if (res.status >= 400) return { ok: false, error: `HTTP ${res.status}` }
    return { ok: true, detail: `Endpoint reachable (HTTP ${res.status})` }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Connection failed' }
  }
}

async function testCoinGecko(key?: string): Promise<TestResult> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (key) headers['x-cg-demo-api-key'] = key
  const res = await fetch('https://api.coingecko.com/api/v3/ping', { headers })
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
  const data = await res.json()
  return { ok: !!data.gecko_says, detail: 'CoinGecko ping successful' }
}

async function testCoinMarketCap(key?: string): Promise<TestResult> {
  if (!key) return { ok: false, error: 'API key required' }
  const res = await fetch('https://pro-api.coinmarketcap.com/v1/key/info', {
    headers: { 'X-CMC_PRO_API_KEY': key, Accept: 'application/json' },
  })
  if (!res.ok) return { ok: false, error: `HTTP ${res.status} — check your key` }
  const data = await res.json()
  const plan = data.data?.plan?.credit_limit_monthly_reset_timestamp ? 'Pro' : 'Basic'
  return { ok: true, detail: `Connected — ${plan} plan` }
}

async function testBinance(): Promise<TestResult> {
  const res = await fetch('https://api.binance.com/api/v3/ping')
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
  return { ok: true, detail: 'Binance public API reachable' }
}

async function testCryptoPanic(key?: string): Promise<TestResult> {
  if (!key) return { ok: false, error: 'Paid API key required — CryptoPanic discontinued its free tier in April 2026' }
  const res = await fetch(`https://cryptopanic.com/api/v1/posts/?auth_token=${key}&public=true&limit=1`, {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) return { ok: false, error: `HTTP ${res.status} — check your key` }
  const data = await res.json()
  return { ok: Array.isArray(data.results), detail: 'CryptoPanic feed connected' }
}

async function testMessari(key?: string): Promise<TestResult> {
  if (!key) return { ok: false, error: 'API key required' }
  const res = await fetch('https://data.messari.io/api/v1/news?limit=1', {
    headers: { 'x-messari-api-key': key, Accept: 'application/json' },
  })
  if (!res.ok) return { ok: false, error: `HTTP ${res.status} — check your key` }
  return { ok: true, detail: 'Messari API connected' }
}

// ─── Equity quote provider tests ─────────────────────────────────────────────

async function testFmp(key?: string): Promise<TestResult> {
  if (!key) return { ok: false, error: 'API key required' }
  // FMP /stable API (the legacy /api/v3 endpoints are retired → 403).
  const res = await fetch(`https://financialmodelingprep.com/stable/quote?symbol=AAPL&apikey=${key}`)
  if (res.status === 401 || res.status === 403) return { ok: false, error: `HTTP ${res.status} — check your key` }
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
  const data = await res.json() as Array<{ price?: number }>
  return Array.isArray(data) && data[0]?.price != null
    ? { ok: true, detail: `Connected — AAPL $${data[0].price} (free tier: quotes/profile/history/earnings; screener & batch are paid)` }
    : { ok: false, error: 'Unexpected response — check your key/plan' }
}

async function testFinnhub(key?: string): Promise<TestResult> {
  if (!key) return { ok: false, error: 'API key required' }
  const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=AAPL&token=${key}`)
  if (!res.ok) return { ok: false, error: `HTTP ${res.status} — check your key` }
  const data = await res.json() as { c?: number }
  return data.c ? { ok: true, detail: `Connected — AAPL $${data.c}` } : { ok: false, error: 'No quote returned' }
}

async function testTwelveData(key?: string): Promise<TestResult> {
  if (!key) return { ok: false, error: 'API key required' }
  const res = await fetch(`https://api.twelvedata.com/quote?symbol=AAPL&apikey=${key}`)
  if (!res.ok) return { ok: false, error: `HTTP ${res.status} — check your key` }
  const data = await res.json() as { close?: string; message?: string }
  return data.close
    ? { ok: true, detail: `Connected — AAPL $${parseFloat(data.close).toFixed(2)}` }
    : { ok: false, error: data.message ?? 'No quote returned' }
}

async function testTiingo(key?: string): Promise<TestResult> {
  if (!key) return { ok: false, error: 'API key required' }
  const res = await fetch(`https://api.tiingo.com/iex/?tickers=aapl&token=${key}`, { headers: { Accept: 'application/json' } })
  if (!res.ok) return { ok: false, error: `HTTP ${res.status} — check your key` }
  const data = await res.json() as Array<{ last?: number; tngoLast?: number }>
  const px = data[0]?.last ?? data[0]?.tngoLast
  return px != null ? { ok: true, detail: `Connected — AAPL $${px}` } : { ok: false, error: 'No quote returned' }
}

async function testAlphaVantage(key?: string): Promise<TestResult> {
  if (!key) return { ok: false, error: 'API key required' }
  const res = await fetch(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=AAPL&apikey=${key}`)
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
  const data = await res.json() as { 'Global Quote'?: Record<string, string>; Note?: string; Information?: string }
  const px = data['Global Quote']?.['05. price']
  if (px) return { ok: true, detail: `Connected — AAPL $${parseFloat(px).toFixed(2)}` }
  return { ok: false, error: data.Note ?? data.Information ?? 'No quote returned — check your key or daily limit' }
}

async function testYahooFinance(): Promise<TestResult> {
  const res = await fetch('https://query1.finance.yahoo.com/v8/finance/spark?symbols=AAPL&range=1d&interval=1d', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' },
  })
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
  return { ok: true, detail: 'Yahoo Finance spark API reachable' }
}

async function testStooq(): Promise<TestResult> {
  const res = await fetch('https://stooq.com/q/l/?s=aapl.us&f=sd2t2ohlcv&h&e=csv')
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
  return { ok: true, detail: 'Stooq CSV endpoint reachable' }
}

// Verify an LLM key by listing models on the provider's (OpenAI-compatible) endpoint.
const LLM_TEST_ENDPOINTS: Record<string, { url: string; auth: 'bearer' | 'anthropic' }> = {
  anthropic: { url: 'https://api.anthropic.com/v1/models', auth: 'anthropic' },
  openai:    { url: 'https://api.openai.com/v1/models', auth: 'bearer' },
  google:    { url: 'https://generativelanguage.googleapis.com/v1beta/openai/models', auth: 'bearer' },
  groq:      { url: 'https://api.groq.com/openai/v1/models', auth: 'bearer' },
  xai:       { url: 'https://api.x.ai/v1/models', auth: 'bearer' },
  deepseek:  { url: 'https://api.deepseek.com/v1/models', auth: 'bearer' },
  mistral:   { url: 'https://api.mistral.ai/v1/models', auth: 'bearer' },
  together:  { url: 'https://api.together.xyz/v1/models', auth: 'bearer' },
  cohere:    { url: 'https://api.cohere.com/compatibility/v1/models', auth: 'bearer' },
}

async function testLlmProvider(id: string, key?: string): Promise<TestResult> {
  if (!key) return { ok: false, error: 'API key required' }
  const endpoint = LLM_TEST_ENDPOINTS[id]
  if (!endpoint) return { ok: false, error: 'No test available for this provider' }
  const headers: Record<string, string> = endpoint.auth === 'anthropic'
    ? { 'x-api-key': key, 'anthropic-version': '2023-06-01' }
    : { Authorization: `Bearer ${key}` }
  const res = await fetch(endpoint.url, { headers })
  if (res.status === 401 || res.status === 403) return { ok: false, error: `HTTP ${res.status} — invalid key` }
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
  return { ok: true, detail: 'API key valid — models endpoint reachable' }
}

async function testRssFeed(url: string, name: string): Promise<TestResult> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CAEP/1.0)', Accept: 'application/rss+xml, application/xml, text/xml' },
  })
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
  const xml = await res.text()
  const items = xml.match(/<item[\s>]/gi)?.length ?? 0
  return items > 0
    ? { ok: true, detail: `${name} feed serving ${items} items` }
    : { ok: false, error: 'Feed reachable but contained no items' }
}

async function testRedditStocks(): Promise<TestResult> {
  const res = await fetch('https://www.reddit.com/r/stocks/hot.json?limit=1&raw_json=1', {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CAEP/1.0; market research)' },
  })
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
  const data = await res.json() as { data?: { children?: unknown[] } }
  return (data.data?.children?.length ?? 0) > 0
    ? { ok: true, detail: 'Reddit finance subreddits reachable' }
    : { ok: false, error: 'Reddit returned no posts' }
}

async function testStocktwits(): Promise<TestResult> {
  const res = await fetch('https://api.stocktwits.com/api/2/streams/trending.json', {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CAEP/1.0; market research)' },
  })
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
  const data = await res.json() as { messages?: unknown[] }
  return (data.messages?.length ?? 0) > 0
    ? { ok: true, detail: 'StockTwits stream reachable' }
    : { ok: false, error: 'StockTwits returned no messages' }
}

async function testNewsAPI(key?: string): Promise<TestResult> {
  if (!key) return { ok: false, error: 'API key required' }
  const res = await fetch(
    `https://newsapi.org/v2/everything?q=cryptocurrency&pageSize=1&apiKey=${key}`,
    { headers: { Accept: 'application/json' } }
  )
  if (!res.ok) return { ok: false, error: `HTTP ${res.status} — check your key` }
  const data = await res.json()
  return { ok: data.status === 'ok', detail: `Connected — ${data.totalResults ?? 0} articles available` }
}
