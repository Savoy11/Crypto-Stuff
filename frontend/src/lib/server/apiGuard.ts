import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'

// Guard for sensitive route handlers (AI invocation, config mutation,
// credential storage). Two layers:
//
// 1. Access control — if FN_ADMIN_TOKEN is set (legacy CAEP_ADMIN_TOKEN still
//    honored), requests must present it (Authorization: Bearer <token> or
//    x-fn-token header; legacy x-caep-token still accepted). If it is NOT set,
//    only requests addressed to localhost are allowed, so a build deployed to
//    a public host without a token fails closed instead of exposing these
//    endpoints to the internet.
// 2. Rate limiting — fixed-window in-memory counter per client IP + bucket.
//    In-memory is adequate for this single-instance app.

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

// ⚠ Both the localhost check below and clientKey() read client-controlled
// headers (Host, x-forwarded-for). That is sound for this app as deployed —
// single instance, no proxy in front — and the FN_ADMIN_TOKEN path does not
// depend on either. But behind a proxy that does not normalize them, a spoofed
// Host defeats the localhost fallback and a spoofed x-forwarded-for defeats
// per-IP rate limiting. If this ever goes behind a proxy: set FN_ADMIN_TOKEN
// (so access control stops relying on Host at all) and derive the client key
// from the proxy's trusted forwarding header only (audit L8).
function isLocalRequest(req: NextRequest): boolean {
  const host = (req.headers.get('host') ?? '').split(':')[0].toLowerCase()
  return LOCAL_HOSTS.has(host)
}

function tokenMatches(req: NextRequest, expected: string): boolean {
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const supplied = req.headers.get('x-fn-token') ?? req.headers.get('x-caep-token') ?? bearer ?? ''
  const a = Buffer.from(supplied)
  const b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

const windows = new Map<string, { count: number; resetAt: number }>()

function rateLimited(key: string, limitPerMinute: number): boolean {
  const now = Date.now()
  const w = windows.get(key)
  if (!w || now >= w.resetAt) {
    windows.set(key, { count: 1, resetAt: now + 60_000 })
    // Opportunistic cleanup so the map can't grow unbounded
    if (windows.size > 5000) {
      for (const [k, v] of windows) if (now >= v.resetAt) windows.delete(k)
    }
    return false
  }
  w.count += 1
  return w.count > limitPerMinute
}

function clientKey(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'local'
}

/**
 * Returns an error response when the request must be rejected, or null when
 * it may proceed. Call at the top of sensitive route handlers:
 *
 *   const denied = guardSensitiveRoute(req, 'agents-chat', 20)
 *   if (denied) return denied
 */
export function guardSensitiveRoute(
  req: NextRequest,
  bucket: string,
  limitPerMinute: number
): NextResponse | null {
  const adminToken = process.env.FN_ADMIN_TOKEN ?? process.env.CAEP_ADMIN_TOKEN
  if (adminToken) {
    if (!tokenMatches(req, adminToken)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  } else if (!isLocalRequest(req)) {
    return NextResponse.json(
      { error: 'This endpoint is disabled on non-local hosts. Set FN_ADMIN_TOKEN to enable authenticated access.' },
      { status: 403 }
    )
  }

  if (rateLimited(`${bucket}:${clientKey(req)}`, limitPerMinute)) {
    return NextResponse.json({ error: 'Rate limit exceeded — try again shortly' }, { status: 429 })
  }
  return null
}

// ─── Quota guard (rate limiting only, no access control) ─────────────────────
//
// For routes that expose no secrets but spend a metered third-party budget —
// the YouTube Data API charges 100 units per search against a 10,000/day free
// allowance, so roughly 100 searches exhaust the day for everyone.
//
// Deliberately NOT guardSensitiveRoute: these are ordinary user-facing reads,
// and requiring an admin token or localhost would break the Videos page on any
// deployed instance. The risk here is spend, not disclosure (audit L6).

const dailyWindows = new Map<string, { count: number; resetAt: number }>()

/** Whole-app daily counter, independent of client IP — the upstream quota is global. */
function dailyBudgetExceeded(bucket: string, limitPerDay: number): boolean {
  const now = Date.now()
  const w = dailyWindows.get(bucket)
  if (!w || now >= w.resetAt) {
    dailyWindows.set(bucket, { count: 1, resetAt: now + 86_400_000 })
    return false
  }
  w.count += 1
  return w.count > limitPerDay
}

/**
 * Returns an error response when the request must be rejected, or null when it
 * may proceed. Per-IP burst limit stops a runaway client; the optional
 * app-wide `limitPerDay` is what actually bounds the upstream bill, since a
 * per-minute cap alone still permits thousands of calls a day.
 *
 *   const denied = guardQuotaRoute(req, 'video-search', 10, { limitPerDay: 80 })
 *   if (denied) return denied
 */
export function guardQuotaRoute(
  req: NextRequest,
  bucket: string,
  limitPerMinute: number,
  opts: { limitPerDay?: number } = {}
): NextResponse | null {
  if (rateLimited(`${bucket}:${clientKey(req)}`, limitPerMinute)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded — try again shortly' },
      { status: 429 }
    )
  }
  if (opts.limitPerDay != null && dailyBudgetExceeded(bucket, opts.limitPerDay)) {
    return NextResponse.json(
      { error: 'Daily quota for this data source is exhausted — it resets within 24 hours.' },
      { status: 429 }
    )
  }
  return null
}
