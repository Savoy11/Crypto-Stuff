import { NextRequest, NextResponse } from 'next/server'
import { EQUITY_CATALOG } from '@/lib/data/equityCatalog'

// Server-side proxy for stock-market news (equities & funds modules).
//   GET /live-data/market-news                → general market headlines
//   GET /live-data/market-news?symbol=AAPL    → per-ticker headlines
//   GET /live-data/market-news?limit=20
//
// Sources are free RSS feeds fetched with Promise.allSettled — any subset may
// fail without crashing the route. Sentiment is keyword-based, mirroring the
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
}

const GENERAL_FEEDS: Array<{ url: string; source: string }> = [
  { url: 'https://finance.yahoo.com/news/rssindex', source: 'Yahoo Finance' },
  { url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories', source: 'MarketWatch' },
  { url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114', source: 'CNBC' },
]

function tickerFeed(symbol: string): { url: string; source: string } {
  const params = new URLSearchParams({ s: symbol, region: 'US', lang: 'en-US' })
  return { url: `https://feeds.finance.yahoo.com/rss/2.0/headline?${params}`, source: 'Yahoo Finance' }
}

// ─── RSS parsing ──────────────────────────────────────────────────────────────

function stripCdata(value: string): string {
  return value.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim()
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

function extractTag(item: string, tag: string): string {
  const match = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'))
  return match ? decodeEntities(stripCdata(match[1])) : ''
}

function parseRss(xml: string, source: string): Omit<MarketArticle, 'sentiment' | 'category' | 'relatedSymbols' | 'isBreaking'>[] {
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? []
  return items.map((item) => {
    const title = extractTag(item, 'title')
    const url = extractTag(item, 'link')
    const pubDate = extractTag(item, 'pubDate')
    const description = extractTag(item, 'description')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    return {
      id: `${source}:${url || title}`.slice(0, 200),
      title,
      url,
      source,
      publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      summary: description.slice(0, 280),
    }
  }).filter((a) => a.title && a.url)
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
// Company names match case-insensitively; tickers require $SYM or an exact
// uppercase word (3+ chars only — short symbols like T or GE false-positive).

const NAME_MATCHERS = EQUITY_CATALOG.map((e) => ({
  symbol: e.symbol,
  name: new RegExp(`\\b${e.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'),
  ticker: e.symbol.length >= 3 ? new RegExp(`(\\$${e.symbol}\\b|\\b${e.symbol}\\b(?=[^a-z]|$))`) : new RegExp(`\\$${e.symbol}\\b`),
}))

function detectSymbols(text: string): string[] {
  const found: string[] = []
  for (const m of NAME_MATCHERS) {
    if (m.name.test(text) || m.ticker.test(text)) found.push(m.symbol)
    if (found.length >= 6) break
  }
  return found
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol')?.trim().toUpperCase()
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') ?? '20', 10) || 20, 50)

  const feeds = symbol ? [tickerFeed(symbol), ...GENERAL_FEEDS.slice(0, 1)] : GENERAL_FEEDS

  const results = await Promise.allSettled(
    feeds.map(async ({ url, source }) => {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CAEP/1.0)', Accept: 'application/rss+xml, application/xml, text/xml' },
        next: { revalidate: 300 },
      })
      if (!res.ok) throw new Error(`${source} ${res.status}`)
      return parseRss(await res.text(), source)
    })
  )

  const seen = new Set<string>()
  const articles: MarketArticle[] = []
  for (const result of results) {
    if (result.status !== 'fulfilled') continue
    for (const article of result.value) {
      const key = article.title.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      const text = `${article.title} ${article.summary}`
      const related = detectSymbols(text)
      if (symbol && !related.includes(symbol)) related.unshift(symbol)
      articles.push({
        ...article,
        sentiment: scoreSentiment(text),
        category: classifyCategory(text),
        relatedSymbols: related,
        isBreaking: Date.now() - new Date(article.publishedAt).getTime() < 60 * 60 * 1000,
      })
    }
  }

  articles.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())

  return NextResponse.json({
    ok: articles.length > 0,
    updatedAt: new Date().toISOString(),
    articles: articles.slice(0, limit),
  } satisfies MarketNewsResponse)
}
