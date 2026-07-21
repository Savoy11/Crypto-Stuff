import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db, isDbConfigured } from '@/lib/db'
import { portfolios } from '@/lib/db/schema'
import { getCurrentUserId } from '@/lib/auth/session'
import {
  PORTFOLIO_UUID_RE, replacePortfolio, validatePortfolio,
  type IncomingPortfolio,
} from '@/lib/server/portfolioPersistence'

// Single-portfolio operations.
//   PUT    /api/user/portfolios/[id]  → full-document replace (fields +
//          entire holdings set — the editor edits the whole set at once)
//   DELETE /api/user/portfolios/[id]  → cascades to holdings via FK
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
  if (!PORTFOLIO_UUID_RE.test(params.id)) return NextResponse.json({ ok: false, error: 'Invalid portfolio id' }, { status: 400 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Expected a JSON body' }, { status: 400 })
  }

  const v = validatePortfolio(body as IncomingPortfolio)
  if ('error' in v) return NextResponse.json({ ok: false, error: v.error }, { status: 400 })

  const replaced = await replacePortfolio(userId, params.id, v)
  if (!replaced) return NextResponse.json({ ok: false, error: 'Portfolio not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  if (!isDbConfigured) return dbUnavailable()
  const userId = await getCurrentUserId()
  if (!userId) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })
  if (!PORTFOLIO_UUID_RE.test(params.id)) return NextResponse.json({ ok: false, error: 'Invalid portfolio id' }, { status: 400 })

  const deleted = await db.delete(portfolios)
    .where(and(eq(portfolios.id, params.id), eq(portfolios.userId, userId)))
    .returning({ id: portfolios.id })
  if (deleted.length === 0) return NextResponse.json({ ok: false, error: 'Portfolio not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
