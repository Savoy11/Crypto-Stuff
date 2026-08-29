import { NextRequest, NextResponse } from 'next/server'
import { detectSymbols, requestedMatcher } from '@/lib/server/marketNewsSymbols'
import { FUND_CATALOG } from '@/lib/data/fundCatalog'
import { getEquityProviders, recordProviderFetch, type AnyActiveProvider } from '@/lib/api/live/providers'
import { fetchCustomUrl, findArray, pickDate, pickString, type ActiveCustom } from '@/lib/server/customFeeds'
import { parseFeedItems } from '@/lib/server/feedParse'

// Server-side proxy for stock-market news (equities & funds modules).
//   GET /live-data/market-news                → general market headlines
//   GET /live-data/market-news?symbol=AAPL    → per-ticker headlines
//   GET /live-data/market-news?limit=20
//
// REGISTRY-DRIVEN: built-in feeds (MarketWatch, CNBC) can
// be toggled on the Integrations page, and user-added custom sources
// (rss / atom / json-news, market: 'equities') run alongside them. All active
// sources fetch in parallel via Promise.allSettled — any subset may fail
// without crashing the route. Sentiment is keyword-based, mirroring the
// crypto news route's approach.

export const dynamic = 'force-dynamic'

export type MarketSentiment = 'positive' | 'negative' | 'neutral'

export type MarketNewsCategory =
  | 'earnings' | 'analyst' | 'macro' | 'ma' | 'dividend' | 'market' | 'general'

export interface MarketArticle {
  id: string
  title: string
  url: string
  source: string
  publishedAt: string
  summary: string
  sentiment: MarketSentiment
  category: MarketNewsCategory
  /** Catalog tickers detected in the headline/summary. */
  relatedSymbols: string[]
  /** Published within the last hour. */
  isBreaking: boolean
}

export interface MarketNewsResponse {
  ok: boolean
  updatedAt: string
  articles: MarketArticle[]
  /** Why the list is empty, when it is empty for a reason worth stating. */
  error?: string
}

