import { NextRequest, NextResponse } from 'next/server'
import { getVideoProviders, recordProviderFetch, type AnyActiveProvider, type ProviderMarket } from '@/lib/api/live/providers'
import { validatePublicHttpUrl } from '@/lib/server/urlSafety'
import { decodeEntities, stripTags } from '@/lib/utils/html'

// Server-side proxy for the Videos feed.
//   GET /live-data/videos                  → every enabled channel, both markets
//   GET /live-data/videos?market=crypto    → one market only
//   GET /live-data/videos?limit=60
//
// REGISTRY-DRIVEN, same shape as market-news: built-in channels are toggled on
// the Integrations page and user-added custom feeds (format 'youtube', with a
// channel id or full feed URL) run alongside them. All active sources fetch in
// parallel via Promise.allSettled — any subset may fail without failing the
// route.
//
// YouTube publishes per-channel Atom at /feeds/videos.xml?channel_id=…, keyless
// and without quota, which is why this needs no API key. Channel ids live here
// rather than in providers.ts so the generic provider type stays free of
// YouTube-specific fields — mirroring how market-news holds its feed URLs.

export const dynamic = 'force-dynamic'

/**
 * Cap on the searchable description text.
 *
 * Measured across the built-in channels: median ~670 chars, p90 ~1,300, max
 * ~3,900. 1,500 covers well past the 90th percentile while bounding the payload
 * at roughly 225KB for a 150-video feed.
 */
const SEARCH_TEXT_LIMIT = 1500

/** Provider id → YouTube channel id. Every id here was verified to resolve. */
const BUILTIN_CHANNELS: Record<string, string> = {
  'yt-bloomberg':      'UCIALMKvObZNtJ6AmdCLP7Lg',
  'yt-cnbc':           'UCrp_UI8XtuYfpiqluWLD7Lw',
  'yt-yahoo-finance':  'UCEAZeUIeJs0IjQiqTCdVSIg',
  'yt-ft':             'UCoUxsWakJucWg46KW5RsvPw',
  'yt-wsj':            'UCK7tptUDHh-RYDsdxO1-5QQ',
  'yt-coin-bureau':    'UCqK_GSMbpiV8spgD3ZGloSw',
  'yt-bankless':       'UCAl9Ld79qaZxp9JzEOwd3aA',
  'yt-benjamin-cowen': 'UCRvqjQPSeaWn-uEx-w0XOIg',
  'yt-altcoin-daily':  'UCbLhGKVY-bJPcawebgtNfbw',
}

export interface VideoItem {
  id: string
  title: string
  /** Short form for display on the card — two lines is all it renders. */
  summary: string
  /**
   * Fuller description, for search only.
   *
   * Descriptions run ~670 chars at the median and over 3,900 at the extreme,
   * so matching against the 240-char display summary silently loses most of the
   * text: "federal" appears in real descriptions that the truncated form drops
   * entirely. Capped so a long-winded channel can't bloat the payload.
   */
  searchText: string
  url: string
  thumbnail: string | null
  channel: string
  /** Provider id that served this item, for attribution + utilization. */
  provider: string
  publishedAt: string
  market: ProviderMarket
  /** Published within the last 24h. */
  isNew: boolean
}

export interface VideosResponse {
  ok: boolean
  updatedAt: string
  videos: VideoItem[]
  /** Channels that answered, for the page's source filter. */
  channels: Array<{ provider: string; channel: string; market: ProviderMarket; count: number }>
}

function feedUrl(provider: AnyActiveProvider): string | null {
  if (provider.isCustom) {
    // Custom entries accept either a bare channel id or a full feed URL.
    const raw = provider.url?.trim()
    if (!raw) return null
    if (/^UC[\w-]{20,}$/.test(raw)) {
      return `https://www.youtube.com/feeds/videos.xml?channel_id=${raw}`
    }
    // validatePublicHttpUrl returns an ERROR MESSAGE for a bad URL and null for
    // a good one — not the validated URL. Treat null as "safe to fetch".
    return validatePublicHttpUrl(raw) === null ? raw : null
  }
  const channelId = BUILTIN_CHANNELS[provider.id]
  return channelId ? `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}` : null
}

