import { NextRequest, NextResponse } from 'next/server'
import {
  getAllProviders,
  saveProviderConfig,
  addCustomProvider,
  removeCustomProvider,
  updateCustomProvider,
  type CustomProviderDef,
} from '@/lib/api/live/providers'

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
    default:              return { ok: false, error: 'No test available for this provider' }
  }
}

async function testCustomProvider(url: string, key?: string): Promise<TestResult> {
  if (!url) return { ok: false, error: 'No URL configured for this provider' }
  try {
    // Simple reachability check — a 200 or any parseable response counts as success
    const res = await fetch(url.replace('{asset}', 'bitcoin'), {
      headers: { Accept: 'application/json, application/rss+xml, */*' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
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
