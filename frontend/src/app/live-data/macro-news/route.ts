import { NextRequest, NextResponse } from 'next/server'
import { decodeEntities, stripCdata } from '@/lib/utils/html'
import { COMMODITY_CATALOG } from '@/lib/data/commodityCatalog'
import { getMacroProviders, recordProviderFetch, type AnyActiveProvider } from '@/lib/api/live/providers'
import { fetchCustomUrl, findArray, pickDate, pickString, type ActiveCustom } from '@/lib/server/customFeeds'

// Macro Markets news — commodities, currencies, and bonds/rates ONLY.
//   GET /live-data/macro-news                    → all three pillars merged
//   GET /live-data/macro-news?pillar=commodities → one pillar
//   GET /live-data/macro-news?limit=30
//
// Mirrors the market-news route pattern (parallel keyless RSS via
// Promise.allSettled, keyword sentiment). Feeds were probed live 2026-07-21.
// Classification is content-first: an article's own text decides its pillar,
// falling back to the feed's default; articles from general feeds that match
// no pillar are DROPPED — this route never serves off-topic filler.
//
// Registry-driven: each feed below is a `market: 'macro'` provider row, so
// the Integrations page can toggle sources and shows per-feed utilization.

export const dynamic = 'force-dynamic'

export type MacroSentiment = 'positive' | 'negative' | 'neutral'
export type MacroPillar = 'commodities' | 'currencies' | 'bonds'

export interface MacroRelated {
  label: string
  href: string
}

export interface MacroNewsArticle {
  id: string
  title: string
  url: string
  source: string
  publishedAt: string
  summary: string
  sentiment: MacroSentiment
  pillar: MacroPillar
  /** Catalog instruments detected in the text, linked to their detail pages. */
  related: MacroRelated[]
  /** Published within the last hour. */
  isBreaking: boolean
}

export interface MacroNewsResponse {
  ok: boolean
  updatedAt: string
  articles: MacroNewsArticle[]
}

// ─── Feeds (all keyless; probed working 2026-07-21) ──────────────────────────

