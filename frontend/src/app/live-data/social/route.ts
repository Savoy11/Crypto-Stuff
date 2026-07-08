import { NextRequest, NextResponse } from 'next/server'
import { ASSET_LIST } from '@/lib/data/assetList'
import { getSocialProviders, type AnyActiveProvider } from '@/lib/api/live/providers'

export const dynamic = 'force-dynamic'

export interface SocialSignal {
  id: string
  asset: string
  platform: 'reddit' | 'twitter' | 'telegram' | 'other'
  title: string
  body?: string
  url: string
  author?: string
  score: number
  sentiment: 'positive' | 'neutral' | 'negative'
  publishedAt: string
  provider: string
  providerLabel: string
  subreddit?: string
  upvoteRatio?: number
}

export interface AssetSentiment {
  asset: string
  label: string
  positive: number
  neutral: number
  negative: number
  total: number
  sentimentScore: number
}

const ASSET_LABELS: Record<string, string> = {
  all: 'All Assets', btc: 'Bitcoin', eth: 'Ethereum', usdt: 'Tether',
  usdc: 'USD Coin', dai: 'DAI', bnb: 'BNB', sol: 'Solana',
  frax: 'Frax', tusd: 'TrueUSD', pyusd: 'PayPal USD',
}

const ASSET_SEARCH_TERMS: Record<string, string> = {
  all: 'stablecoin cryptocurrency defi',
  btc: 'bitcoin BTC',
  eth: 'ethereum ETH',
  usdt: 'tether USDT',
  usdc: 'USDC circle stablecoin',
  dai: 'DAI MakerDAO',
  bnb: 'BNB binance',
  sol: 'solana SOL',
  frax: 'frax FRAX',
  tusd: 'TrueUSD TUSD',
  pyusd: 'PayPal USD PYUSD',
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const assetFilter = searchParams.get('asset') ?? 'all'
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '40'), 100)
  // Comma-separated list of extra subreddit names passed from the client
  const extraSubs = (searchParams.get('subreddits') ?? '')
    .split(',')
    .map((s) => s.trim().replace(/^r\//i, ''))
    .filter(Boolean)

  const providers = getSocialProviders()
  if (providers.length === 0) {
    return NextResponse.json({ ok: false, signals: [], summaries: [], providers: [] })
  }

  const results = await Promise.allSettled(
    providers.map((p) => fetchFromProvider(p, assetFilter, limit, extraSubs))
  )

  const allSignals: SocialSignal[] = []
  const seenIds = new Set<string>()

  for (const result of results) {
    if (result.status === 'fulfilled') {
      for (const signal of result.value) {
        if (!seenIds.has(signal.id)) {
          seenIds.add(signal.id)
          allSignals.push(signal)
        }
      }
    }
  }

  allSignals.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())

  // Compute per-asset sentiment summaries from collected signals
  const summaryMap = new Map<string, AssetSentiment>()
  for (const s of allSignals) {
    const key = s.asset === 'all' ? 'all' : s.asset
    if (!summaryMap.has(key)) {
      summaryMap.set(key, {
        asset: key,
        label: ASSET_LABELS[key] ?? key.toUpperCase(),
        positive: 0, neutral: 0, negative: 0, total: 0, sentimentScore: 0,
      })
    }
    const entry = summaryMap.get(key)!
    entry.total++
    if (s.sentiment === 'positive') entry.positive++
    else if (s.sentiment === 'negative') entry.negative++
    else entry.neutral++
  }
  for (const entry of summaryMap.values()) {
    entry.sentimentScore = entry.total > 0
      ? (entry.positive - entry.negative) / entry.total
      : 0
  }

  return NextResponse.json({
    ok: true,
    signals: allSignals.slice(0, limit),
    summaries: [...summaryMap.values()],
    providers: providers.map((p) => ({ id: p.id, name: p.name })),
  })
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

async function fetchFromProvider(provider: AnyActiveProvider, asset: string, limit: number, extraSubs: string[] = []): Promise<SocialSignal[]> {
  const key = provider.config.apiKey
  switch (provider.id) {
    case 'reddit':    return fetchReddit(asset, limit, extraSubs)
    case 'lunarcrush': return key ? fetchLunarCrush(key, asset, limit) : []
    case 'santiment':  return key ? fetchSantiment(key, asset, limit) : []
    default:          return []
  }
}

// ─── Reddit ───────────────────────────────────────────────────────────────────

// Reddit blocks server-side JSON API calls (403). Use public RSS feeds instead.
// Feeds are grouped: broad crypto sweep first, then asset-specific subreddits.

// General crypto subreddits included in every "all" sweep
const GENERAL_CRYPTO_FEEDS = [
  'https://www.reddit.com/r/CryptoCurrency/hot.rss',
  'https://www.reddit.com/r/CryptoMarkets/hot.rss',
  'https://www.reddit.com/r/SatoshiStreetBets/hot.rss',
  'https://www.reddit.com/r/CryptoCurrencies/hot.rss',
  'https://www.reddit.com/r/altcoin/hot.rss',
  'https://www.reddit.com/r/CryptoMoonShots/hot.rss',
  'https://www.reddit.com/r/Crypto_General/hot.rss',
  'https://www.reddit.com/r/CryptoTechnology/hot.rss',
  'https://www.reddit.com/r/defi/hot.rss',
  'https://www.reddit.com/r/stablecoins/hot.rss',
  'https://www.reddit.com/r/NFT/hot.rss',
  'https://www.reddit.com/r/web3/hot.rss',
  'https://www.reddit.com/r/BlockChain/hot.rss',
]

const REDDIT_FEEDS: Record<string, string[]> = {
  all: GENERAL_CRYPTO_FEEDS,

  btc: [
    'https://www.reddit.com/r/Bitcoin/hot.rss',
    'https://www.reddit.com/r/BitcoinMarkets/hot.rss',
    'https://www.reddit.com/r/BitcoinBeginners/hot.rss',
    'https://www.reddit.com/r/btc/hot.rss',
    'https://www.reddit.com/r/CryptoCurrency/search.rss?q=bitcoin&sort=hot&restrict_sr=1',
    ...GENERAL_CRYPTO_FEEDS.slice(0, 3),
  ],

  eth: [
    'https://www.reddit.com/r/ethereum/hot.rss',
    'https://www.reddit.com/r/ethfinance/hot.rss',
    'https://www.reddit.com/r/ethtrader/hot.rss',
    'https://www.reddit.com/r/ethdev/hot.rss',
    'https://www.reddit.com/r/CryptoCurrency/search.rss?q=ethereum&sort=hot&restrict_sr=1',
    ...GENERAL_CRYPTO_FEEDS.slice(0, 2),
  ],

  usdt: [
    'https://www.reddit.com/r/Tether/hot.rss',
    'https://www.reddit.com/r/stablecoins/hot.rss',
    'https://www.reddit.com/r/CryptoCurrency/search.rss?q=tether+USDT&sort=hot&restrict_sr=1',
  ],

  usdc: [
    'https://www.reddit.com/r/stablecoins/hot.rss',
    'https://www.reddit.com/r/CryptoCurrency/search.rss?q=USDC+circle&sort=hot&restrict_sr=1',
  ],

  dai: [
    'https://www.reddit.com/r/MakerDAO/hot.rss',
    'https://www.reddit.com/r/stablecoins/hot.rss',
    'https://www.reddit.com/r/defi/hot.rss',
  ],

  bnb: [
    'https://www.reddit.com/r/BNBchainOfficial/hot.rss',
    'https://www.reddit.com/r/binance/hot.rss',
    'https://www.reddit.com/r/CryptoCurrency/search.rss?q=BNB+binance&sort=hot&restrict_sr=1',
  ],

  sol: [
    'https://www.reddit.com/r/solana/hot.rss',
    'https://www.reddit.com/r/CryptoCurrency/search.rss?q=solana+SOL&sort=hot&restrict_sr=1',
    'https://www.reddit.com/r/defi/search.rss?q=solana&sort=hot&restrict_sr=1',
  ],

  frax: [
    'https://www.reddit.com/r/stablecoins/hot.rss',
    'https://www.reddit.com/r/defi/hot.rss',
    'https://www.reddit.com/r/CryptoCurrency/search.rss?q=FRAX+frax+finance&sort=hot&restrict_sr=1',
  ],

  tusd: [
    'https://www.reddit.com/r/stablecoins/hot.rss',
    'https://www.reddit.com/r/CryptoCurrency/search.rss?q=TrueUSD+TUSD&sort=hot&restrict_sr=1',
  ],

  pyusd: [
    'https://www.reddit.com/r/stablecoins/hot.rss',
    'https://www.reddit.com/r/CryptoCurrency/search.rss?q=PayPal+PYUSD&sort=hot&restrict_sr=1',
  ],
}

// Assets without a curated feed get targeted subreddit searches by name and
// symbol — attributing generic front-page posts to them mislabeled the feed.
function searchFeedsFor(assetId: string): string[] | null {
  const entry = ASSET_LIST.find((a) => a.id === assetId)
  if (!entry) return null
  const q = encodeURIComponent(`"${entry.name}" OR ${entry.symbol}`)
  return [
    `https://www.reddit.com/r/CryptoCurrency/search.rss?q=${q}&sort=new&restrict_sr=1`,
    `https://www.reddit.com/r/CryptoMarkets/search.rss?q=${q}&sort=new&restrict_sr=1`,
  ]
}

async function fetchReddit(assetFilter: string, limit: number, extraSubs: string[] = []): Promise<SocialSignal[]> {
  const baseFeedUrls = REDDIT_FEEDS[assetFilter]
    ?? (assetFilter !== 'all' ? searchFeedsFor(assetFilter) : null)
    ?? REDDIT_FEEDS.all
  const extraFeedUrls = extraSubs.map((s) => `https://www.reddit.com/r/${s}/hot.rss`)
  const feeds = [...new Set([...baseFeedUrls, ...extraFeedUrls])]
  const perFeed = Math.ceil(limit / feeds.length)

  const results = await Promise.allSettled(feeds.map((feedUrl) => fetchRedditRss(feedUrl, assetFilter, perFeed)))
  const signals: SocialSignal[] = []
  for (const r of results) {
    if (r.status === 'fulfilled') signals.push(...r.value)
  }
  return signals
}

async function fetchRedditRss(feedUrl: string, assetFilter: string, limit: number): Promise<SocialSignal[]> {
  const res = await fetch(feedUrl, {
    headers: { 'User-Agent': 'CAEP/1.0', Accept: 'application/rss+xml, application/xml, text/xml' },
    next: { revalidate: 300 },
  })
  if (!res.ok) throw new Error(`Reddit RSS HTTP ${res.status} for ${feedUrl}`)
  const xml = await res.text()

  // Parse Atom feed (Reddit uses Atom, not RSS)
  const entries = [...xml.matchAll(/<entry[^>]*>([\s\S]*?)<\/entry>/gi)].slice(0, limit)
  const subredditMatch = feedUrl.match(/\/r\/([^/]+)\//)
  const subreddit = subredditMatch?.[1] ?? 'reddit'

  return entries.map((m, i): SocialSignal => {
    const inner = m[1]
    const title = stripCdata(inner.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').replace(/\[.*?\]\s*/g, '')
    const link = inner.match(/<link[^>]*href="([^"]+)"/i)?.[1] ?? '#'
    const updated = inner.match(/<updated[^>]*>([\s\S]*?)<\/updated>/i)?.[1] ?? ''
    const content = stripCdata(inner.match(/<content[^>]*>([\s\S]*?)<\/content>/i)?.[1] ?? '')
    const author = inner.match(/<name>([\s\S]*?)<\/name>/i)?.[1] ?? undefined

    const text = (title + ' ' + content).toLowerCase()
    const sentiment: SocialSignal['sentiment'] =
      /\b(bullish|surge\w*|soar\w*|ath|gains?|grow(?:th|ing)?|pump\w*|rall(?:y|ies)|breakout|good|great|positive|up \d)\b/.test(text) ? 'positive' :
      /\b(bearish|crash\w*|dump\w*|hack(?:ed|s)?|exploit\w*|scam\w*|fraud\w*|rugpull|down \d|collapse\w*|risky?|fear|lose|loss(?:es)?)\b/.test(text) ? 'negative' :
      'neutral'

    return {
      id: `reddit-${subreddit}-${i}-${Date.now()}`,
      asset: assetFilter,
      platform: 'reddit',
      title: title || '(no title)',
      body: decodeHtmlEntities(content).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 300) || undefined,
      url: link,
      author,
      score: 0,
      sentiment,
      publishedAt: updated ? new Date(updated).toISOString() : new Date().toISOString(),
      provider: 'reddit',
      providerLabel: 'Reddit',
      subreddit,
    }
  })
}

function stripCdata(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1').trim()
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
}

// ─── LunarCrush ───────────────────────────────────────────────────────────────

async function fetchLunarCrush(apiKey: string, assetFilter: string, limit: number): Promise<SocialSignal[]> {
  const symbol = assetFilter === 'all' ? 'BTC' : assetFilter.toUpperCase()
  const url = `https://lunarcrush.com/api4/public/coins/${symbol}/v1`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    next: { revalidate: 300 },
  })
  if (!res.ok) throw new Error(`LunarCrush HTTP ${res.status}`)
  const data = await res.json()
  const coin = data?.data

  if (!coin) return []

  // LunarCrush v4 returns aggregate metrics — synthesise a summary signal
  const galaxyScore: number = coin.galaxy_score ?? 50
  const sentiment: SocialSignal['sentiment'] =
    galaxyScore >= 60 ? 'positive' : galaxyScore <= 35 ? 'negative' : 'neutral'

  return [{
    id: `lunarcrush-${symbol}-${Date.now()}`,
    asset: assetFilter,
    platform: 'other',
    title: `${coin.name ?? symbol} — Galaxy Score ${galaxyScore}/100`,
    body: `Social volume: ${(coin.social_volume_24h ?? 0).toLocaleString()} mentions · Sentiment: ${(coin.sentiment ?? 0).toFixed(2)}`,
    url: `https://lunarcrush.com/coins/${symbol.toLowerCase()}`,
    score: coin.social_volume_24h ?? 0,
    sentiment,
    publishedAt: new Date().toISOString(),
    provider: 'lunarcrush',
    providerLabel: 'LunarCrush',
  }]
}