/** Pull one tag's text out of an Atom entry. */
function tag(entry: string, name: string): string {
  const m = entry.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'))
  return m ? decodeEntities(m[1].trim()) : ''
}

function parseChannelFeed(xml: string, provider: AnyActiveProvider, market: ProviderMarket): VideoItem[] {
  const channel = decodeEntities((xml.match(/<title>([^<]+)<\/title>/) || [])[1] ?? provider.name)
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? []
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000

  return entries.map((entry): VideoItem | null => {
    const videoId = tag(entry, 'yt:videoId')
    const title = tag(entry, 'title')
    if (!videoId || !title) return null

    const published = tag(entry, 'published') || new Date().toISOString()
    const thumbnail = (entry.match(/<media:thumbnail[^>]*url="([^"]+)"/i) || [])[1] ?? null
    // Descriptions are dominated by sponsor/affiliate links — strip markup and
    // drop URL tokens, then keep the prose. Two forms: a short one for the
    // card, and a fuller one for search (see searchText on VideoItem).
    const description = stripTags(tag(entry, 'media:description'))
      .split(/\s+/)
      .filter((w) => !/^https?:\/\//i.test(w))
      .join(' ')
      .trim()

    return {
      id: `${provider.id}:${videoId}`,
      title,
      summary: description.slice(0, 240),
      searchText: description.slice(0, SEARCH_TEXT_LIMIT),
      url: `https://www.youtube.com/watch?v=${videoId}`,
      thumbnail,
      channel: decodeEntities(tag(entry, 'name') || channel),
      provider: provider.id,
      publishedAt: new Date(published).toISOString(),
      market,
      isNew: new Date(published).getTime() >= dayAgo,
    }
  }).filter((v): v is VideoItem => v !== null)
}

async function fetchProvider(provider: AnyActiveProvider, market: ProviderMarket): Promise<VideoItem[]> {
  const url = feedUrl(provider)
  if (!url) {
    recordProviderFetch(provider.id, { error: 'No channel id configured' })
    return []
  }
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CAEP/1.0)', Accept: 'application/atom+xml, application/xml' },
      next: { revalidate: 600 }, // channels post a few times a day at most
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const items = parseChannelFeed(await res.text(), provider, market)
    recordProviderFetch(provider.id, { count: items.length })
    return items
  } catch (e) {
    recordProviderFetch(provider.id, { error: e instanceof Error ? e.message : 'fetch failed' })
    return []
  }
}

export async function GET(request: NextRequest) {
  const marketParam = request.nextUrl.searchParams.get('market')
  // Cap is headroom for added channels (each contributes ~15), not a target —
  // the page asks for 240. Kept finite so a runaway channel list can't return
  // an unbounded payload.
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') ?? '60', 10) || 60, 400)

  const markets: ProviderMarket[] =
    marketParam === 'crypto' || marketParam === 'equities' ? [marketParam] : ['crypto', 'equities']

  // Flatten to (provider, market) pairs so every channel fetches in parallel
  // rather than market-by-market.
  const jobs = markets.flatMap((market) =>
    getVideoProviders(market)
      // youtube-search shares the 'video' category but is an on-demand keyword
      // search, not a standing channel feed — it has no channel id and is
      // served by /live-data/video-search.
      .filter((provider) => provider.id !== 'youtube-search')
      .map((provider) => ({ provider, market }))
  )

  const settled = await Promise.allSettled(jobs.map(({ provider, market }) => fetchProvider(provider, market)))

  const videos: VideoItem[] = []
  const channels = new Map<string, { provider: string; channel: string; market: ProviderMarket; count: number }>()

  settled.forEach((result, i) => {
    if (result.status !== 'fulfilled' || result.value.length === 0) return
    const { provider, market } = jobs[i]
    videos.push(...result.value)
    channels.set(provider.id, {
      provider: provider.id,
      channel: result.value[0].channel,
      market,
      count: result.value.length,
    })
  })

  videos.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())

  return NextResponse.json({
    ok: true,
    updatedAt: new Date().toISOString(),
    videos: videos.slice(0, limit),
    channels: [...channels.values()].sort((a, b) => a.channel.localeCompare(b.channel)),
  } satisfies VideosResponse)
}
