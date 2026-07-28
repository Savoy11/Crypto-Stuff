import { NextRequest, NextResponse } from 'next/server'
import { EQUITY_CATALOG } from '@/lib/data/equityCatalog'
import { getEquityProviders, recordProviderFetch } from '@/lib/api/live/providers'
import { fetchCustomUrl, findArray, pickDate, pickNumber, pickString, type ActiveCustom } from '@/lib/server/customFeeds'
import { blendByProvider } from '@/lib/server/socialBlend'

// Social signals for the equities module. REGISTRY-DRIVEN: Reddit Finance and
// StockTwits are toggleable built-ins on the Integrations page, and user-added
// custom sources (format json-social, market 'equities') run alongside them.
// Mirrors /live-data/social (crypto).
//   GET /live-data/stock-social                 → general finance chatter
//   GET /live-data/stock-social?symbol=AAPL     → per-ticker posts
//   GET /live-data/stock-social?limit=40
//
// Response: { ok, updatedAt, signals, summaries, providers }

export const dynamic = 'force-dynamic'

export type StockSentiment = 'positive' | 'negative' | 'neutral'

export interface StockSocialSignal {
  id: string
  platform: 'reddit' | 'stocktwits' | 'custom'
  providerLabel: string
  title: string
  body: string
  url: string
  author: string
  score: number
  upvoteRatio?: number
  subreddit?: string
  sentiment: StockSentiment
  symbols: string[]
  publishedAt: string
}

export interface StockSentimentSummary {
  symbol: string
  label: string
  positive: number
  negative: number
  neutral: number
  total: number
  /** −1 … +1 */
  sentimentScore: number
}

export interface StockSocialResponse {
  ok: boolean
  updatedAt: string
  signals: StockSocialSignal[]
  summaries: StockSentimentSummary[]
  providers: Array<{ id: string; name: string }>
}

const SUBREDDITS = ['stocks', 'investing', 'StockMarket', 'wallstreetbets']

const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; FinanceNow/1.0; market research)' }

// ─── Sentiment ────────────────────────────────────────────────────────────────

const POSITIVE = /\b(bull(ish)?|calls|moon|buy(ing)? the dip|undervalued|long|ripping|beat[s]?|breakout|upgrade[sd]?|rally|all.?time high|to the moon)\b/i
const NEGATIVE = /\b(bear(ish)?|puts|short(ing)?|overvalued|crash|dump|sell(ing)? off|bagholder|drill(ing)?|miss(ed)?|downgrade[sd]?|bubble|recession|tank(ed|ing)?)\b/i

function scoreSentiment(text: string): StockSentiment {
  const positive = POSITIVE.test(text)
  const negative = NEGATIVE.test(text)
  if (positive && !negative) return 'positive'
  if (negative && !positive) return 'negative'
  return 'neutral'
}

// ─── Ticker detection (cashtags + catalog names) ──────────────────────────────

const KNOWN_SYMBOLS = new Set(EQUITY_CATALOG.map((e) => e.symbol.toUpperCase()))
const NAME_BY_SYMBOL: Record<string, string> = Object.fromEntries(
  EQUITY_CATALOG.map((e) => [e.symbol.toUpperCase(), e.name])
)

function detectSymbols(text: string): string[] {
  const found = new Set<string>()
  for (const match of text.matchAll(/\$([A-Za-z]{1,5})\b/g)) {
    const sym = match[1].toUpperCase()
    if (KNOWN_SYMBOLS.has(sym)) found.add(sym)
  }
  const CASHTAG_ONLY = new Set(['NOW', 'LOW', 'CAT', 'COST', 'ALL', 'SO', 'ON'])
  for (const match of text.matchAll(/\b([A-Z]{3,5})\b/g)) {
    if (KNOWN_SYMBOLS.has(match[1]) && !CASHTAG_ONLY.has(match[1])) found.add(match[1])
  }
  return Array.from(found).slice(0, 6)
}

