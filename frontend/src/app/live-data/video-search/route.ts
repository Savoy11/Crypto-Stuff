import { NextRequest, NextResponse } from 'next/server'
import { getProviderKey, recordProviderFetch } from '@/lib/api/live/providers'
import { guardQuotaRoute } from '@/lib/server/apiGuard'
import { decodeEntities } from '@/lib/utils/html'
import type { VideoItem } from '../videos/route'

// Whole-of-YouTube keyword search, backing the Videos page's "Search YouTube"
// action.
//   GET /live-data/video-search?q=rate+cuts
//   GET /live-data/video-search?q=bitcoin&order=date&limit=25
//
// Deliberately separate from /live-data/videos: that route merges standing
// channel feeds and is keyless and cheap, whereas this one is keyed and
// expensive. YouTube Data API v3 charges 100 quota units per search against a
// 10,000/day free allowance — roughly 100 searches a day — so this only runs on
// an explicit user action, never per keystroke, and results are cached for an
// hour.
//
// Keyless search is not an option: the old search RSS endpoint returns HTTP 400
// and there is no other public search surface.

export const dynamic = 'force-dynamic'

export interface VideoSearchResponse {
  ok: boolean
  /** False when no API key is configured — the UI shows a setup notice. */
  configured: boolean
  query: string
  /** What was actually sent to YouTube — differs from `query` under finance scope. */
  effectiveQuery: string
  scope: SearchScope
  videos: VideoItem[]
  updatedAt: string
  error?: string
}

export type SearchScope = 'finance' | 'all'
export type SearchOrder = 'relevance' | 'date' | 'viewCount' | 'rating'
/**
 * YouTube's videoDuration takes ONE value — short (<4m), medium (4–20m) or
 * long (>20m) — so "anything but Shorts" isn't expressible in a single call.
 * Exposed as a user choice rather than hardcoded, since long-form (Coin Bureau,
 * Unchained) and clips (CNBC, Bloomberg) are both legitimate here.
 */
export type SearchDuration = 'any' | 'short' | 'medium' | 'long'

/**
 * Recency windows, mapped to publishedAfter on the API call itself.
 * Not exported — Next.js route modules may only export handlers and config.
 */
const SEARCH_WINDOWS: Record<string, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
}

/**
 * YouTube has no finance vertical, so an unscoped search for an ambiguous term
 * returns whatever is popular — "washington" surfaced Major League Cricket
 * highlights and local wildfire coverage.
 *
 * Measured across four strategies: category-25 alone still returned local news;
 * context terms alone pulled in low-credibility finance-adjacent channels; the
 * two together returned CNBC, AP and Associated Press. Hence both, as the
 * default, with 'all' available when the user genuinely wants raw YouTube.
 */
const FINANCE_CONTEXT = 'markets economy'
/** YouTube's "News & Politics" category — where most finance coverage lives. */
const NEWS_POLITICS_CATEGORY = '25'

interface YouTubeSearchItem {
  id?: { videoId?: string }
  snippet?: {
    title?: string
    description?: string
    channelTitle?: string
    publishedAt?: string
    thumbnails?: Record<string, { url?: string } | undefined>
  }
}

function empty(
  query: string, effectiveQuery: string, scope: SearchScope, configured: boolean, error?: string
): NextResponse {
  return NextResponse.json({
    ok: !error, configured, query, effectiveQuery, scope,
    videos: [], updatedAt: new Date().toISOString(), error,
  } satisfies VideoSearchResponse)
}

/**
 * Is this title predominantly Latin-script?
 *
 * relevanceLanguage/regionCode only *bias ranking*, they do not filter. When a
 * narrow window shrinks the candidate pool the bias stops mattering and results
 * come back in Arabic, Korean, Bengali and Spanish. Counting letters rather than
 * all characters keeps emoji, digits and punctuation from skewing the ratio.
 */
function looksLatinScript(title: string): boolean {
  const letters = title.match(/\p{L}/gu) ?? []
  if (letters.length < 4) return true // too short to judge — keep it
  const latin = letters.filter((c) => /\p{Script=Latin}/u.test(c)).length
  return latin / letters.length >= 0.5
}

/**
 * Collapse near-duplicate titles.
 *
 * Spam channels reupload the same video repeatedly — a 24h search for
 * "inflation" returned "🔥4th Stimulus Check of $2,000" four times. Normalising
 * away case, emoji and punctuation catches the variants.
 */
function dedupeKey(title: string): string {
  // Word SET, not word sequence: reuploads shuffle order ("🔥4th Stimulus
  // Check of $2,000 💰Expected Dates" vs "✅ $2,000🔥4th Stimulus Check💰
  // Expected Dates"), so an order-sensitive key misses them.
  const words = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter((w) => w.length > 2)
  return [...new Set(words)].sort().slice(0, 8).join('-')
}

const ORDERS: SearchOrder[] = ['relevance', 'date', 'viewCount', 'rating']
const DURATIONS: SearchDuration[] = ['any', 'short', 'medium', 'long']

