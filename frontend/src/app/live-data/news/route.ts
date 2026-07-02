import { NextRequest, NextResponse } from 'next/server'
import { getNewsProviders, recordProviderFetch, type AnyActiveProvider, type CustomProviderDef } from '@/lib/api/live/providers'

export const dynamic = 'force-dynamic'

export interface LiveNewsArticle {
  id: string
  headline: string
  summary: string
  source: string        // the publication name (e.g. "CoinDesk")
  provider: string      // provider service id (e.g. "cryptopanic")
  providerLabel: string // human-readable (e.g. "CryptoPanic")
  publishedAt: string
  url: string
  sentiment: 'positive' | 'neutral' | 'negative'
  category: 'regulation' | 'market' | 'protocol' | 'security' | 'adoption' | 'macro' | 'global' | 'general'
  relatedAssets: string[]
  isBreaking: boolean
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const assetFilter = searchParams.get('asset') ?? 'all'
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 100)
  // Keyword search — comma-separated terms. Passed to text-search-capable
  // providers (NewsAPI, GNews) so the feed pulls in stories matching the
  // keyword rather than only filtering what's already loaded.
  const keywords = (searchParams.get('q') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const searchQuery = keywords.join(' ')

  const providers = getNewsProviders()
  if (providers.length === 0) {
    return NextResponse.json({ ok: false, articles: [], providers: [] })
  }

  const results = await Promise.allSettled(
    providers.map((p) => fetchFromProvider(p, assetFilter, limit, searchQuery))
  )

  const allArticles: LiveNewsArticle[] = []
  const seenUrls = new Set<string>()

  results.forEach((result, i) => {
    const providerId = providers[i].id
    if (result.status === 'fulfilled') {
      recordProviderFetch(providerId, { count: result.value.length })
      for (const article of result.value) {
        if (!seenUrls.has(article.url)) {
          seenUrls.add(article.url)
          allArticles.push(article)
        }
      }
    } else {
      // Surface the failure on the Integrations page instead of swallowing it.
      recordProviderFetch(providerId, {
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      })
    }
  })

  allArticles.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())

  // Server-side asset filter — keep articles that mention the selected asset
  // or are broadly relevant (relatedAssets empty = truly general crypto news)
  const filtered = assetFilter === 'all'
    ? allArticles
    : allArticles.filter((a) =>
        a.relatedAssets.includes(assetFilter) ||
        a.relatedAssets.includes('general')
      )

  return NextResponse.json({
    ok: true,
    articles: filtered.slice(0, limit),
    providers: providers.map((p) => ({ id: p.id, name: p.name })),
  })
}

// ─── Asset & sentiment detection ──────────────────────────────────────────────
//
// Each entry maps a regex to one or more asset IDs. Patterns are tested against
// the full lowercased article text (title + description). Order matters only
// for specificity — more specific patterns should come first.

