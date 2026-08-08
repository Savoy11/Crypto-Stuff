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
import { pinnedFetch } from '@/lib/server/pinnedFetch'
import { probeSiteTerms, type TermsProbeReport } from '@/lib/server/termsProbe'

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
    /**
     * Set by the UI once the user has been shown the terms report and confirmed
     * they have read the site's terms. Only ever unblocks a `requiresAcknowledgement`
     * outcome — a `hardBlock` ignores it entirely.
     */
    termsAcknowledged?: boolean
  }

  const { providerId, action } = body

  /**
   * Terms gate for user-added sources.
   *
   * Returns a response to send when the source must not be saved (yet), or null
   * to proceed. Three outcomes, in order of how much they cost the user:
   *
   *  - hard block  → 403, no override. The registry says prohibited, or the
   *                  site's own robots.txt disallows the path. There is no
   *                  checkbox for this, deliberately.
   *  - needs ack   → 409 carrying the full report, so the UI can show what the
   *                  terms actually say and ask. Re-POST with termsAcknowledged.
   *  - clear       → null.
   *
   * Note the probe is skipped once acknowledged: it is a live outbound fetch of
   * someone else's site, and running it a second time to reach the same answer
   * is a request we do not need to make. The hard-block half is NOT skipped —
   * it re-runs from the registry, which is local and free.
   */
  async function gateSourceTerms(url: string): Promise<NextResponse | null> {
    const report: TermsProbeReport = await probeSiteTerms(url)
    if (report.hardBlock) {
      return NextResponse.json(
        { error: report.summary, termsReport: report, blockedBy: 'source-terms' },
        { status: 403 }
      )
    }
    if (report.requiresAcknowledgement && !body.termsAcknowledged) {
      return NextResponse.json(
        { error: report.summary, termsReport: report, needsAcknowledgement: true },
        { status: 409 }
      )
    }
    return null
  }

  // ── Update custom provider ─────────────────────────────────────────────────
  if (action === 'update-custom') {
    if (!providerId) return NextResponse.json({ error: 'providerId required' }, { status: 400 })
    const def = body.customDef
    if (!def || !def.name || !def.url || !def.category || !def.format) {
      return NextResponse.json({ error: 'name, url, category and format are required' }, { status: 400 })
    }
    const urlError = validatePublicHttpUrl(def.url)
    if (urlError) return NextResponse.json({ error: urlError }, { status: 400 })
    // Edits go through the same gate as adds — otherwise "add an approved feed,
    // then edit the URL" is a hole straight through the safeguard.
    const blocked = await gateSourceTerms(def.url)
    if (blocked) return blocked
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
    const blocked = await gateSourceTerms(def.url)
    if (blocked) return blocked
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
    case 'yt-bloomberg':      return testYouTubeChannel('UCIALMKvObZNtJ6AmdCLP7Lg', 'Bloomberg Television')
    case 'yt-cnbc':           return testYouTubeChannel('UCrp_UI8XtuYfpiqluWLD7Lw', 'CNBC Television')
    case 'yt-ft':             return testYouTubeChannel('UCoUxsWakJucWg46KW5RsvPw', 'Financial Times')
    case 'yt-wsj':            return testYouTubeChannel('UCK7tptUDHh-RYDsdxO1-5QQ', 'The Wall Street Journal')
    case 'yt-coin-bureau':    return testYouTubeChannel('UCqK_GSMbpiV8spgD3ZGloSw', 'Coin Bureau')
    case 'yt-bankless':       return testYouTubeChannel('UCAl9Ld79qaZxp9JzEOwd3aA', 'Bankless')
    case 'yt-benjamin-cowen': return testYouTubeChannel('UCRvqjQPSeaWn-uEx-w0XOIg', 'Benjamin Cowen')
    case 'yt-altcoin-daily':  return testYouTubeChannel('UCbLhGKVY-bJPcawebgtNfbw', 'Altcoin Daily')
    case 'yt-cnbc-intl':      return testYouTubeChannel('UCo7a6riBFJ3tkeHjvkXPn1g', 'CNBC International')
    case 'yt-reuters':        return testYouTubeChannel('UChqUTb7kYRX8-EiaN3XFrSQ', 'Reuters')
    case 'yt-economist':      return testYouTubeChannel('UC0p5jTq6Xx_DosDFxVXnWaQ', 'The Economist')
    case 'yt-unchained':      return testYouTubeChannel('UCWiiMnsnw5Isc2PP1to9nNw', 'Unchained')
    case 'yt-the-defiant':    return testYouTubeChannel('UCL0J4MLEdLP0-UyLu0hCktg', 'The Defiant')
    case 'yt-crypto-banter':  return testYouTubeChannel('UCN9Nj4tjXbVTLYWN0EKly_Q', 'Crypto Banter')
    case 'youtube-search':    return testYouTubeSearch(key)
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
  // This one fetches, so it validates, resolves, AND pins. The two save-time
  // checks above stay string-level on purpose — a config shouldn't be rejected
  // because DNS was down when the user hit Save (see urlSafety.ts).
  try {
    // Simple reachability check — don't follow redirects (a redirect could
    // point at an internal address); a 2xx/3xx counts as reachable.
    const res = await pinnedFetch(url.replace('{asset}', 'bitcoin').replace(/\{symbols?\}/g, 'AAPL'), {
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

/** Reachability check for a keyless YouTube channel feed. */
async function testYouTubeChannel(channelId: string, label: string): Promise<TestResult> {
  const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FinanceNow/1.0)' },
  })
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
  const entries = ((await res.text()).match(/<entry>/g) ?? []).length
  if (entries === 0) return { ok: false, error: 'Feed reachable but returned no videos' }
  return { ok: true, detail: `${label} — ${entries} recent videos` }
}

/**
 * Verify a YouTube Data API key with the cheapest possible call.
 *
 * Uses videos.list (1 quota unit) rather than search.list (100), so testing a
 * key doesn't burn 1% of the daily allowance.
 */
async function testYouTubeSearch(key: string | undefined): Promise<TestResult> {
  if (!key) return { ok: false, error: 'No API key set' }
  const url = `https://www.googleapis.com/youtube/v3/videos?part=id&id=dQw4w9WgXcQ&key=${encodeURIComponent(key)}`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (res.status === 403) {
    return { ok: false, error: 'Rejected (403) — key restricted, quota exhausted, or Data API not enabled' }
  }
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
  return { ok: true, detail: 'YouTube Data API key valid (verified with a 1-unit call)' }
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
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FinanceNow/1.0)', Accept: 'application/rss+xml, application/xml, text/xml' },
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
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FinanceNow/1.0; market research)' },
  })
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
  const data = await res.json() as { data?: { children?: unknown[] } }
  return (data.data?.children?.length ?? 0) > 0
    ? { ok: true, detail: 'Reddit finance subreddits reachable' }
    : { ok: false, error: 'Reddit returned no posts' }
}

async function testStocktwits(): Promise<TestResult> {
  const res = await fetch('https://api.stocktwits.com/api/2/streams/trending.json', {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FinanceNow/1.0; market research)' },
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
