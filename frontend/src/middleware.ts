import { NextResponse, type NextRequest } from 'next/server'

/**
 * Request logging for the public `/api/v1/*` contract (R2 §5.3, decision E2).
 *
 * CAEP has no consumer telemetry on `/api/v1/`, so "no one is using it" is an
 * assumption, not a fact — and the staking endpoint's legacy `riskScore` /
 * `max_risk` fields cannot be safely removed until traffic data exists. This
 * middleware emits one structured line per v1 request (method, path, query,
 * a coarse client fingerprint) so a future deprecation decision is grounded in
 * evidence. It is deliberately read-only: it never blocks, rewrites, or mutates
 * the response — always `NextResponse.next()`.
 *
 * The line is JSON on a single line for easy ingestion. It intentionally does
 * NOT log request bodies, cookies, or full headers (no auth/PII leakage).
 */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl
  // Flag legacy-scale usage on the staking endpoint so the deprecation decision
  // can see whether anyone still relies on max_risk (the inverted-filter footgun).
  const usesLegacyRiskFilter =
    pathname.endsWith('/staking/opportunities') && req.nextUrl.searchParams.has('max_risk')

  try {
    console.log(
      JSON.stringify({
        tag: 'api-v1-request',
        method: req.method,
        path: pathname,
        query: search || undefined,
        ua: req.headers.get('user-agent') || undefined,
        referer: req.headers.get('referer') || undefined,
        legacyRiskFilter: usesLegacyRiskFilter || undefined,
      })
    )
  } catch {
    // Logging must never break a request.
  }

  return NextResponse.next()
}

export const config = {
  // Scope strictly to the public v1 API — internal /live-data/* and pages are
  // untouched, so this adds no overhead to the UI.
  matcher: ['/api/v1/:path*'],
}
