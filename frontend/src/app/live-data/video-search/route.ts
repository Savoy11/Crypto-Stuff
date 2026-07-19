import { NextRequest, NextResponse } from 'next/server'
import { getProviderKey, recordProviderFetch } from '@/lib/api/live/providers'
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
  videos: VideoItem[]
  updatedAt: string
  error?: string
}

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

function empty(query: string, configured: boolean, error?: string): NextResponse {
  return NextResponse.json({
    ok: !error, configured, query, videos: [], updatedAt: new Date().toISOString(), error,
  } satisfies VideoSearchResponse)
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')?.trim() ?? ''
  const order = request.nextUrl.searchParams.get('order') === 'date' ? 'date' : 'relevance'
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') ?? '25', 10) || 25, 50)

  const key = getProviderKey('youtube-search')
  if (!key) return empty(query, false)
  if (!query) return empty(query, true)

  const url = new URL('https://www.googleapis.com/youtube/v3/search')
  url.searchParams.set('part', 'snippet')
  url.searchParams.set('type', 'video')
  url.searchParams.set('q', query)
  url.searchParams.set('order', order)
  url.searchParams.set('maxResults', String(limit))
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
      return empty(query, true, detail)
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

    recordProviderFetch('youtube-search', { count: videos.length })
    return NextResponse.json({
      ok: true, configured: true, query, videos, updatedAt: new Date().toISOString(),
    } satisfies VideoSearchResponse)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'YouTube search unavailable'
    recordProviderFetch('youtube-search', { error: message })
    return empty(query, true, message)
  }
}
