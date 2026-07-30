import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { budgetCategories } from '@/lib/db/schema'
import { badRequest, budgetGuard, cleanText } from '@/lib/server/budgetApi'
import { loadCategoriesSeeded, type WireCategory } from '@/lib/server/budgetPersistence'

// Budget categories.
//   GET  /api/user/budget/categories → this user's categories, seeding the
//        default set on first use (idempotent under the name unique index)
//   POST /api/user/budget/categories → { name, kind? }

export const dynamic = 'force-dynamic'

export type { WireCategory }

export interface CategoriesResponse {
  ok: boolean
  categories?: WireCategory[]
  error?: string
}

export async function GET() {
  const g = await budgetGuard()
  if ('response' in g) return g.response
  return NextResponse.json<CategoriesResponse>({ ok: true, categories: await loadCategoriesSeeded(g.userId) })
}

export async function POST(request: Request) {
  const g = await budgetGuard()
  if ('response' in g) return g.response

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return badRequest('Expected a JSON body') }

  const name = cleanText(body.name, 60)
  if (!name) return badRequest('name is required (≤60 chars)')
  const kind = body.kind ?? 'expense'
  if (kind !== 'expense' && kind !== 'income' && kind !== 'transfer') {
    return badRequest('kind must be expense | income | transfer')
  }

  const inserted = await db.insert(budgetCategories)
    .values({ userId: g.userId, name, kind, sortOrder: 999 })
    .onConflictDoNothing()
    .returning({ id: budgetCategories.id })
  if (inserted.length === 0) return badRequest(`A category named "${name}" already exists`)
  return NextResponse.json<CategoriesResponse>({ ok: true, categories: await loadCategoriesSeeded(g.userId) }, { status: 201 })
}
