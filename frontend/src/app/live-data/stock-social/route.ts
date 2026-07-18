import { NextRequest, NextResponse } from 'next/server'
import { EQUITY_CATALOG } from '@/lib/data/equityCatalog'
import { getEquityProviders, recordProviderFetch } from '@/lib/api/live/providers'
import { fetchCustomUrl, findArray, pickDate, pickNumber, pickString, type ActiveCustom } from '@/lib/server/customFeeds'

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

const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; CAEP/1.0; market research)' }

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

interface RedditChild {
  data: {
    id: string; title: string; selftext?: string; permalink: string
    author: string; score: number; upvote_ratio?: number
    subreddit: string; created_utc: number; stickied?: boolean
  }
}

async function fetchSubreddit(sub: string, symbol?: string): Promise<StockSocialSignal[]> {
  const url = symbol
    ? `https://www.reddit.com/r/${sub}/search.json?q=${encodeURIComponent(symbol)}&restrict_sr=1&sort=new&limit=15&raw_json=1`
    : `https://www.reddit.com/r/${sub}/hot.json?limit=15&raw_json=1`
  const res = await fetch(url, { headers: UA, next: { revalidate: 300 } })
  if (!res.ok) throw new Error(`Reddit r/${sub} ${res.status}`)
  const payload = await res.json() as { data?: { children?: RedditChild[] } }
  return (payload.data?.children ?? [])
    .filter((c) => !c.data.stickied)
    .map(({ data }) => {
      const text = `${data.title} ${data.selftext ?? ''}`
      return {
        id: `reddit:${data.id}`,
        platform: 'reddit' as const,
        providerLabel: 'Reddit',
        title: data.title,
        body: (data.selftext ?? '').replace(/\s+/g, ' ').slice(0, 220),
        url: `https://www.reddit.com${data.permalink}`,
        author: data.author,
        score: data.score,
        upvoteRatio: data.upvote_ratio,
        subreddit: data.subreddit,
        sentiment: scoreSentiment(text),
        symbols: symbol ? Array.from(new Set([symbol, ...detectSymbols(text)])) : detectSymbols(text),
        publishedAt: new Date(data.created_utc * 1000).toISOString(),
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

  const providers: Array<{ id: string; name: string }> = []
  const signals: StockSocialSignal[] = []
  results.forEach((result, i) => {
    if (result.status !== 'fulfilled') return
    signals.push(...result.value)
    const id = tasks[i].providerId
    if (!providers.some((p) => p.id === id)) {
      const name = id === 'reddit-stocks' ? `Reddit (${subs.map((s) => `r/${s}`).join(', ')})`
        : id === 'stocktwits' ? 'StockTwits'
        : customs.find((c) => c.id === id)?.name ?? id
      providers.push({ id, name })
    }
  })

  const seen = new Set<string>()
  const deduped = signals
    .filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)))
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, limit)

  return NextResponse.json({
    ok: deduped.length > 0,
    updatedAt: new Date().toISOString(),
    signals: deduped,
    summaries: computeSummaries(deduped, symbol),
    providers,
  } satisfies StockSocialResponse)
}