// Order matters twice over: topic feeds run before general ones so dropped
// duplicates credit the topical source, and the bonds feed runs before forex
// because Investing.com cross-posts rates stories to both.
const FEEDS: Array<{ providerId: string; url: string; source: string; defaultPillar: MacroPillar | null }> = [
  { providerId: 'investing-commodities', url: 'https://www.investing.com/rss/news_11.rss',           source: 'Investing.com Commodities', defaultPillar: 'commodities' },
  { providerId: 'oilprice',              url: 'https://oilprice.com/rss/main',                       source: 'OilPrice',                  defaultPillar: 'commodities' },
  { providerId: 'investing-bonds',       url: 'https://www.investing.com/rss/bonds_Fundamental.rss', source: 'Investing.com Bonds',       defaultPillar: 'bonds' },
  { providerId: 'investing-forex',       url: 'https://www.investing.com/rss/news_1.rss',            source: 'Investing.com Forex',       defaultPillar: 'currencies' },
  { providerId: 'fxstreet',              url: 'https://www.fxstreet.com/rss/news',                   source: 'FXStreet',                  defaultPillar: 'currencies' },
  // General feeds: kept only when an article classifies into a pillar.
  // CNBC Economy is here mainly to feed the bonds pillar — the dedicated
  // Investing.com bonds feed publishes op-eds every few weeks, not news.
  { providerId: 'marketwatch-macro', url: 'https://feeds.content.dowjones.io/public/rss/mw_bulletins', source: 'MarketWatch', defaultPillar: null },
  { providerId: 'cnbc-macro',        url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664', source: 'CNBC', defaultPillar: null },
  { providerId: 'cnbc-economy',      url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258', source: 'CNBC Economy', defaultPillar: null },
]

/** Articles older than this are dropped — stale filler is worse than fewer stories. */
const MAX_AGE_MS = 14 * 86_400_000

// ─── RSS parsing (same shape as the market-news route) ───────────────────────

interface RawArticle {
  id: string
  title: string
  url: string
  source: string
  publishedAt: string
  summary: string
}

function extractTag(item: string, tag: string): string {
  const match = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'))
  return match ? decodeEntities(stripCdata(match[1])) : ''
}

/** `2026-07-22 13:16:28` or `2026-07-22T13:16:28` with no trailing zone. */
const TZLESS_DATETIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/

/**
 * Parse an RSS pubDate to an epoch, defaulting a missing timezone to UTC.
 *
 * Investing.com (3 of the 8 feeds) emits `<pubDate>2026-07-22 13:16:28</pubDate>`
 * with no zone, and `new Date()` reads a zone-less string as LOCAL time. On a
 * UTC−4 host that stamps every article 4 hours in the FUTURE — so the previous
 * clamp-to-now pinned the whole block to the fetch instant, which made every
 * one of them render as "just now", flagged them all Breaking (`now - published
 * < 1h` is trivially true after clamping), and floated them above genuinely
 * newer stories from the other feeds. It also meant the same feed produced
 * different timestamps depending on the server's timezone.
 *
 * Treating a zone-less stamp as UTC fixes the offset at the source. The clamp
 * stays as a backstop for feeds that really are ahead, but it should now be
 * rare rather than routine.
 */
export function parsePubDate(raw: string, now: number): number {
  const s = raw.trim()
  if (!s) return now
  const normalized = TZLESS_DATETIME.test(s) ? `${s.replace(' ', 'T')}Z` : s
  const t = new Date(normalized).getTime()
  if (!Number.isFinite(t)) return now
  return Math.min(t, now)
}

function parseRss(xml: string, source: string): RawArticle[] {
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? []
  const now = Date.now()
  return items.map((item) => {
    const title = extractTag(item, 'title')
    const url = extractTag(item, 'link')
    const pubDate = extractTag(item, 'pubDate')
    const description = extractTag(item, 'description')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    const publishedAt = new Date(parsePubDate(pubDate, now)).toISOString()
    return {
      id: `${source}:${url || title}`.slice(0, 200),
      title,
      url,
      source,
      publishedAt,
      summary: description.slice(0, 280),
    }
  }).filter((a) => a.title && a.url)
}

// ─── Sentiment (same keyword approach as market-news) ────────────────────────

const POSITIVE = /\b(surge[sd]?|rall(y|ies|ied)|record|soar[sed]*|jump[sed]*|gain[sed]*|bullish|strong|tops|climbs?|boost[sed]*|rebound[sed]*|all-time high)\b/i
const NEGATIVE = /\b(fall[s]?|fell|drop[sped]*|plunge[sd]?|cut[s]?|bearish|weak|slump[sed]*|crash(es|ed)?|tumble[sd]?|sink[s]?|sank|fear[s]?|warn(s|ing)?|selloff|decline[sd]?|loss(es)?|glut|shortage)\b/i

function scoreSentiment(text: string): MacroSentiment {
  const positive = POSITIVE.test(text)
  const negative = NEGATIVE.test(text)
  if (positive && !negative) return 'positive'
  if (negative && !positive) return 'negative'
  return 'neutral'
}

// ─── Pillar classification ───────────────────────────────────────────────────
// A named currency is the strongest signal there is — an FX story about a
// central bank ("Turkish Lira: rising inflation expectations") is a currency
// story, not a bonds one, so explicit currency names are checked FIRST.
// Bare "dollar"/"greenback" stays weak (it appears in everything) and is only
// consulted after commodities and bonds have had their chance.

// Unambiguous currency names — none of these mean anything else in a macro
// headline, so they beat every other signal.
const STRONG_CURRENCY = /\b(euro|yen|sterling|franc|yuan|renminbi|peso|rupee|rand|lira|forint|zloty|krona|koruna|loonie|aussie|kiwi|(canadian|australian|new zealand|hong kong|singapore) dollar|forex|fx\b|currency pair[s]?|dollar index|dxy|carry trade|devalu\w+)\b/i

// Currency signals that are ALSO something else in a commodities story:
//   "pound"  — the weight ("coffee climbs to 320 cents a pound")
//   "xxx/yyy" — any slashed pair ("oil/gas rig count falls")
// Checked AFTER commodities so the commodity reading wins when a commodity
// noun is present, and still catches "the pound slipped after the BoE" or
// "EUR/USD holds gains" when one isn't.
const AMBIGUOUS_CURRENCY = /\b(pound|[a-z]{3}\/[a-z]{3})\b/i
const COMMODITY_TERMS = /\b(gold|silver|platinum|palladium|copper|crude|oil|opec|brent|wti|natural gas|lng|gasoline|diesel|heating oil|wheat|corn|soybean[s]?|coffee|sugar|cocoa|cotton|cattle|hogs?|commodit(y|ies)|metals?|mining|barrel[s]?|bushel|drilling|refin(ery|ing)|shale)\b/i
const BONDS_TERMS = /\b(treasur(y|ies)|yield[s]?|bond[s]?|fed|federal reserve|fomc|rate (cut|hike|decision)[s]?|interest rate[s]?|duration|2s10s|curve (steepen|flatten|invert)\w*|coupon|t-bill[s]?|gilt[s]?|bund[s]?|jgb[s]?|inflation|cpi|ppi)\b/i
const WEAK_CURRENCY = /\b(dollar|greenback|currenc(y|ies)|exchange rate[s]?|ecb|boj|bank of (england|japan)|pboc|snb)\b/i

export function classifyPillar(text: string, fallback: MacroPillar | null): MacroPillar | null {
  if (STRONG_CURRENCY.test(text)) return 'currencies'
  if (COMMODITY_TERMS.test(text)) return 'commodities'
  if (AMBIGUOUS_CURRENCY.test(text)) return 'currencies'
  if (BONDS_TERMS.test(text)) return 'bonds'
  if (WEAK_CURRENCY.test(text)) return 'currencies'
  return fallback
}

// ─── Related-instrument detection → catalog detail links ─────────────────────

const RELATED_MATCHERS: Array<{ pattern: RegExp; label: string; href: string }> = [
  // Commodities from the catalog (name match, plus common aliases)
  ...COMMODITY_CATALOG.map((c) => ({
    pattern: new RegExp(`\\b${c.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'),
    label: c.name,
    href: `/macro/commodities/${c.slug}`,
  })),
  { pattern: /\b(crude|oil price|opec|barrel)\b/i, label: 'WTI Crude Oil', href: '/macro/commodities/wti-crude' },
  { pattern: /\bbrent\b/i,                         label: 'Brent Crude Oil', href: '/macro/commodities/brent-crude' },
  // Currencies
  { pattern: /\b(eur\/usd|euro)\b/i,               label: 'EUR/USD', href: '/macro/currencies/eur-usd' },
  { pattern: /\b(gbp\/usd|sterling|pound|cable)\b/i, label: 'GBP/USD', href: '/macro/currencies/gbp-usd' },
  { pattern: /\b(usd\/jpy|yen)\b/i,                label: 'USD/JPY', href: '/macro/currencies/usd-jpy' },
  { pattern: /\b(dollar index|dxy)\b/i,            label: 'Dollar Index', href: '/macro/currencies/dollar-index' },
  { pattern: /\byuan|renminbi|usd\/cny\b/i,        label: 'USD/CNY', href: '/macro/currencies/usd-cny' },
  // Bonds & rates
  { pattern: /\b(10-year|10 year|ten-year)\b/i,    label: '10-Year Yield', href: '/macro/rates/10-year-yield' },
  { pattern: /\b(30-year|30 year|long bond)\b/i,   label: '30-Year Yield', href: '/macro/rates/30-year-yield' },
  { pattern: /\b(t-bill|3-month|13-week)\b/i,      label: '13-Week Yield', href: '/macro/rates/13-week-yield' },
]

function detectRelated(text: string): MacroRelated[] {
  const seen = new Set<string>()
  const out: MacroRelated[] = []
  for (const m of RELATED_MATCHERS) {
    if (out.length >= 4) break
    if (!seen.has(m.href) && m.pattern.test(text)) {
      seen.add(m.href)
      out.push({ label: m.label, href: m.href })
    }
  }
  return out
}

// ─── Route ───────────────────────────────────────────────────────────────────

function parseJsonNews(payload: unknown, provider: ActiveCustom): RawArticle[] {
  const entries = findArray(payload, provider.jsonArrayPath)
  const map = provider.jsonFieldMap ?? {}
  const out: RawArticle[] = []
  for (const entry of entries.slice(0, 40)) {
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

async function fetchCustomMacroNews(provider: ActiveCustom): Promise<RawArticle[]> {
  const res = await fetchCustomUrl(provider, provider.url)
  if (provider.format === 'json-news') return parseJsonNews(await res.json(), provider)
  return parseRss(await res.text(), provider.name) // rss / atom
}

export async function GET(request: NextRequest) {
  const pillarParam = request.nextUrl.searchParams.get('pillar') as MacroPillar | null
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') ?? '40', 10) || 40, 80)

  // Only feeds whose provider row is enabled run; a fresh install has every
  // built-in active, so default behaviour is unchanged. Custom macro feeds
  // are classifier-gated like the general wires (defaultPillar null).
  const active = getMacroProviders('news')
  const activeIds = new Set(active.map((p) => p.id))
  const customs = active.filter((p): p is AnyActiveProvider & ActiveCustom =>
    !!p.isCustom && ['rss', 'atom', 'json-news'].includes(p.format))

  type FeedTask = { providerId: string; defaultPillar: MacroPillar | null; run: () => Promise<RawArticle[]> }
  const tasks: FeedTask[] = FEEDS.filter((f) => activeIds.has(f.providerId)).map((feed) => ({
    providerId: feed.providerId,
    defaultPillar: feed.defaultPillar,
    run: async () => {
      const res = await fetch(feed.url, {
        next: { revalidate: 300 },
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CAEP/1.0)', Accept: 'application/rss+xml, application/xml, text/xml' },
      })
      if (!res.ok) throw new Error(`${feed.source} ${res.status}`)
      return parseRss(await res.text(), feed.source)
    },
  }))
  for (const p of customs) {
    tasks.push({ providerId: p.id, defaultPillar: null, run: () => fetchCustomMacroNews(p) })
  }

  const results = await Promise.allSettled(tasks.map((t) => t.run()))
  results.forEach((result, i) => {
    recordProviderFetch(tasks[i].providerId, result.status === 'fulfilled'
      ? { count: result.value.length }
      : { error: result.reason instanceof Error ? result.reason.message : String(result.reason) })
  })

  const now = Date.now()
  const seenTitles = new Set<string>()
  const articles: MacroNewsArticle[] = []

  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    if (r.status !== 'fulfilled') continue
    for (const raw of r.value) {
      if (now - new Date(raw.publishedAt).getTime() > MAX_AGE_MS) continue
      const text = `${raw.title} ${raw.summary}`
      const pillar = classifyPillar(text, tasks[i].defaultPillar)
      if (!pillar) continue // article about no pillar — drop
      // Dedupe near-identical stories syndicated across feeds.
      const titleKey = raw.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 80)
      if (seenTitles.has(titleKey)) continue
      seenTitles.add(titleKey)
      articles.push({
        ...raw,
        sentiment: scoreSentiment(text),
        pillar,
        related: detectRelated(text),
        isBreaking: now - new Date(raw.publishedAt).getTime() < 3_600_000,
      })
    }
  }

  articles.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))

  let filtered: MacroNewsArticle[]
  if (pillarParam) {
    filtered = articles.filter((a) => a.pillar === pillarParam).slice(0, limit)
  } else {
    // Balanced merge: pure date order lets one prolific FX feed crowd the
    // slower bonds pillar out of the response entirely, so each pillar is
    // guaranteed up to a quarter of the slots first; date order fills the rest.
    const floor = Math.floor(limit / 4)
    const taken = new Set<string>()
    for (const p of ['commodities', 'currencies', 'bonds'] as MacroPillar[]) {
      for (const a of articles.filter((x) => x.pillar === p).slice(0, floor)) taken.add(a.id)
    }
    for (const a of articles) {
      if (taken.size >= limit) break
      taken.add(a.id)
    }
    filtered = articles.filter((a) => taken.has(a.id)).slice(0, limit)
  }

  return NextResponse.json<MacroNewsResponse>({
    ok: results.some((r) => r.status === 'fulfilled'),
    updatedAt: new Date().toISOString(),
    articles: filtered,
  })
}
