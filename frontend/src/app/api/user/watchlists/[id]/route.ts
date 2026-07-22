import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db, isDbConfigured } from '@/lib/db'
import { watchlists } from '@/lib/db/schema'
import { getCurrentUserId } from '@/lib/auth/session'
import {
  WATCHLIST_UUID_RE, replaceWatchlist, validateWatchlist,
  type IncomingWatchlist,
} from '@/lib/server/watchlistPersistence'

// Single-watchlist operations.
//   PUT    /api/user/watchlists/[id]  → full-document replace (name +
//          entire key set — the page edits one list's keys at a time)
//   DELETE /api/user/watchlists/[id]  → cascades to items via FK
//
// DYNAMIC route — reachable only because /api/user/ is excluded from the
// legacy-backend rewrite (next.config.mjs). Ownership is enforced in every
// WHERE: another user's id behaves exactly like a missing one (404).

export const dynamic = 'force-dynamic'

function dbUnavailable() {
  return NextResponse.json(
    { ok: false, error: 'Database is not configured — run `npm run db:status` and set DATABASE_URL in frontend/.env.local.' },
    { status: 503 },
  )
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  if (!isDbConfigured) return dbUnavailable()
  const userId = await getCurrentUserId()
  if (!userId) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })
  if (!WATCHLIST_UUID_RE.test(params.id)) return NextResponse.json({ ok: false, error: 'Invalid watchlist id' }, { status: 400 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Expected a JSON body' }, { status: 400 })
  }

  const v = validateWatchlist(body as IncomingWatchlist)
  if ('error' in v) return NextResponse.json({ ok: false, error: v.error }, { status: 400 })

  const replaced = await replaceWatchlist(userId, params.id, v)
  if (!replaced) return NextResponse.json({ ok: false, error: 'Watchlist not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  if (!isDbConfigured) return dbUnavailable()
  const userId = await getCurrentUserId()
  if (!userId) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })
  if (!WATCHLIST_UUID_RE.test(params.id)) return NextResponse.json({ ok: false, error: 'Invalid watchlist id' }, { status: 400 })

  const deleted = await db.delete(watchlists)
    .where(and(eq(watchlists.id, params.id), eq(watchlists.userId, userId)))
    .returning({ id: watchlists.id })
  if (deleted.length === 0) return NextResponse.json({ ok: false, error: 'Watchlist not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
