import { NextResponse } from 'next/server'
import { asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { recurringRules } from '@/lib/db/schema'
import { badRequest, budgetGuard, cleanText, isIsoDate, isUuid, parseMoney } from '@/lib/server/budgetApi'
import { loadTransactions, ownsCategory } from '@/lib/server/budgetPersistence'
import { detectRecurring, merchantKey, type RecurringSuggestion } from '@/lib/budget/recurring'

// Recurring transactions.
//   GET  /api/user/budget/recurring → { confirmed, suggestions }
//        confirmed = stored recurring_rules rows; suggestions = fresh
//        detection over the last 400 transactions, minus anything already
//        stored (matched by merchant key). Inferred ≠ fact: suggestions are
//        only persisted when the user confirms one.
//   POST /api/user/budget/recurring → confirm a suggestion (or declare one
//        manually): { description, amount, cadence, nextDueAt?, categoryId? }
//        Pass { dismiss: true } to record "no thanks" instead: detection runs
//        fresh on every load, so without a stored dismissal an unwanted
//        suggestion returned forever (NT1, review Budget note 7). A dismissed
//        row suppresses the suggestion by merchant key and is never listed as
//        a confirmed recurring item.

export const dynamic = 'force-dynamic'

export interface WireRecurring {
  id: string
  description: string
  amount: number
  cadence: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly'
  nextDueAt: string | null
  categoryId: string | null
  confirmed: boolean
  active: boolean
}

export interface RecurringResponse {
  ok: boolean
  confirmed?: WireRecurring[]
  suggestions?: RecurringSuggestion[]
  error?: string
}

const CADENCES = ['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'] as const

/** Every stored row, dismissals included — the suggestion filter needs them. */
async function loadAllRows(userId: string) {
  return db.select().from(recurringRules)
    .where(eq(recurringRules.userId, userId))
    .orderBy(asc(recurringRules.createdAt))
}

async function loadConfirmed(userId: string): Promise<WireRecurring[]> {
  const rows = (await loadAllRows(userId)).filter((r) => !r.dismissed)
  return rows.map((r) => ({
    id: r.id, description: r.description, amount: parseFloat(r.amount),
    cadence: r.cadence, nextDueAt: r.nextDueAt, categoryId: r.categoryId,
    confirmed: r.confirmed, active: r.active,
  }))
}

export async function GET() {
  const g = await budgetGuard()
  if ('response' in g) return g.response

  const [allRows, recent] = await Promise.all([
    loadAllRows(g.userId),
    loadTransactions(g.userId, { limit: 400 }),
  ])
  const confirmed: WireRecurring[] = allRows.filter((r) => !r.dismissed).map((r) => ({
    id: r.id, description: r.description, amount: parseFloat(r.amount),
    cadence: r.cadence, nextDueAt: r.nextDueAt, categoryId: r.categoryId,
    confirmed: r.confirmed, active: r.active,
  }))
  // Dismissals count as "known" even though they are not shown — suppressing
  // the suggestion is their entire job.
  const known = new Set(allRows.map((r) => merchantKey(r.description)))
  const suggestions = detectRecurring(
    recent.map((t) => ({ description: t.description, amount: t.amount, postedAt: t.postedAt })),
  ).filter((s) => !known.has(s.key))

  return NextResponse.json<RecurringResponse>({ ok: true, confirmed, suggestions })
}

export async function POST(request: Request) {
  const g = await budgetGuard()
  if ('response' in g) return g.response

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return badRequest('Expected a JSON body') }

  const description = cleanText(body.description, 300)
  if (!description) return badRequest('description is required')
  const amount = parseMoney(body.amount)
  if (amount == null) return badRequest('amount must be a finite number')
  const cadence = body.cadence as (typeof CADENCES)[number]
  if (!CADENCES.includes(cadence)) return badRequest(`cadence must be one of ${CADENCES.join(', ')}`)
  const nextDueAt = body.nextDueAt == null ? null : (isIsoDate(body.nextDueAt) ? body.nextDueAt : undefined)
  if (nextDueAt === undefined) return badRequest('nextDueAt must be YYYY-MM-DD')
  let categoryId: string | null = null
  if (body.categoryId != null) {
    if (!isUuid(body.categoryId) || !(await ownsCategory(g.userId, body.categoryId))) return badRequest('Unknown category')
    categoryId = body.categoryId
  }

  // A dismissal is stored as an unconfirmed, inactive, dismissed row: it is a
  // record of the user's answer, not a recurring item they declared.
  const dismiss = body.dismiss === true

  await db.insert(recurringRules).values({
    userId: g.userId, description, amount: amount.toFixed(2), cadence, nextDueAt,
    categoryId,
    confirmed: !dismiss,
    active: !dismiss,
    dismissed: dismiss,
  })
  return NextResponse.json<RecurringResponse>({ ok: true, confirmed: await loadConfirmed(g.userId) }, { status: 201 })
}
