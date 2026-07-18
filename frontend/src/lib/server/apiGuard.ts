import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'

// Guard for sensitive route handlers (AI invocation, config mutation,
// credential storage). Two layers:
//
// 1. Access control — if CAEP_ADMIN_TOKEN is set, requests must present it
//    (Authorization: Bearer <token> or x-caep-token header). If it is NOT set,
//    only requests addressed to localhost are allowed, so a build deployed to
//    a public host without a token fails closed instead of exposing these
//    endpoints to the internet.
// 2. Rate limiting — fixed-window in-memory counter per client IP + bucket.
//    In-memory is adequate for this single-instance app.

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

function isLocalRequest(req: NextRequest): boolean {
  const host = (req.headers.get('host') ?? '').split(':')[0].toLowerCase()
  return LOCAL_HOSTS.has(host)
}

function tokenMatches(req: NextRequest, expected: string): boolean {
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const supplied = req.headers.get('x-caep-token') ?? bearer ?? ''
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
  const adminToken = process.env.CAEP_ADMIN_TOKEN
  if (adminToken) {
    if (!tokenMatches(req, adminToken)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  } else if (!isLocalRequest(req)) {
    return NextResponse.json(
      { error: 'This endpoint is disabled on non-local hosts. Set CAEP_ADMIN_TOKEN to enable authenticated access.' },
      { status: 403 }
    )
  }

  if (rateLimited(`${bucket}:${clientKey(req)}`, limitPerMinute)) {
    return NextResponse.json({ error: 'Rate limit exceeded — try again shortly' }, { status: 429 })
  }
  return null
}
