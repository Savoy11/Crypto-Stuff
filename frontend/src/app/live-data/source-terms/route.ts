import { NextRequest, NextResponse } from 'next/server'
import {
  SOURCE_TERMS,
  SOURCE_TERMS_REVIEW_AFTER_DAYS,
  checkSourceTerms,
  getSourceTermsProvenance,
} from '@/lib/server/sourceTerms'
import { probeSiteTerms } from '@/lib/server/termsProbe'
import { guardSensitiveRoute } from '@/lib/server/apiGuard'
import { validatePublicHttpUrl } from '@/lib/server/urlSafety'

// Source-terms compliance surface.
//
//   GET  /live-data/source-terms              → the whole registry + provenance
//   GET  /live-data/source-terms?url=https://…→ the decision for one URL
//   POST /live-data/source-terms { url }      → run the live probe (robots.txt
//                                               + terms discovery + clause scan)
//
// GET is a read of a static in-repo registry, so it is unguarded like the rest
// of /live-data. POST makes outbound requests to an arbitrary host on the
// caller's say-so, which is exactly the shape apiGuard exists for — it is
// rate-limited and localhost-or-admin-token only, same as provider config.

export const dynamic = 'force-dynamic'

export interface SourceTermsListResponse {
  ok: true
  reviewAfterDays: number
  provenance: ReturnType<typeof getSourceTermsProvenance>
  entries: typeof SOURCE_TERMS
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url')
  if (url) {
    return NextResponse.json({ ok: true, decision: checkSourceTerms(url) })
  }
  return NextResponse.json({
    ok: true,
    reviewAfterDays: SOURCE_TERMS_REVIEW_AFTER_DAYS,
    provenance: getSourceTermsProvenance(),
    entries: SOURCE_TERMS,
  } satisfies SourceTermsListResponse)
}

export async function POST(request: NextRequest) {
  const denied = guardSensitiveRoute(request, 'source-terms-probe', 20)
  if (denied) return denied

  const body = (await request.json().catch(() => ({}))) as { url?: string }
  const url = body.url?.trim()
  if (!url) return NextResponse.json({ ok: false, error: 'Pass { url }' }, { status: 400 })

  // Same SSRF gate the custom-provider form uses: the probe fetches whatever it
  // is given, so it must not become a way to reach the internal network.
  const urlError = validatePublicHttpUrl(url)
  if (urlError) return NextResponse.json({ ok: false, error: urlError }, { status: 400 })

  const report = await probeSiteTerms(url)
  return NextResponse.json({ ok: true, report })
}
