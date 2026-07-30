import 'server-only'

import { NextResponse } from 'next/server'
import { isDbConfigured } from '@/lib/db'
import { getCurrentUserId } from '@/lib/auth/session'

// Shared plumbing for the /api/user/budget/* routes: the DB-configured check,
// the auth check, and the field validators every route repeats. Same guard
// semantics as the portfolios/watchlists routes.

export type Guarded = { userId: string } | { response: NextResponse }

export async function budgetGuard(): Promise<Guarded> {
  if (!isDbConfigured) {
    return {
      response: NextResponse.json(
        { ok: false, error: 'Database is not configured — run `npm run db:status` and set DATABASE_URL in frontend/.env.local.' },
        { status: 503 },
      ),
    }
  }
  const userId = await getCurrentUserId()
  if (!userId) return { response: NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 }) }
  return { userId }
}

export function badRequest(error: string): NextResponse {
  return NextResponse.json({ ok: false, error }, { status: 400 })
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v)
}

/** "YYYY-MM" → first-of-month ISO date, or null when malformed. */
export function monthStart(month: string | null): string | null {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return null
  const [y, m] = month.split('-').map((n) => parseInt(n, 10))
  if (m < 1 || m > 12) return null
  return `${month}-01`
}

/** Exclusive end of the month that starts at `startIso` (YYYY-MM-01). */
export function monthEnd(startIso: string): string {
  const [y, m] = startIso.split('-').map((n) => parseInt(n, 10))
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
  return `${next}-01`
}

/** Money amount: finite, 2dp, sane magnitude. Returns normalized number or null. */
export function parseMoney(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN
  if (!isFinite(n) || Math.abs(n) > 1e12) return null
  return Math.round(n * 100) / 100
}

export function isIsoDate(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
}

export function cleanText(v: unknown, maxLen: number): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  if (!t || t.length > maxLen) return null
  return t
}
