import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { categorizationRules } from '@/lib/db/schema'
import { badRequest, budgetGuard, isUuid } from '@/lib/server/budgetApi'
import { loadRules } from '@/lib/server/budgetPersistence'

// PATCH  /api/user/budget/rules/[id] — enable/disable or reprioritize
// DELETE /api/user/budget/rules/[id]

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: Params) {
  const g = await budgetGuard()
  if ('response' in g) return g.response
  const { id } = await params
  if (!isUuid(id)) return badRequest('Invalid rule id')

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return badRequest('Expected a JSON body') }

  const patch: Partial<typeof categorizationRules.$inferInsert> = {}
  if (body.enabled !== undefined) {
    if (typeof body.enabled !== 'boolean') return badRequest('enabled must be boolean')
    patch.enabled = body.enabled
  }
  if (body.priority !== undefined) {
    const p = Number(body.priority)
    if (!Number.isInteger(p) || p < 0 || p > 10_000) return badRequest('priority must be an integer 0–10000')
    patch.priority = p
  }
  if (Object.keys(patch).length === 0) return badRequest('No recognized fields to update')

  const updated = await db.update(categorizationRules)
    .set(patch)
    .where(and(eq(categorizationRules.id, id), eq(categorizationRules.userId, g.userId)))
    .returning({ id: categorizationRules.id })
  if (updated.length === 0) return NextResponse.json({ ok: false, error: 'Rule not found' }, { status: 404 })
  return NextResponse.json({ ok: true, rules: await loadRules(g.userId) })
}

export async function DELETE(_request: Request, { params }: Params) {
  const g = await budgetGuard()
  if ('response' in g) return g.response
  const { id } = await params
  if (!isUuid(id)) return badRequest('Invalid rule id')

  const deleted = await db.delete(categorizationRules)
    .where(and(eq(categorizationRules.id, id), eq(categorizationRules.userId, g.userId)))
    .returning({ id: categorizationRules.id })
  if (deleted.length === 0) return NextResponse.json({ ok: false, error: 'Rule not found' }, { status: 404 })
  return NextResponse.json({ ok: true, rules: await loadRules(g.userId) })
}
