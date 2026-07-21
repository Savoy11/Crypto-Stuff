import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db, isDbConfigured } from '@/lib/db'
import { builderPlans, portfolios } from '@/lib/db/schema'
import { getCurrentUserId } from '@/lib/auth/session'

// Single-plan operations.
//   PATCH  /api/user/builder-plans/[id]  → {markReviewed?, name?, linkedPortfolioId?}
//   DELETE /api/user/builder-plans/[id]
//
// This is a DYNAMIC route — it only reaches its handler because /api/user/ is
// excluded from the legacy-backend rewrite in next.config.mjs. Every query is
// scoped to (id, userId): a valid id belonging to another user is a 404, not
// a hit — the same shape as not existing at all.

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function dbUnavailable() {
  return NextResponse.json(
    { ok: false, error: 'Database is not configured — run `npm run db:status` and set DATABASE_URL in frontend/.env.local.' },
    { status: 503 },
  )
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  if (!isDbConfigured) return dbUnavailable()
  const userId = await getCurrentUserId()
  if (!userId) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })
  if (!UUID_RE.test(params.id)) return NextResponse.json({ ok: false, error: 'Invalid plan id' }, { status: 400 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Expected a JSON body' }, { status: 400 })
  }

  const updates: Partial<{ lastReviewedAt: Date; name: string; linkedPortfolioId: string | null }> = {}
  if (body.markReviewed === true) updates.lastReviewedAt = new Date()
  if (typeof body.name === 'string' && body.name.trim()) updates.name = body.name.trim().slice(0, 120)
  if (body.linkedPortfolioId === null) updates.linkedPortfolioId = null
  if (typeof body.linkedPortfolioId === 'string') {
    if (!UUID_RE.test(body.linkedPortfolioId)) {
      return NextResponse.json({ ok: false, error: 'Invalid portfolio id' }, { status: 400 })
    }
    // The FK would reject a bad id anyway, but check ownership too — linking
    // someone else's portfolio id must look identical to it not existing.
    const [owned] = await db.select({ id: portfolios.id }).from(portfolios)
      .where(and(eq(portfolios.id, body.linkedPortfolioId), eq(portfolios.userId, userId)))
      .limit(1)
    if (!owned) return NextResponse.json({ ok: false, error: 'Portfolio not found' }, { status: 404 })
    updates.linkedPortfolioId = body.linkedPortfolioId
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: false, error: 'Nothing to update' }, { status: 400 })
  }

  const [row] = await db.update(builderPlans)
    .set(updates)
    .where(and(eq(builderPlans.id, params.id), eq(builderPlans.userId, userId)))
    .returning()
  if (!row) return NextResponse.json({ ok: false, error: 'Plan not found' }, { status: 404 })

  return NextResponse.json({
    ok: true,
    plan: {
      id: row.id,
      name: row.name,
      createdAt: row.createdAt.toISOString(),
      lastReviewedAt: row.lastReviewedAt.toISOString(),
      linkedPortfolioId: row.linkedPortfolioId,
      plan: row.plan,
    },
  })
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  if (!isDbConfigured) return dbUnavailable()
  const userId = await getCurrentUserId()
  if (!userId) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })
  if (!UUID_RE.test(params.id)) return NextResponse.json({ ok: false, error: 'Invalid plan id' }, { status: 400 })

  const deleted = await db.delete(builderPlans)
    .where(and(eq(builderPlans.id, params.id), eq(builderPlans.userId, userId)))
    .returning({ id: builderPlans.id })
  if (deleted.length === 0) return NextResponse.json({ ok: false, error: 'Plan not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