// ─── Reddit ───────────────────────────────────────────────────────────────────

// Reddit's JSON API (/hot.json, /search.json) returns HTTP 403 to server-side
// requests without OAuth, from every IP we can reach — datacenter and
// residential alike. It failed 100% of the time, which made this provider a
// permanent silent no-op: the route still returned 200 and StockTwits signals,
// so Reddit's absence looked like "quiet day" rather than "provider broken".
//
// The public Atom feeds (.rss) are keyless and DO answer server-side — this is
// the same approach the crypto /live-data/social route already uses
// successfully. Reddit rate-limits them aggressively (HTTP 429) when several
// are requested at once, so callers must treat partial results as normal;
// Promise.allSettled upstream already does.
//
// Trade-off: Atom carries no score or upvote_ratio. `score: 0` is the existing
// "no score available" sentinel — both social pages render the score badge only
// when `score > 0` — so it reads as absent rather than as a real zero, and
// upvoteRatio is left undefined. Same convention as /live-data/social.
function stripCdata(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim()
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

async function fetchSubreddit(sub: string, symbol?: string): Promise<StockSocialSignal[]> {
  const url = symbol
    ? `https://www.reddit.com/r/${sub}/search.rss?q=${encodeURIComponent(symbol)}&restrict_sr=1&sort=new&limit=15`
    : `https://www.reddit.com/r/${sub}/hot.rss?limit=15`
  const res = await fetch(url, {
    headers: { ...UA, Accept: 'application/atom+xml, application/rss+xml, application/xml, text/xml' },
    next: { revalidate: 300 },
  })
  if (!res.ok) throw new Error(`Reddit r/${sub} ${res.status}`)
  const xml = await res.text()

  const entries = [...xml.matchAll(/<entry[^>]*>([\s\S]*?)<\/entry>/gi)].slice(0, 15)
  return entries.map((m, i): StockSocialSignal => {
    const inner = m[1]
    const title = stripCdata(inner.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '')
    const link = inner.match(/<link[^>]*href="([^"]+)"/i)?.[1] ?? '#'
    const updated = inner.match(/<updated[^>]*>([\s\S]*?)<\/updated>/i)?.[1] ?? ''
    const content = decodeEntities(stripCdata(inner.match(/<content[^>]*>([\s\S]*?)<\/content>/i)?.[1] ?? ''))
      .replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    const author = inner.match(/<name>([\s\S]*?)<\/name>/i)?.[1]?.replace(/^\/u\//, '') ?? 'unknown'
    const text = `${title} ${content}`

    return {
      id: `reddit:${sub}:${i}:${updated || Date.now()}`,
      platform: 'reddit' as const,
      providerLabel: 'Reddit',
      title: title || '(no title)',
      body: content.slice(0, 220),
      url: link,
      author,
      score: 0, // Atom exposes no score; 0 is the UI's "no score" sentinel.
      subreddit: sub,
      sentiment: scoreSentiment(text),
      symbols: symbol ? Array.from(new Set([symbol, ...detectSymbols(text)])) : detectSymbols(text),
      publishedAt: updated ? new Date(updated).toISOString() : new Date().toISOString(),
    }
  })
}

// ─── StockTwits ───────────────────────────────────────────────────────────────

interface StocktwitsMessage {
  id: number
  body: string
  created_at: string
  user?: { username?: string }
  entities?: { sentiment?: { basic?: 'Bullish' | 'Bearish' } | null }
  symbols?: Array<{ symbol: string }>
  likes?: { total?: number }
}

async function fetchStocktwits(symbol?: string): Promise<StockSocialSignal[]> {
  const url = symbol
    ? `https://api.stocktwits.com/api/2/streams/symbol/${encodeURIComponent(symbol)}.json`
    : 'https://api.stocktwits.com/api/2/streams/trending.json'
  const res = await fetch(url, { headers: UA, next: { revalidate: 300 } })
  if (!res.ok) throw new Error(`StockTwits ${res.status}`)
  const payload = await res.json() as { messages?: StocktwitsMessage[] }
  return (payload.messages ?? []).map((msg) => {
    const declared = msg.entities?.sentiment?.basic
    const sentiment: StockSentiment = declared === 'Bullish' ? 'positive'
      : declared === 'Bearish' ? 'negative'
      : scoreSentiment(msg.body)
    const tagged = (msg.symbols ?? []).map((s) => s.symbol.toUpperCase()).filter((s) => KNOWN_SYMBOLS.has(s))
    return {
      id: `stocktwits:${msg.id}`,
      platform: 'stocktwits' as const,
      providerLabel: 'StockTwits',
      title: msg.body.replace(/\s+/g, ' ').slice(0, 160),
      body: '',
      url: `https://stocktwits.com/message/${msg.id}`,
      author: msg.user?.username ?? 'unknown',
      score: msg.likes?.total ?? 0,
      sentiment,
      symbols: symbol ? Array.from(new Set([symbol, ...tagged])) : tagged,
      publishedAt: new Date(msg.created_at).toISOString(),
    }
  })
}

// ─── Summaries ────────────────────────────────────────────────────────────────

function computeSummaries(signals: StockSocialSignal[], focus?: string): StockSentimentSummary[] {
  const bySymbol = new Map<string, StockSocialSignal[]>()
  for (const signal of signals) {
    for (const sym of signal.symbols) {
      const arr = bySymbol.get(sym) ?? []
      arr.push(signal)
      bySymbol.set(sym, arr)
    }
  }
  const entries = Array.from(bySymbol.entries())
    .filter(([sym, list]) => (focus ? sym === focus : list.length >= 2))
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 6)
  return entries.map(([sym, list]) => {
    const positive = list.filter((s) => s.sentiment === 'positive').length
    const negative = list.filter((s) => s.sentiment === 'negative').length
    const neutral = list.length - positive - negative
    return {
      symbol: sym,
      label: NAME_BY_SYMBOL[sym] ? `${NAME_BY_SYMBOL[sym]} (${sym})` : sym,
      positive, negative, neutral,
      total: list.length,
      sentimentScore: list.length ? (positive - negative) / list.length : 0,
    }
  })
}

