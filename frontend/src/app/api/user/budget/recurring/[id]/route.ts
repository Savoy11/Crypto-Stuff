import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { recurringRules } from '@/lib/db/schema'
import { badRequest, budgetGuard, isUuid } from '@/lib/server/budgetApi'

// PATCH  /api/user/budget/recurring/[id] — pause/resume (active)
// DELETE /api/user/budget/recurring/[id]

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: Params) {
  const g = await budgetGuard()
  if ('response' in g) return g.response
  const { id } = await params
  if (!isUuid(id)) return badRequest('Invalid recurring rule id')

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return badRequest('Expected a JSON body') }
  if (typeof body.active !== 'boolean') return badRequest('active (boolean) is the only patchable field')

  const updated = await db.update(recurringRules)
    .set({ active: body.active })
    .where(and(eq(recurringRules.id, id), eq(recurringRules.userId, g.userId)))
    .returning({ id: recurringRules.id })
  if (updated.length === 0) return NextResponse.json({ ok: false, error: 'Recurring rule not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_request: Request, { params }: Params) {
  const g = await budgetGuard()
  if ('response' in g) return g.response
  const { id } = await params
  if (!isUuid(id)) return badRequest('Invalid recurring rule id')

  const deleted = await db.delete(recurringRules)
    .where(and(eq(recurringRules.id, id), eq(recurringRules.userId, g.userId)))
    .returning({ id: recurringRules.id })
  if (deleted.length === 0) return NextResponse.json({ ok: false, error: 'Recurring rule not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
