import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { budgetCategories } from '@/lib/db/schema'
import { badRequest, budgetGuard, cleanText, isUuid } from '@/lib/server/budgetApi'
import { loadCategoriesSeeded } from '@/lib/server/budgetPersistence'

// PATCH  /api/user/budget/categories/[id] — rename / recolor
// DELETE /api/user/budget/categories/[id] — transactions keep existing via
//        FK set-null (they become uncategorized, which the UI surfaces).

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: Params) {
  const g = await budgetGuard()
  if ('response' in g) return g.response
  const { id } = await params
  if (!isUuid(id)) return badRequest('Invalid category id')

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return badRequest('Expected a JSON body') }

  const patch: Partial<typeof budgetCategories.$inferInsert> = {}
  if (body.name !== undefined) {
    const name = cleanText(body.name, 60)
    if (!name) return badRequest('name must be a non-empty string (≤60 chars)')
    patch.name = name
  }
  if (body.color !== undefined) {
    patch.color = body.color == null ? null : cleanText(body.color, 20)
  }
  if (Object.keys(patch).length === 0) return badRequest('No recognized fields to update')

  const updated = await db.update(budgetCategories)
    .set(patch)
    .where(and(eq(budgetCategories.id, id), eq(budgetCategories.userId, g.userId)))
    .returning({ id: budgetCategories.id })
  if (updated.length === 0) return NextResponse.json({ ok: false, error: 'Category not found' }, { status: 404 })
  return NextResponse.json({ ok: true, categories: await loadCategoriesSeeded(g.userId) })
}

export async function DELETE(_request: Request, { params }: Params) {
  const g = await budgetGuard()
  if ('response' in g) return g.response
  const { id } = await params
  if (!isUuid(id)) return badRequest('Invalid category id')

  const deleted = await db.delete(budgetCategories)
    .where(and(eq(budgetCategories.id, id), eq(budgetCategories.userId, g.userId)))
    .returning({ id: budgetCategories.id })
  if (deleted.length === 0) return NextResponse.json({ ok: false, error: 'Category not found' }, { status: 404 })
  return NextResponse.json({ ok: true, categories: await loadCategoriesSeeded(g.userId) })
}