// ─── Route ────────────────────────────────────────────────────────────────────

// ─── Custom social feeds ──────────────────────────────────────────────────────

async function fetchCustomSocial(provider: ActiveCustom, symbol?: string): Promise<StockSocialSignal[]> {
  const url = provider.url.replace('{symbol}', symbol ?? 'SPY')
  const res = await fetchCustomUrl(provider, url)
  const map = provider.jsonFieldMap ?? {}
  const out: StockSocialSignal[] = []
  for (const entry of findArray(await res.json(), provider.jsonArrayPath)) {
    const title = pickString(entry, map.title, ['title', 'body', 'text', 'message', 'content'])
    if (!title) continue
    const body = pickString(entry, map.body, ['body', 'text', 'content', 'selftext']) ?? ''
    const text = `${title} ${body}`
    out.push({
      id: `${provider.id}:${pickString(entry, map.id, ['id', 'url', 'link']) ?? title.slice(0, 60)}`.slice(0, 200),
      platform: 'custom',
      providerLabel: provider.name,
      title: title.replace(/\s+/g, ' ').slice(0, 160),
      body: body === title ? '' : body.replace(/\s+/g, ' ').slice(0, 220),
      url: pickString(entry, map.url, ['url', 'link', 'permalink']) ?? provider.url.replace('{symbol}', symbol ?? ''),
      author: pickString(entry, map.author, ['author', 'username', 'user.username', 'user.name']) ?? 'unknown',
      score: pickNumber(entry, map.score, ['score', 'likes', 'likes.total', 'upvotes', 'points']) ?? 0,
      sentiment: scoreSentiment(text),
      symbols: symbol ? Array.from(new Set([symbol, ...detectSymbols(text)])) : detectSymbols(text),
      publishedAt: pickDate(entry, map.publishedAt, ['publishedAt', 'created_at', 'created_utc', 'date', 'timestamp']) ?? new Date().toISOString(),
    })
  }
  return out
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol')?.trim().toUpperCase() || undefined
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') ?? '40', 10) || 40, 80)

  const active = getEquityProviders('social')
  const redditEnabled = active.some((p) => !p.isCustom && p.id === 'reddit-stocks')
  const stocktwitsEnabled = active.some((p) => !p.isCustom && p.id === 'stocktwits')
  const customs = active.filter((p): p is typeof p & ActiveCustom => !!p.isCustom && p.format === 'json-social')

  const subs = redditEnabled ? (symbol ? SUBREDDITS.slice(0, 3) : SUBREDDITS) : []
  type Task = { providerId: string; run: Promise<StockSocialSignal[]> }
  const tasks: Task[] = [
    ...subs.map((sub) => ({ providerId: 'reddit-stocks', run: fetchSubreddit(sub, symbol) })),
    ...(stocktwitsEnabled ? [{ providerId: 'stocktwits', run: fetchStocktwits(symbol) }] : []),
    ...customs.map((p) => ({ providerId: p.id, run: fetchCustomSocial(p, symbol) })),
  ]

  const results = await Promise.allSettled(tasks.map((t) => t.run))

  // Utilization: aggregate per provider id (reddit spans several subreddit fetches)
  const perProvider = new Map<string, { count: number; error?: string }>()
  results.forEach((result, i) => {
    const id = tasks[i].providerId
    const agg = perProvider.get(id) ?? { count: 0 }
    if (result.status === 'fulfilled') agg.count += result.value.length
    else agg.error ??= result.reason instanceof Error ? result.reason.message : String(result.reason)
    perProvider.set(id, agg)
  })
  for (const [id, agg] of perProvider) {
    recordProviderFetch(id, agg.count > 0 ? { count: agg.count } : { error: agg.error ?? 'no posts returned' })
  }

  // Group by PROVIDER, not by platform: Reddit spans several subreddit fetches
  // that must share one quota, or it would out-weight StockTwits 4:1 rather
  // than being starved by it.
  const byProvider = new Map<string, StockSocialSignal[]>()
  const seen = new Set<string>()
  results.forEach((result, i) => {
    if (result.status !== 'fulfilled') return
    const id = tasks[i].providerId
    const bucket = byProvider.get(id) ?? []
    for (const s of result.value) {
      if (seen.has(s.id)) continue
      seen.add(s.id)
      bucket.push(s)
    }
    byProvider.set(id, bucket)
  })

  // Fair share per provider, not pure recency — see socialBlend for why.
  const { items: deduped, contributed } = blendByProvider(byProvider, limit)

  // Attribution reflects what is actually in `signals`. Listing a provider that
  // contributed nothing to the returned set is what made the old starvation
  // invisible: at limit=20 this claimed Reddit as a source while showing zero
  // Reddit posts.
  const providers: Array<{ id: string; name: string }> = []
  for (const id of byProvider.keys()) {
    if (!contributed.has(id) || providers.some((p) => p.id === id)) continue
    const name = id === 'reddit-stocks' ? `Reddit (${subs.map((s) => `r/${s}`).join(', ')})`
      : id === 'stocktwits' ? 'StockTwits'
      : customs.find((c) => c.id === id)?.name ?? id
    providers.push({ id, name })
  }

  return NextResponse.json({
    ok: deduped.length > 0,
    updatedAt: new Date().toISOString(),
    signals: deduped,
    summaries: computeSummaries(deduped, symbol),
    providers,
  } satisfies StockSocialResponse)
}
