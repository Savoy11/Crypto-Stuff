import { NextResponse } from 'next/server'
import { isDbConfigured } from '@/lib/db'
import { getCurrentUserId } from '@/lib/auth/session'
import {
  MAX_BULK_WATCHLISTS, insertWatchlist, loadWatchlists, validateWatchlist,
  type IncomingWatchlist, type ValidatedWatchlist, type WireWatchlist,
} from '@/lib/server/watchlistPersistence'

// Watchlists — DB-backed persistence (replaces the page-local localStorage
// blob; the last Phase 1 surface to move). Wire shape is the page's existing
// { id, name, keys } lists.
//   GET  /api/user/watchlists  → this user's lists with instrument keys
//   POST /api/user/watchlists  → create {id?, name, keys} or bulk
//        {watchlists: [...]} (the one-time localStorage import).
// Client-supplied UUID ids are accepted so the store can be optimistic:
// the row it inserted locally IS the row the server created.
// Lives under /api/user/ — see the rewrite comment in next.config.mjs.

export const dynamic = 'force-dynamic'

export interface WatchlistsResponse {
  ok: boolean
  watchlists?: WireWatchlist[]
  error?: string
}

function dbUnavailable() {
  return NextResponse.json(
    { ok: false, error: 'Database is not configured — run `npm run db:status` and set DATABASE_URL in frontend/.env.local.' },
    { status: 503 },
  )
}

export async function GET() {
  if (!isDbConfigured) return dbUnavailable()
  const userId = await getCurrentUserId()
  if (!userId) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })
  return NextResponse.json<WatchlistsResponse>({ ok: true, watchlists: await loadWatchlists(userId) })
}

export async function POST(request: Request) {
  if (!isDbConfigured) return dbUnavailable()
  const userId = await getCurrentUserId()
  if (!userId) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Expected a JSON body' }, { status: 400 })
  }

  const incoming: IncomingWatchlist[] = Array.isArray((body as { watchlists?: unknown })?.watchlists)
    ? ((body as { watchlists: IncomingWatchlist[] }).watchlists).slice(0, MAX_BULK_WATCHLISTS)
    : [body as IncomingWatchlist]

  const validated: ValidatedWatchlist[] = []
  for (const w of incoming) {
    const v = validateWatchlist(w)
    if ('error' in v) return NextResponse.json({ ok: false, error: v.error }, { status: 400 })
    validated.push(v)
  }

  // New lists always land after existing tabs, in the caller's order — true
  // for a single create (the page appends new tabs) and for a bulk import
  // merging into an account that already has lists.
  const existing = (await loadWatchlists(userId)).length
  for (let i = 0; i < validated.length; i++) {
    await insertWatchlist(userId, validated[i], existing + i)
  }
  return NextResponse.json<WatchlistsResponse>(
    { ok: true, watchlists: await loadWatchlists(userId) },
    { status: 201 },
  )
}