// ─── Santiment ────────────────────────────────────────────────────────────────

async function fetchSantiment(apiKey: string, assetFilter: string, _limit: number): Promise<SocialSignal[]> {
  const SANTIMENT_SLUGS: Record<string, string> = {
    all: 'bitcoin', btc: 'bitcoin', eth: 'ethereum', sol: 'solana',
    bnb: 'binance-coin', usdt: 'tether', usdc: 'usd-coin', dai: 'multi-collateral-dai',
  }
  const slug = SANTIMENT_SLUGS[assetFilter] ?? assetFilter

  const query = `{
    socialVolume(slug: "${slug}", from: "utc_now-1d", to: "utc_now", interval: "1d", socialVolumeType: TOTAL_SEARCH_RESULTS) {
      datetime mentionsCount
    }
  }`

  const res = await fetch('https://api.santiment.net/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Apikey ${apiKey}`,
    },
    body: JSON.stringify({ query }),
    next: { revalidate: 300 },
  })
  if (!res.ok) throw new Error(`Santiment HTTP ${res.status}`)
  const data = await res.json()
  const points: { datetime: string; mentionsCount: number }[] = data?.data?.socialVolume ?? []

  return points.map((pt, i): SocialSignal => ({
    id: `santiment-${slug}-${i}`,
    asset: assetFilter,
    platform: 'other',
    title: `${slug} social volume: ${pt.mentionsCount.toLocaleString()} mentions`,
    url: `https://app.santiment.net/charts?slug=${slug}`,
    score: pt.mentionsCount,
    sentiment: 'neutral',
    publishedAt: pt.datetime,
    provider: 'santiment',
    providerLabel: 'Santiment',
  }))
}
