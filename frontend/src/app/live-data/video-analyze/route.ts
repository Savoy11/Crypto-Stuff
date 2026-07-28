import { NextRequest, NextResponse } from 'next/server'
import {
  selectVideoAnalyzer,
  listVideoAnalyzers,
  withTimestamp,
  NoVideoAnalyzerError,
  type VideoTimestamp,
} from '@/lib/video'
import { validatePublicHttpUrl } from '@/lib/server/urlSafety'
import { guardSensitiveRoute } from '@/lib/server/apiGuard'

// Ask an AI model about a specific video.
//   GET  /live-data/video-analyze              → which providers exist / are configured
//   POST /live-data/video-analyze  { videoUrl, question, provider?, detail? }
//
// Provider-agnostic: the route never names a model. It asks lib/video for a
// capable, configured analyzer and calls the interface. Adding a provider is an
// adapter registration, not a change here.
//
// Guarded like the other AI endpoints: this spends the user's API credits, so
// it is localhost-only unless FN_ADMIN_TOKEN (legacy CAEP_ADMIN_TOKEN) is set (see apiGuard).

export const dynamic = 'force-dynamic'

export interface VideoAnalyzeResponse {
  ok: boolean
  answer?: string
  /** Cited moments, each with a ready-made deep link into the video. */
  moments?: Array<VideoTimestamp & { url: string }>
  provider?: string
  model?: string
  tokensUsed?: number
  error?: string
}

export async function GET() {
  return NextResponse.json({ ok: true, providers: listVideoAnalyzers() })
}

export async function POST(request: NextRequest) {
  // Deliberately tighter than the chat agents' 20/min: each call can process an
  // hour of video and bill accordingly, so a runaway loop is expensive.
  const denied = guardSensitiveRoute(request, 'video-analyze', 6)
  if (denied) return denied

  let body: { videoUrl?: string; question?: string; provider?: string; detail?: 'low' | 'default' }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' } satisfies VideoAnalyzeResponse, { status: 400 })
  }

  const videoUrl = body.videoUrl?.trim()
  const question = body.question?.trim()

  if (!videoUrl || !question) {
    return NextResponse.json(
      { ok: false, error: 'videoUrl and question are required' } satisfies VideoAnalyzeResponse,
      { status: 400 }
    )
  }

  // The URL is handed to a third-party model to fetch, so it gets the same SSRF
  // validation as any other user-supplied endpoint.
  const urlError = validatePublicHttpUrl(videoUrl)
  if (urlError) {
    return NextResponse.json({ ok: false, error: urlError } satisfies VideoAnalyzeResponse, { status: 400 })
  }

  try {
    const analyzer = selectVideoAnalyzer(body.provider)
    const result = await analyzer.analyze({
      videoUrl,
      question,
      detail: body.detail ?? 'low',
    })

    return NextResponse.json({
      ok: true,
      answer: result.text,
      moments: result.timestamps.map((t) => ({ ...t, url: withTimestamp(videoUrl, t.seconds) })),
      provider: result.provider,
      model: result.model,
      tokensUsed: result.tokensUsed,
    } satisfies VideoAnalyzeResponse)
  } catch (e) {
    // 501 for "nothing capable is set up" vs 502 for a provider failure: the
    // first is a configuration problem, the second is someone else's outage.
    const status = e instanceof NoVideoAnalyzerError ? 501 : 502
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Video analysis failed' } satisfies VideoAnalyzeResponse,
      { status }
    )
  }
}