// Built-in feed definitions, keyed by provider id in the registry.
//
// ⚠ `yahoo-news` was here until 2026-08-06, and with it the ONLY free
// per-ticker RSS feed (feeds.finance.yahoo.com/rss/2.0/headline?s=SYM). It was
// removed on terms grounds — see lib/server/sourceTerms.ts. Both survivors are
// general market wires, which is what changed symbol mode below from "fetch
// this ticker's feed" to "read the general wires and keep what mentions it".
const BUILTIN_FEEDS: Record<string, { url: string; source: string }> = {
  'marketwatch': { url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories', source: 'MarketWatch' },
  'cnbc':        { url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114', source: 'CNBC' },
}

/**
 * Cap on watchlist symbols honoured in one request.
 *
 * Each symbol used to be another upstream round-trip, so a 30-name watchlist would turn
 * one request into 30. Six covers a typical focus list while keeping the fan-out
 * comparable to the general-feed path.
 */
const MAX_WATCHLIST_FEEDS = 6

// ─── RSS parsing ──────────────────────────────────────────────────────────────

// Item extraction is shared (lib/server/feedParse.ts). The local copy this
// replaces matched only <item>, so an Atom feed parsed to zero articles, and
// stamped dates with an unguarded `new Date(raw).toISOString()` that throws on
// one malformed date and loses the whole feed — see W4-C3/W4-C5.
function parseRss(xml: string, source: string): Omit<MarketArticle, 'sentiment' | 'category' | 'relatedSymbols' | 'isBreaking'>[] {
  return parseFeedItems(xml).map((item) => ({
    id: `${source}:${item.url || item.title}`.slice(0, 200),
    title: item.title,
    url: item.url,
    source,
    publishedAt: new Date(item.publishedAt).toISOString(),
    summary: item.summary.slice(0, 280),
  }))
}

// ─── Sentiment ────────────────────────────────────────────────────────────────

const POSITIVE = /\b(surge[sd]?|rall(y|ies|ied)|beat[s]?|record|upgrade[sd]?|soar[sed]*|jump[sed]*|gain[sed]*|bullish|outperform|strong|tops|climbs?|boost[sed]*|breakthrough|all-time high)\b/i
const NEGATIVE = /\b(fall[s]?|fell|drop[sped]*|plunge[sd]?|miss(es|ed)?|downgrade[sd]?|lawsuit|recall|cut[s]?|bearish|layoff[s]?|weak|slump[sed]*|crash(es|ed)?|tumble[sd]?|sink[s]?|sank|fear[s]?|warn(s|ing)?|selloff|decline[sd]?|loss(es)?)\b/i

function scoreSentiment(text: string): MarketSentiment {
  const positive = POSITIVE.test(text)
  const negative = NEGATIVE.test(text)
  if (positive && !negative) return 'positive'
  if (negative && !positive) return 'negative'
  return 'neutral'
}

// ─── Category classification ──────────────────────────────────────────────────

const CATEGORY_PATTERNS: Array<[MarketNewsCategory, RegExp]> = [
  ['earnings', /\b(earnings|quarterly results|q[1-4] (results|revenue)|eps|guidance|revenue (beat|miss)|reports? (q[1-4]|fiscal))\b/i],
  ['analyst',  /\b(upgrade[sd]?|downgrade[sd]?|price target|analyst[s]?|initiat(es|ed) coverage|overweight|underweight|buy rating|sell rating)\b/i],
  ['ma',       /\b(acqui(re[sd]?|sition)|merger|takeover|buyout|deal to buy|stake in|spin-?off|ipo)\b/i],
  ['dividend', /\b(dividend[s]?|buyback[s]?|share repurchase|payout)\b/i],
  ['macro',    /\b(fed|federal reserve|inflation|cpi|ppi|jobs report|payrolls|interest rate[s]?|treasury yield[s]?|gdp|recession|fomc|tariff[s]?|rate (cut|hike))\b/i],
  ['market',   /\b(s&p 500|nasdaq|dow (jones)?|wall street|stock market|stocks (rise|fall|climb|slip)|futures|market (rally|selloff|close[sd]?))\b/i],
]

function classifyCategory(text: string): MarketNewsCategory {
  for (const [category, pattern] of CATEGORY_PATTERNS) {
    if (pattern.test(text)) return category
  }
  return 'general'
}

// ─── Related-ticker detection ─────────────────────────────────────────────────
// Extracted to lib/server/marketNewsSymbols.ts (pure, tested) — the regex
// construction there (escaping, cashtag rules, word boundaries) is exactly the
// kind of logic that breaks silently inside a route handler.

// ─── Route ────────────────────────────────────────────────────────────────────

// ─── Custom source fetching ───────────────────────────────────────────────────

function parseJsonNews(payload: unknown, provider: ActiveCustom): Omit<MarketArticle, 'sentiment' | 'category' | 'relatedSymbols' | 'isBreaking'>[] {
  const map = provider.jsonFieldMap ?? {}
  const out: Omit<MarketArticle, 'sentiment' | 'category' | 'relatedSymbols' | 'isBreaking'>[] = []
  for (const entry of findArray(payload, provider.jsonArrayPath)) {
    const title = pickString(entry, map.headline ?? map.title, ['title', 'headline', 'name'])
    const url = pickString(entry, map.url, ['url', 'link', 'article_url'])
    if (!title || !url) continue
    out.push({
      id: `${provider.id}:${url}`.slice(0, 200),
      title,
      url,
      source: provider.name,
      publishedAt: pickDate(entry, map.publishedAt, ['publishedAt', 'published_at', 'date', 'pubDate', 'datetime', 'created_at']) ?? new Date().toISOString(),
      summary: (pickString(entry, map.summary, ['summary', 'description', 'excerpt', 'text']) ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 280),
    })
  }
  return out
}

async function fetchCustomNews(provider: ActiveCustom, symbol?: string) {
  const url = provider.url.replace('{symbol}', symbol ?? 'SPY')
  const res = await fetchCustomUrl(provider, url)
  if (provider.format === 'json-news') return parseJsonNews(await res.json(), provider)
  return parseRss(await res.text(), provider.name) // rss / atom
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol')?.trim().toUpperCase()
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') ?? '20', 10) || 20, 50)

  // Watchlist tickers. This used to WIDEN coverage — one extra per-ticker Yahoo
  // feed per name, genuinely fetching stories the general wires never carried.
  // With that feed gone the parameter can only NARROW: the same general wires
  // are read either way, and the watchlist selects from what came back. The cap
  // therefore no longer limits requests (there are none to limit); it limits how
  // many names the match test runs over, which is cheap. It is kept so a
  // 200-name watchlist can't turn into a 200-branch regex sweep per article.
  const watchlist = (request.nextUrl.searchParams.get('watchlist') ?? '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, MAX_WATCHLIST_FEEDS)
  // (?watchlistOnly= was removed 2026-08-16 — zero consumers; the watchlist
  // param widens coverage, and clients narrow via bias, not here.)

  const active = getEquityProviders('news')
  const builtins = active.filter((p): p is AnyActiveProvider & { isCustom?: false } => !p.isCustom && p.id in BUILTIN_FEEDS)
  const customs = active.filter((p): p is AnyActiveProvider & ActiveCustom =>
    !!p.isCustom && ['rss', 'atom', 'json-news'].includes(p.format))

  // Symbol mode: every general wire + symbol-aware customs, then filtered to
  // articles that actually mention the company (see `symbolMatches` below).
  type Task = { providerId: string; run: () => Promise<Omit<MarketArticle, 'sentiment' | 'category' | 'relatedSymbols' | 'isBreaking'>[]> }
  const tasks: Task[] = []
  const fetchBuiltin = (url: string, source: string) => async () => {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FinanceNow/1.0)', Accept: 'application/rss+xml, application/xml, text/xml' },
      next: { revalidate: 300 },
    })
    if (!res.ok) throw new Error(`${source} ${res.status}`)
    return parseRss(await res.text(), source)
  }

  // Both modes now read the same set of general wires — there is no per-ticker
  // feed left to make symbol mode fetch anything different.
  for (const p of builtins) tasks.push({ providerId: p.id, run: fetchBuiltin(BUILTIN_FEEDS[p.id].url, BUILTIN_FEEDS[p.id].source) })
  for (const p of customs) {
    if (symbol && !p.url.includes('{symbol}') && tasks.length > 0) continue // general-only custom feeds skip symbol mode
    tasks.push({ providerId: p.id, run: () => fetchCustomNews(p, symbol) })
  }

  const results = await Promise.allSettled(tasks.map((t) => t.run()))
  results.forEach((result, i) => {
    recordProviderFetch(tasks[i].providerId, result.status === 'fulfilled'
      ? { count: result.value.length }
      : { error: result.reason instanceof Error ? result.reason.message : String(result.reason) })
  })

  // Off-catalog symbol mode (funds, arbitrary tickers): the requested symbol
  // gets its own matcher, or every such request would return empty forever —
  // the catalog matchers simply don't know it exists.
  const extraMatcher = symbol ? requestedMatcher(symbol) : null

  const seen = new Set<string>()
  const articles: MarketArticle[] = []
  for (const result of results) {
    if (result.status !== 'fulfilled') continue
    for (const article of result.value) {
      const key = article.title.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      const text = `${article.title} ${article.summary}`
      // The requested symbol used to be force-tagged onto every article,
      // because in symbol mode every article HAD come from that ticker's own
      // feed. It doesn't any more — the wires are general — so tagging is now
      // purely detection. Force-tagging here would relabel unrelated market
      // stories as being about the company, which is precisely the kind of
      // fabricated relationship this codebase refuses elsewhere.
      articles.push({
        ...article,
        sentiment: scoreSentiment(text),
        category: classifyCategory(text),
        relatedSymbols: detectSymbols(text, extraMatcher),
        isBreaking: Date.now() - new Date(article.publishedAt).getTime() < 60 * 60 * 1000,
      })
    }
  }

  // Symbol mode filters rather than fetches now. `detectSymbols` matches the
  // catalog company name or an unambiguous ticker, so this keeps the stories
  // that genuinely name the company and drops the rest — an empty result is
  // the honest answer when the wires simply haven't covered it today.
  const symbolMatches = (a: MarketArticle) => a.relatedSymbols.includes(symbol!)

  articles.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())

  const shown = symbol ? articles.filter(symbolMatches) : articles

  return NextResponse.json({
    ok: shown.length > 0,
    updatedAt: new Date().toISOString(),
    articles: shown.slice(0, limit),
    ...(symbol && shown.length === 0
      ? {
          error: `No current headline on the general market wires mentions ${symbol}. Finance Now no longer has a per-ticker news feed — the only free one was withdrawn on terms grounds — so symbol news is whatever the market wires happen to cover.`,
        }
      : {}),
  } satisfies MarketNewsResponse)
}