const ASSET_SIGNALS: { id: string; re: RegExp }[] = [
  // Bitcoin
  { id: 'btc',  re: /\b(bitcoin|btc|satoshi(s)?|sats|lightning network|lightning channel)\b/i },
  // Ethereum
  { id: 'eth',  re: /\b(ethereum|ether\b|eth\b|erc-?20|vitalik|gas fees?|proof.of.stake)\b/i },
  // USDC — Circle is the issuer; Coinbase co-issues
  { id: 'usdc', re: /\b(usdc|usd coin|usd-coin|circle\b|circle's|circle is|coinbase usdc)\b/i },
  // USDT — Tether is the issuer
  { id: 'usdt', re: /\b(usdt|tether\b|tether's|tether limited|paolo ardoino)\b/i },
  // DAI — MakerDAO / Sky Protocol
  { id: 'dai',  re: /\b(dai\b|makerdao|maker dao|maker protocol|sky protocol|mkr\b|cdp\b|collateralized debt position)\b/i },
  // FRAX
  { id: 'frax', re: /\b(frax\b|fraxswap|fraxlend|frax protocol|sam kazemian)\b/i },
  // TUSD
  { id: 'tusd', re: /\b(tusd|trueusd|true usd)\b/i },
  // PYUSD — PayPal issued
  { id: 'pyusd', re: /\b(pyusd|paypal usd|paypal stablecoin|paypal's stablecoin|paypal digital)\b/i },
  // USDP — Paxos issued (not BUSD)
  { id: 'usdp', re: /\b(usdp|pax dollar|paxos\b(?!.*busd)|paxos trust(?!.*busd))\b/i },
  // GUSD — Gemini issued
  { id: 'gusd', re: /\b(gusd|gemini dollar|gemini stablecoin)\b/i },
  // LUSD — Liquity Protocol
  { id: 'lusd', re: /\b(lusd|liquity\b|liquity protocol)\b/i },
  // BUSD — Binance / Paxos (sunset)
  { id: 'busd', re: /\b(busd|binance usd)\b/i },
  // BNB
  { id: 'bnb',  re: /\b(bnb\b|binance coin|binance smart chain|bsc\b|bnb chain|bnb beacon)\b/i },
  // Solana
  { id: 'sol',  re: /\b(solana|sol\b)\b/i },
]

// Regulatory & thematic signals that impact specific asset groups even when
// the coin is not named directly in the article.
// Example: "MiCA regulation" → affects USDC and USDT because they are the
// dominant EU-regulated stablecoins.
const REGULATORY_IMPACT: { re: RegExp; assets: string[] }[] = [
  // EU / MiCA — targets regulated stablecoin issuers
  {
    re: /\b(mica|markets in crypto.assets|eu stablecoin|ecb stablecoin|ecb digital|european stablecoin)\b/i,
    assets: ['usdc', 'usdt'],
  },
  // US stablecoin legislation — GENIUS Act, Clarity Act, etc.
  {
    re: /\b(genius act|stablecoin act|clarity act|stablecoin bill|stablecoin legislation|us stablecoin|senate stablecoin|house stablecoin)\b/i,
    assets: ['usdc', 'usdt', 'pyusd'],
  },
  // Circle-specific enforcement / partnership news
  {
    re: /circle\b.{0,60}(regulat|licens|approv|partner|sec\b|cftc|federal|compliance)/i,
    assets: ['usdc'],
  },
  // Tether-specific enforcement / restriction
  {
    re: /tether\b.{0,60}(ban|regulat|restrict|probe|invest|doj|ofac|sanction)/i,
    assets: ['usdt'],
  },
  // PayPal fintech regulation indirectly hits PYUSD
  {
    re: /paypal\b.{0,60}(regulat|crypto|stablecoin|digital|licens)/i,
    assets: ['pyusd'],
  },
  // Paxos regulatory news hits USDP (and historically BUSD)
  {
    re: /paxos\b.{0,60}(regulat|nydfs|sec\b|licens|approv|busd)/i,
    assets: ['usdp', 'busd'],
  },
  // DeFi regulation hits protocol-backed stablecoins
  {
    re: /\b(defi regulat|decentralized finance regulat|defi protocol law|dao regulat)\b/i,
    assets: ['dai', 'frax', 'lusd'],
  },
  // CBDC competition / interoperability — relevant to all major stablecoins
  {
    re: /\bcbdc\b/i,
    assets: ['usdc', 'usdt'],
  },
  // Reserve requirement laws broadly affect fiat-backed stablecoins
  {
    re: /\b(reserve requirement|backing requirement|1.?to.?1 backing|full reserve|fractional reserve)\b/i,
    assets: ['usdc', 'usdt', 'tusd', 'gusd', 'usdp', 'pyusd'],
  },
  // Binance regulatory news touches BNB broadly
  {
    re: /binance\b.{0,60}(ban|regulat|fine|settle|doj|sec\b|cftc|money laundering)/i,
    assets: ['bnb', 'busd'],
  },
  // Lightning Network / Bitcoin payments
  {
    re: /\b(lightning network|lightning payment|bitcoin payment|bitcoin adoption|legal tender)\b/i,
    assets: ['btc'],
  },
  // Ethereum staking / ETF coverage
  {
    re: /\b(ethereum etf|eth etf|ethereum staking|proof.of.stake regulat|ethereum layer)\b/i,
    assets: ['eth'],
  },
]

// When an article mentions "stablecoin" broadly but no specific coin is
// detected, tag the three most universal stablecoins so it appears in
// their feeds. Marked as 'general' so it can also be filtered out if needed.
const STABLECOIN_GENERAL_TAG = 'general'
const STABLECOIN_GENERAL_ASSETS = ['usdc', 'usdt', 'dai', STABLECOIN_GENERAL_TAG]

function detectRelatedAssets(text: string): string[] {
  const found = new Set<string>()

  // 1. Direct name / symbol mentions
  for (const { id, re } of ASSET_SIGNALS) {
    if (re.test(text)) found.add(id)
  }

  // 2. Regulatory / thematic inference
  for (const { re, assets } of REGULATORY_IMPACT) {
    if (re.test(text)) assets.forEach((a) => found.add(a))
  }

  // 3. Broad stablecoin mention with no specific coin → tag as general stablecoin
  if (found.size === 0 && /stablecoin/i.test(text)) {
    STABLECOIN_GENERAL_ASSETS.forEach((a) => found.add(a))
  }

  // 4. Crypto / blockchain / digital asset with no specific coin → general
  if (found.size === 0 && /\b(crypto|blockchain|digital asset|digital currency|web3|defi|nft)\b/i.test(text)) {
    found.add(STABLECOIN_GENERAL_TAG)
  }

  return [...found]
}

// ─── Sentiment detection ──────────────────────────────────────────────────────

const POSITIVE_SIGNALS = /\b(approv|approved|adoption|adopt|bullish|surge|soar|record|ath|legiti|partnership|integrat|launch|growth|win|gain|recov|rally|green|optimis|support|embrace|expand|progress|milestone|breakthrough|signed|passed|clarity|compliance|welcome)\b/i
const NEGATIVE_SIGNALS = /\b(crash|ban|banned|prohibit|hack|exploit|vulnerab|fraud|scam|fail|collapse|risk|warn|decline|dump|bear|lawsuit|probe|restrict|sanction|suspend|halt|seize|seized|illegal|penalty|fine|shutdown|delist|investigation|enforcement|reject|veto)\b/i

function detectSentiment(text: string): LiveNewsArticle['sentiment'] {
  const pos = (text.match(POSITIVE_SIGNALS) || []).length
  const neg = (text.match(NEGATIVE_SIGNALS) || []).length
  if (pos > neg + 1) return 'positive'
  if (neg > pos + 1) return 'negative'
  return 'neutral'
}

// ─── Category detection ───────────────────────────────────────────────────────

function detectCategory(text: string): LiveNewsArticle['category'] {
  // Global must come first — international context overrides domestic categories
  const isGlobal =
    /\b(china|chinese|japan|japanese|korea|korean|india|indian|nigeria|nigerian|brazil|brazilian|argentina|uk |britain|british|europe|european|eu |germany|german|france|french|italy|italian|spain|spanish|singapore|uae|dubai|australia|australian|canada|canadian|mexico|mexican|el salvador|kenya|ghana|indonesia|thailand|vietnam|turkey|turkish|russia|russian|latin america|africa|asia|asia.pacific|middle east|global south|israel|israel|iran|iranian|hong kong)\b/i.test(text) ||
    /\b(mica|ecb|fca\b|mas\b|rbi\b|sebi|fsca|bafin|amf\b|jfsa|imf\b|world bank|bis\b|fatf|g20|g7|cross.border|cross border|international|transnational|remittance|foreign|overseas|offshore)\b/i.test(text)

  if (isGlobal) return 'global'
  if (/\b(regulat|legislat|bill\b|congress|senate|sec\b|cftc|fsoc|fincen|mica|law\b|compliance|nydfs|eba\b|mifid|msb\b)\b/i.test(text)) return 'regulation'
  if (/\b(hack|exploit|vulnerab|breach|attack|fraud|scam|rug.?pull|phish|malware|ransom|theft|stolen)\b/i.test(text)) return 'security'
  if (/\b(protocol|upgrade|fork|launch|deploy|v\d|mainnet|testnet|smart contract|audit|bug|fix)\b/i.test(text)) return 'protocol'
  if (/\b(adopt|partner|integrat|institu|bank\b|fund\b|etf\b|custody|treasury|corporate|enterprise)\b/i.test(text)) return 'adoption'
  if (/\b(cpi|fed\b|inflation|gdp\b|rate\b|macro|treasur|fed reserve|interest rate|yield|bond|monetary)\b/i.test(text)) return 'macro'
  return 'market'
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

async function fetchFromProvider(provider: AnyActiveProvider, asset: string, limit: number, search: string): Promise<LiveNewsArticle[]> {
  const key = provider.config.apiKey
  if (provider.isCustom) {
    return fetchCustomProvider(provider as AnyActiveProvider & CustomProviderDef, key, asset, limit)
  }
  switch (provider.id) {
    case 'cryptopanic': return fetchCryptoPanic(key, asset, limit)
    case 'messari':     return key ? fetchMessari(key, asset, limit) : []
    case 'newsapi':     return key ? fetchNewsAPI(key, asset, limit, search) : []
    case 'gnews':       return key ? fetchGNews(key, asset, limit, search) : []
    default:            return []
  }
}

// ─── Custom provider fetcher ──────────────────────────────────────────────────

async function fetchCustomProvider(
  provider: AnyActiveProvider & CustomProviderDef,
  apiKey: string | undefined,
  assetFilter: string,
  limit: number
): Promise<LiveNewsArticle[]> {
  const url = provider.url.replace('{asset}', assetFilter !== 'all' ? assetFilter : 'bitcoin')

  const headers: Record<string, string> = { Accept: 'application/json, application/rss+xml, */*' }
  let finalUrl = url

  if (apiKey) {
    if (provider.authMethod === 'header' && provider.authHeaderName) {
      headers[provider.authHeaderName] = apiKey
    } else if (provider.authMethod === 'bearer') {
      headers['Authorization'] = `Bearer ${apiKey}`
    } else if (provider.authMethod === 'query' && provider.authQueryParam) {
      const sep = url.includes('?') ? '&' : '?'
      finalUrl = `${url}${sep}${provider.authQueryParam}=${encodeURIComponent(apiKey)}`
    }
  }

  const res = await fetch(finalUrl, { headers, next: { revalidate: 120 } })
  if (!res.ok) throw new Error(`Custom provider ${provider.name}: HTTP ${res.status}`)

  const contentType = res.headers.get('content-type') ?? ''

  // XML-based formats: RSS 2.0 and Atom both use the same parser
  // (it matches both <item> and <entry> elements)
  if (
    provider.format === 'rss' ||
    provider.format === 'atom' ||
    contentType.includes('xml') ||
    contentType.includes('rss') ||
    contentType.includes('atom')
  ) {
    return parseRssFeed(await res.text(), provider, limit)
  }

  const data = await res.json()

  // JSON social posts share the same shape as news articles for our purposes
  if (provider.format === 'json-news' || provider.format === 'json-social') {
    return parseJsonNewsFeed(data, provider, limit)
  }

  // GraphQL — caller is expected to set jsonArrayPath to reach the articles array
  // e.g. "data.newsItems" or "data.posts"
  if (provider.format === 'graphql') {
    return parseJsonNewsFeed(data, provider, limit)
  }

  // WebSocket sources cannot be polled via a one-shot HTTP fetch.
  // Log a hint and return empty — WS support requires a persistent server process.
  if (provider.format === 'websocket') {
    console.warn(`[news] Provider "${provider.name}" uses WebSocket — polling not supported. Use a WS relay or choose a REST format.`)
    return []
  }

  return []
}

function parseRssFeed(xml: string, provider: CustomProviderDef, limit: number): LiveNewsArticle[] {
  // Support both RSS 2.0 <item> and Atom <entry> elements
  const rssItems  = [...xml.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/gi)]
  const atomItems = [...xml.matchAll(/<entry[^>]*>([\s\S]*?)<\/entry>/gi)]
  const items = (rssItems.length >= atomItems.length ? rssItems : atomItems).slice(0, limit)
  const isAtom = rssItems.length < atomItems.length

  return items.map((m, i): LiveNewsArticle => {
    const inner = m[1]
    const title = stripCdata(inner.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '')
    // Atom uses <link href="..."/> while RSS uses <link>url</link>
    const link = isAtom
      ? (inner.match(/<link[^>]*href="([^"]+)"/i)?.[1] ?? '#')
      : stripCdata(inner.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] ?? '#')
    // Atom uses <updated> or <published>; RSS uses <pubDate>
    const pubDate = inner.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1]
      ?? inner.match(/<published[^>]*>([\s\S]*?)<\/published>/i)?.[1]
      ?? inner.match(/<updated[^>]*>([\s\S]*?)<\/updated>/i)?.[1]
      ?? ''
    // Atom uses <content> or <summary>; RSS uses <description>
    const desc = stripCdata(
      inner.match(/<content[^>]*>([\s\S]*?)<\/content>/i)?.[1]
      ?? inner.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i)?.[1]
      ?? inner.match(/<description[^>]*>([\s\S]*?)<\/description>/i)?.[1]
      ?? ''
    )
    const sourceName = stripCdata(inner.match(/<source[^>]*>([\s\S]*?)<\/source>/i)?.[1] ?? provider.name)

    const cleanDesc = desc.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    const text = title + ' ' + cleanDesc

    return {
      id: `${provider.id}-${i}-${Date.now()}`,
      headline: title,
      summary: cleanDesc.slice(0, 280),
      source: sourceName,
      provider: provider.id,
      providerLabel: provider.name,
      publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      url: link.trim(),
      sentiment: detectSentiment(text),
      category: detectCategory(text),
      relatedAssets: detectRelatedAssets(text),
      isBreaking: false,
    }
  })
}

function parseJsonNewsFeed(data: unknown, provider: CustomProviderDef, limit: number): LiveNewsArticle[] {
  let arr: unknown = data
  if (provider.jsonArrayPath) {
    for (const key of provider.jsonArrayPath.split('.')) {
      arr = (arr as Record<string, unknown>)?.[key]
    }
  }
  if (!Array.isArray(arr)) return []

  const fm = provider.jsonFieldMap ?? {}

  function deepGet(obj: Record<string, unknown>, path: string): string {
    const val = path.split('.').reduce<unknown>((cur, k) => (cur as Record<string, unknown>)?.[k], obj)
    return val != null ? String(val) : ''
  }

  return (arr as Record<string, unknown>[]).slice(0, limit).map((item, i): LiveNewsArticle => {
    const get = (field: string, fallback = '') => {
      const mappedPath = fm[field] ?? field
      return deepGet(item, mappedPath) || fallback
    }

    let articleUrl = get('url') || get('link') || '#'
    const congressMatch = articleUrl.match(/\/v3\/bill\/(\d+)\/([a-z]+)\/(\d+)/i)
    if (congressMatch) {
      const [, congress, typeRaw, number] = congressMatch
      const chamberMap: Record<string, string> = {
        hr: 'house-bill', s: 'senate-bill', hjres: 'house-joint-resolution',
        sjres: 'senate-joint-resolution', hres: 'house-resolution', sres: 'senate-resolution',
        hconres: 'house-concurrent-resolution', sconres: 'senate-concurrent-resolution',
      }
      const billType = chamberMap[typeRaw.toLowerCase()] ?? typeRaw.toLowerCase()
      articleUrl = `https://www.congress.gov/bill/${congress}th-congress/${billType}/${number}`
    }

    const headline = get('headline') || get('title')
    const summary  = (get('summary') || get('description')).slice(0, 280)
    const text = headline + ' ' + summary

    return {
      id: `${provider.id}-${i}-${Date.now()}`,
      headline,
      summary,
      source: get('source', provider.name),
      provider: provider.id,
      providerLabel: provider.name,
      publishedAt: (() => {
        const raw = get('publishedAt') || get('published_at') || get('date')
        try { return raw ? new Date(raw).toISOString() : new Date().toISOString() } catch { return new Date().toISOString() }
      })(),
      url: articleUrl,
      sentiment: detectSentiment(text),
      category: detectCategory(text),
      relatedAssets: detectRelatedAssets(text),
      isBreaking: false,
    }
  })
}

function stripCdata(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1').trim()
}

// ─── CryptoPanic ──────────────────────────────────────────────────────────────

const CP_CATEGORY_MAP: Record<string, LiveNewsArticle['category']> = {
  news: 'general', media: 'general', analysis: 'market',
  'price-watch': 'market', regulation: 'regulation', security: 'security',
}

const ASSET_SYMBOL_MAP: Record<string, string> = {
  BTC: 'btc', ETH: 'eth', USDT: 'usdt', USDC: 'usdc', DAI: 'dai',
  BNB: 'bnb', SOL: 'sol', FRAX: 'frax', TUSD: 'tusd', PYUSD: 'pyusd',
  BUSD: 'busd', LUSD: 'lusd', GUSD: 'gusd', USDP: 'usdp',
}

async function fetchCryptoPanic(apiKey: string | undefined, assetFilter: string, limit: number): Promise<LiveNewsArticle[]> {
  if (!apiKey) return []
  const currencyParam = assetFilter !== 'all' ? `&currencies=${assetFilter.toUpperCase()}` : ''
  const url = `https://cryptopanic.com/api/v1/posts/?auth_token=${apiKey}&public=true&limit=${Math.min(limit, 20)}${currencyParam}`
  const res = await fetch(url, { headers: { Accept: 'application/json' }, next: { revalidate: 120 } })
  if (!res.ok) throw new Error(`CryptoPanic HTTP ${res.status}`)
  const data = await res.json()

  return (data.results ?? []).map((item: Record<string, unknown>, i: number): LiveNewsArticle => {
    const currencies = (item.currencies as Array<{ code: string }> | null) ?? []
    const relatedAssets = currencies.map((c) => ASSET_SYMBOL_MAP[c.code] ?? c.code.toLowerCase()).filter(Boolean)
    const votes = (item.votes as Record<string, number> | null) ?? {}
    const positive = (votes.positive ?? 0) + (votes.liked ?? 0)
    const negative = (votes.negative ?? 0) + (votes.disliked ?? 0)
    const sentiment: LiveNewsArticle['sentiment'] =
      positive > negative * 1.5 ? 'positive' : negative > positive * 1.5 ? 'negative' : 'neutral'

    const title = (item.title as string) ?? ''
    // Augment CryptoPanic's asset tagging with our detector in case currencies array is sparse
    const detected = detectRelatedAssets(title)
    const merged = [...new Set([...relatedAssets, ...detected])]

    return {
      id: `cp-${(item.slug as string) ?? i}`,
      headline: title,
      summary: title,
      source: (item.source as { title?: string } | null)?.title ?? 'CryptoPanic',
      provider: 'cryptopanic',
      providerLabel: 'CryptoPanic',
      publishedAt: (item.published_at as string) ?? new Date().toISOString(),
      url: (item.url as string) ?? '#',
      sentiment,
      category: detectCategory(title),
      relatedAssets: merged,
      isBreaking: !!(item.is_hot),
    }
  })
}

// ─── Messari ──────────────────────────────────────────────────────────────────

async function fetchMessari(apiKey: string, assetFilter: string, limit: number): Promise<LiveNewsArticle[]> {
  const assetPath = assetFilter !== 'all' ? `/assets/${assetFilter}` : ''
  const url = `https://data.messari.io/api/v1${assetPath}/news?limit=${Math.min(limit, 25)}`
  const res = await fetch(url, { headers: { 'x-messari-api-key': apiKey, Accept: 'application/json' }, next: { revalidate: 120 } })
  if (!res.ok) throw new Error(`Messari HTTP ${res.status}`)
  const data = await res.json()

  return ((data.data as Array<Record<string, unknown>>) ?? []).map((item, i): LiveNewsArticle => {
    const headline = (item.title as string) ?? ''
    const summary  = ((item.content as string) ?? '').slice(0, 280)
    const text = headline + ' ' + summary
    return {
      id: `ms-${(item.id as string) ?? i}`,
      headline,
      summary,
      source: (item.author as { name?: string } | null)?.name ?? 'Messari',
      provider: 'messari',
      providerLabel: 'Messari',
      publishedAt: (item.published_at as string) ?? new Date().toISOString(),
      url: (item.url as string) ?? '#',
      sentiment: detectSentiment(text),
      category: detectCategory(text),
      relatedAssets: assetFilter !== 'all' ? [assetFilter, ...detectRelatedAssets(text)] : detectRelatedAssets(text),
      isBreaking: false,
    }
  })
}

// ─── NewsAPI ──────────────────────────────────────────────────────────────────

async function fetchNewsAPI(apiKey: string, assetFilter: string, limit: number, search = ''): Promise<LiveNewsArticle[]> {
  // When the user supplies keywords, search on those (scoped to the asset if one
  // is selected). Otherwise fall back to a broad crypto query.
  const base = assetFilter !== 'all' ? `${assetFilter} cryptocurrency stablecoin` : 'stablecoin cryptocurrency defi'
  const query = search
    ? (assetFilter !== 'all' ? `${assetFilter} ${search}` : search)
    : base
  const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&sortBy=publishedAt&pageSize=${Math.min(limit, 20)}&apiKey=${apiKey}`
  const res = await fetch(url, { headers: { Accept: 'application/json' }, next: { revalidate: 120 } })
  if (!res.ok) throw new Error(`NewsAPI HTTP ${res.status}`)
  const data = await res.json()

  return ((data.articles as Array<Record<string, unknown>>) ?? []).map((item, i): LiveNewsArticle => {
    const headline = (item.title as string) ?? ''
    const summary  = (item.description as string) ?? ''
    const text = headline + ' ' + summary
    return {
      id: `na-${i}-${Date.now()}`,
      headline,
      summary,
      source: (item.source as { name?: string } | null)?.name ?? 'NewsAPI',
      provider: 'newsapi',
      providerLabel: 'NewsAPI',
      publishedAt: (item.publishedAt as string) ?? new Date().toISOString(),
      url: (item.url as string) ?? '#',
      sentiment: detectSentiment(text),
      category: detectCategory(text),
      relatedAssets: detectRelatedAssets(text),
      isBreaking: false,
    }
  })
}

// ─── GNews ────────────────────────────────────────────────────────────────────

const GNEWS_ASSET_QUERY: Record<string, string> = {
  btc: 'bitcoin BTC cryptocurrency',
  eth: 'ethereum ETH cryptocurrency',
  sol: 'solana SOL cryptocurrency',
  bnb: 'BNB binance coin',
  avax: 'avalanche AVAX crypto',
  ada: 'cardano ADA cryptocurrency',
  xrp: 'XRP ripple cryptocurrency',
  dot: 'polkadot DOT cryptocurrency',
  pol: 'polygon POL MATIC cryptocurrency',
  trx: 'tron TRX cryptocurrency',
  usdt: 'tether USDT stablecoin',
  usdc: 'USDC circle stablecoin',
  dai: 'DAI MakerDAO stablecoin',
  frax: 'FRAX frax finance stablecoin',
  doge: 'dogecoin DOGE cryptocurrency',
  uni: 'uniswap UNI DeFi',
  aave: 'aave AAVE DeFi',
  link: 'chainlink LINK oracle',
}

async function fetchGNews(apiKey: string, assetFilter: string, limit: number, search = ''): Promise<LiveNewsArticle[]> {
  // GNews ANDs bare keywords — the old 5-word default matched almost nothing.
  // Use OR so the broad sweep actually returns current articles.
  const base = assetFilter !== 'all'
    ? (GNEWS_ASSET_QUERY[assetFilter] ?? `${assetFilter} cryptocurrency`)
    : 'cryptocurrency OR bitcoin OR ethereum OR stablecoin'
  // Keyword search takes priority, scoped to the asset when one is selected.
  const q = search
    ? (assetFilter !== 'all' ? `${assetFilter} ${search}` : search)
    : base

  const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(q)}&lang=en&max=${Math.min(limit, 10)}&sortby=publishedAt&apikey=${apiKey}`
  const res = await fetch(url, { headers: { Accept: 'application/json' }, next: { revalidate: 120 } })
  if (!res.ok) throw new Error(`GNews HTTP ${res.status}`)
  const data = await res.json()

  return ((data.articles as Array<Record<string, unknown>>) ?? []).map((item, i): LiveNewsArticle => {
    const headline = (item.title as string) ?? ''
    const summary  = (item.description as string) ?? ''
    const text = headline + ' ' + summary
    return {
      id: `gn-${i}-${Date.now()}`,
      headline,
      summary,
      source: (item.source as { name?: string } | null)?.name ?? 'GNews',
      provider: 'gnews',
      providerLabel: 'GNews',
      publishedAt: (item.publishedAt as string) ?? new Date().toISOString(),
      url: (item.url as string) ?? '#',
      sentiment: detectSentiment(text),
      category: detectCategory(text),
      relatedAssets: detectRelatedAssets(text),
      isBreaking: false,
    }
  })
}
