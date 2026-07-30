import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { financeAccounts, ACCOUNT_TYPES, type AccountType } from '@/lib/db/schema'
import { badRequest, budgetGuard, cleanText, isUuid, parseMoney } from '@/lib/server/budgetApi'
import { loadAccounts } from '@/lib/server/budgetPersistence'

// PATCH /api/user/budget/accounts/[id] — partial update (name, type,
//       institution, openingBalance, archived)
// DELETE /api/user/budget/accounts/[id] — removes the account AND its
//       transactions (FK cascade). The client confirms before calling.

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: Params) {
  const g = await budgetGuard()
  if ('response' in g) return g.response
  const { id } = await params
  if (!isUuid(id)) return badRequest('Invalid account id')

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return badRequest('Expected a JSON body') }

  const patch: Partial<typeof financeAccounts.$inferInsert> = {}
  if (body.name !== undefined) {
    const name = cleanText(body.name, 80)
    if (!name) return badRequest('name must be a non-empty string (≤80 chars)')
    patch.name = name
  }
  if (body.type !== undefined) {
    if (!ACCOUNT_TYPES.includes(body.type as AccountType)) return badRequest(`type must be one of ${ACCOUNT_TYPES.join(', ')}`)
    patch.type = body.type as AccountType
  }
  if (body.institution !== undefined) {
    patch.institution = body.institution == null ? null : cleanText(body.institution, 80)
  }
  if (body.openingBalance !== undefined) {
    const v = parseMoney(body.openingBalance)
    if (v == null) return badRequest('openingBalance must be a finite amount')
    patch.openingBalance = v.toFixed(2)
  }
  if (body.archived !== undefined) {
    if (typeof body.archived !== 'boolean') return badRequest('archived must be boolean')
    patch.archived = body.archived
  }
  if (Object.keys(patch).length === 0) return badRequest('No recognized fields to update')

  const updated = await db.update(financeAccounts)
    .set(patch)
    .where(and(eq(financeAccounts.id, id), eq(financeAccounts.userId, g.userId)))
    .returning({ id: financeAccounts.id })
  if (updated.length === 0) return NextResponse.json({ ok: false, error: 'Account not found' }, { status: 404 })
  return NextResponse.json({ ok: true, accounts: await loadAccounts(g.userId) })
}

export async function DELETE(_request: Request, { params }: Params) {
  const g = await budgetGuard()
  if ('response' in g) return g.response
  const { id } = await params
  if (!isUuid(id)) return badRequest('Invalid account id')

  const deleted = await db.delete(financeAccounts)
    .where(and(eq(financeAccounts.id, id), eq(financeAccounts.userId, g.userId)))
    .returning({ id: financeAccounts.id })
  if (deleted.length === 0) return NextResponse.json({ ok: false, error: 'Account not found' }, { status: 404 })
  return NextResponse.json({ ok: true, accounts: await loadAccounts(g.userId) })
}
