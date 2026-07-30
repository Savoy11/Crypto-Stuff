import { NextRequest, NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { budgets } from '@/lib/db/schema'
import { badRequest, budgetGuard, isUuid, monthEnd, monthStart, parseMoney } from '@/lib/server/budgetApi'
import { loadBudgets, monthActuals, ownsCategory, type WireBudget } from '@/lib/server/budgetPersistence'

// Monthly budgets vs actuals.
//   GET /api/user/budget/budgets?month=YYYY-MM
//       → { budgets, actuals } for the month. A missing budget row means "no
//         budget set" — the UI renders that differently from a target of 0.
//   PUT /api/user/budget/budgets
//       → { month: 'YYYY-MM', entries: [{ categoryId, amount|null }] }
//         Upserts per (category, month); amount null deletes the row
//         (un-setting a budget is not the same as budgeting 0).

export const dynamic = 'force-dynamic'

export type { WireBudget }

export interface BudgetsResponse {
  ok: boolean
  month?: string
  budgets?: WireBudget[]
  /** Signed per-category transaction sums for the month; null categoryId = uncategorized. */
  actuals?: Array<{ categoryId: string | null; total: number; count: number }>
  error?: string
}

export async function GET(request: NextRequest) {
  const g = await budgetGuard()
  if ('response' in g) return g.response
  const start = monthStart(request.nextUrl.searchParams.get('month'))
  if (!start) return badRequest('month=YYYY-MM is required')

  const [budgetRows, actuals] = await Promise.all([
    loadBudgets(g.userId, start),
    monthActuals(g.userId, start, monthEnd(start)),
  ])
  return NextResponse.json<BudgetsResponse>({ ok: true, month: start.slice(0, 7), budgets: budgetRows, actuals })
}

export async function PUT(request: Request) {
  const g = await budgetGuard()
  if ('response' in g) return g.response

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return badRequest('Expected a JSON body') }
  const start = monthStart(typeof body.month === 'string' ? body.month : null)
  if (!start) return badRequest('month must be YYYY-MM')
  if (!Array.isArray(body.entries) || body.entries.length === 0) return badRequest('entries[] is required')
  if (body.entries.length > 200) return badRequest('entries[] exceeds 200')

  for (const [i, e] of (body.entries as Array<Record<string, unknown>>).entries()) {
    if (!isUuid(e.categoryId) || !(await ownsCategory(g.userId, e.categoryId))) {
      return badRequest(`entries[${i}].categoryId is unknown`)
    }
    if (e.amount === null) {
      await db.delete(budgets).where(sql`${budgets.userId} = ${g.userId} and ${budgets.categoryId} = ${e.categoryId} and ${budgets.periodStart} = ${start}`)
      continue
    }
    const amount = parseMoney(e.amount)
    if (amount == null || amount < 0) return badRequest(`entries[${i}].amount must be a non-negative amount or null`)
    await db.insert(budgets)
      .values({ userId: g.userId, categoryId: e.categoryId, periodStart: start, amount: amount.toFixed(2) })
      .onConflictDoUpdate({
        target: [budgets.userId, budgets.categoryId, budgets.periodStart],
        set: { amount: amount.toFixed(2) },
      })
  }

  return NextResponse.json<BudgetsResponse>({ ok: true, month: start.slice(0, 7), budgets: await loadBudgets(g.userId, start) })
}