export async function GET(request: NextRequest) {
  // 100 quota units per search against a 10,000/day allowance, so ~100 searches
  // exhaust the day for every user. The per-minute cap stops a runaway client;
  // the app-wide daily cap is what actually protects the budget, set below the
  // real ceiling so a manual check is still possible after it trips (audit L6).
  const denied = guardQuotaRoute(request, 'video-search', 10, { limitPerDay: 80 })
  if (denied) return denied

  const params = request.nextUrl.searchParams
  const query = params.get('q')?.trim() ?? ''
  const limit = Math.min(parseInt(params.get('limit') ?? '25', 10) || 25, 50)
  const scope: SearchScope = params.get('scope') === 'all' ? 'all' : 'finance'

  const orderParam = params.get('order') ?? ''
  const order: SearchOrder = (ORDERS as string[]).includes(orderParam) ? orderParam as SearchOrder : 'relevance'
  const durationParam = params.get('duration') ?? ''
  const duration: SearchDuration = (DURATIONS as string[]).includes(durationParam) ? durationParam as SearchDuration : 'any'
  const windowKey = params.get('window') ?? 'all'

  // Under finance scope the query is augmented; returned as effectiveQuery so
  // the UI can show what was actually searched rather than quietly differing.
  // Boolean operators the user types (-term for exclusion, a|b for OR) pass
  // straight through — YouTube parses them, and appending context after them
  // is safe.
  const effectiveQuery = scope === 'finance' && query ? `${query} ${FINANCE_CONTEXT}` : query

  const key = getProviderKey('youtube-search')
  if (!key) return empty(query, effectiveQuery, scope, false)
  if (!query) return empty(query, effectiveQuery, scope, true)

  const url = new URL('https://www.googleapis.com/youtube/v3/search')
  url.searchParams.set('part', 'snippet')
  url.searchParams.set('type', 'video')
  url.searchParams.set('q', effectiveQuery)
  url.searchParams.set('order', order)
  url.searchParams.set('maxResults', String(limit))
  // English/US relevance. These bias ranking rather than hard-filtering topic,
  // so they apply under both scopes.
  url.searchParams.set('relevanceLanguage', 'en')
  url.searchParams.set('regionCode', 'US')
  // Drops upcoming-premiere placeholders and in-progress streams, which carry
  // no watchable content yet.
  url.searchParams.set('eventType', 'completed')
  if (duration !== 'any') url.searchParams.set('videoDuration', duration)
  // Recency is applied at the API, not after: filtering 25 relevance-ranked
  // all-time results down to "past 24h" locally left almost nothing.
  const windowMs = SEARCH_WINDOWS[windowKey]
  if (windowMs) url.searchParams.set('publishedAfter', new Date(Date.now() - windowMs).toISOString())
  if (scope === 'finance') url.searchParams.set('videoCategoryId', NEWS_POLITICS_CATEGORY)
  url.searchParams.set('key', key)

  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 3600 }, // one search per query per hour — quota is scarce
    })

    if (!res.ok) {
      // 403 is nearly always quota exhaustion or a key restriction; surface it
      // plainly rather than as a generic failure, since the fix differs.
      const detail = res.status === 403
        ? 'YouTube API rejected the request — daily quota exhausted, or the key is restricted/not enabled for the Data API.'
        : `YouTube search failed (HTTP ${res.status}).`
      recordProviderFetch('youtube-search', { error: `HTTP ${res.status}` })
      return empty(query, effectiveQuery, scope, true, detail)
    }

    const data = await res.json() as { items?: YouTubeSearchItem[] }
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000

    const videos: VideoItem[] = (data.items ?? []).flatMap((item) => {
      const videoId = item.id?.videoId
      const snippet = item.snippet
      if (!videoId || !snippet?.title) return []

      const published = snippet.publishedAt ?? new Date().toISOString()
      const thumbs = snippet.thumbnails ?? {}
      const thumbnail = thumbs.high?.url ?? thumbs.medium?.url ?? thumbs.default?.url ?? null

      return [{
        // Namespaced so a search hit can't collide with the same video arriving
        // from a channel feed, and so the page can tell them apart.
        id: `search:${videoId}`,
        title: decodeEntities(snippet.title),
        // search.list truncates descriptions to ~160 chars, so both forms come
        // from the same short snippet here — unlike the RSS feeds, there is no
        // fuller text to preserve.
        summary: decodeEntities(snippet.description ?? '').slice(0, 240),
        searchText: decodeEntities(snippet.description ?? ''),
        url: `https://www.youtube.com/watch?v=${videoId}`,
        thumbnail,
        channel: decodeEntities(snippet.channelTitle ?? 'YouTube'),
        provider: 'youtube-search',
        publishedAt: new Date(published).toISOString(),
        // Search spans all of YouTube, so results carry no module affinity.
        // Tagged 'equities' so existing market typing holds; the page labels
        // them as search hits rather than by market.
        market: 'equities',
        isNew: new Date(published).getTime() >= dayAgo,
      }]
    })

    // Post-filter what the API's ranking hints can't: non-English titles and
    // reuploaded spam. Applied only under finance scope — 'all' means raw.
    const seen = new Set<string>()
    const cleaned = scope === 'all'
      ? videos
      : videos.filter((v) => {
          if (!looksLatinScript(v.title)) return false
          const key = dedupeKey(v.title)
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })

    recordProviderFetch('youtube-search', { count: cleaned.length })
    return NextResponse.json({
      ok: true, configured: true, query, effectiveQuery, scope,
      videos: cleaned, updatedAt: new Date().toISOString(),
    } satisfies VideoSearchResponse)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'YouTube search unavailable'
    recordProviderFetch('youtube-search', { error: message })
    return empty(query, effectiveQuery, scope, true, message)
  }
}
