import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { financeTransactions } from '@/lib/db/schema'
import { badRequest, budgetGuard, cleanText, isIsoDate, isUuid, parseMoney } from '@/lib/server/budgetApi'
import { ownsCategory } from '@/lib/server/budgetPersistence'

// PATCH  /api/user/budget/transactions/[id] — edit category/description/amount/date/note
// DELETE /api/user/budget/transactions/[id]

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: Params) {
  const g = await budgetGuard()
  if ('response' in g) return g.response
  const { id } = await params
  if (!isUuid(id)) return badRequest('Invalid transaction id')

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return badRequest('Expected a JSON body') }

  const patch: Partial<typeof financeTransactions.$inferInsert> = {}
  if (body.categoryId !== undefined) {
    if (body.categoryId === null) patch.categoryId = null
    else {
      if (!isUuid(body.categoryId) || !(await ownsCategory(g.userId, body.categoryId))) return badRequest('Unknown category')
      patch.categoryId = body.categoryId
    }
  }
  if (body.description !== undefined) {
    const description = cleanText(body.description, 300)
    if (!description) return badRequest('description must be a non-empty string')
    patch.description = description
  }
  if (body.amount !== undefined) {
    const amount = parseMoney(body.amount)
    if (amount == null) return badRequest('amount must be a finite number')
    patch.amount = amount.toFixed(2)
  }
  if (body.postedAt !== undefined) {
    if (!isIsoDate(body.postedAt)) return badRequest('postedAt must be YYYY-MM-DD')
    patch.postedAt = body.postedAt
  }
  if (body.note !== undefined) {
    patch.note = body.note == null ? null : cleanText(body.note, 500)
  }
  if (Object.keys(patch).length === 0) return badRequest('No recognized fields to update')

  const updated = await db.update(financeTransactions)
    .set(patch)
    .where(and(eq(financeTransactions.id, id), eq(financeTransactions.userId, g.userId)))
    .returning({ id: financeTransactions.id })
  if (updated.length === 0) return NextResponse.json({ ok: false, error: 'Transaction not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_request: Request, { params }: Params) {
  const g = await budgetGuard()
  if ('response' in g) return g.response
  const { id } = await params
  if (!isUuid(id)) return badRequest('Invalid transaction id')

  const deleted = await db.delete(financeTransactions)
    .where(and(eq(financeTransactions.id, id), eq(financeTransactions.userId, g.userId)))
    .returning({ id: financeTransactions.id })
  if (deleted.length === 0) return NextResponse.json({ ok: false, error: 'Transaction not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
