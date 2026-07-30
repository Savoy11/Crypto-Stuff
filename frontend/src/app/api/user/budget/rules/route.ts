import { NextResponse } from 'next/server'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { categorizationRules, financeTransactions } from '@/lib/db/schema'
import { badRequest, budgetGuard, cleanText, isUuid, parseMoney } from '@/lib/server/budgetApi'
import { loadRules, ownsAccount, ownsCategory } from '@/lib/server/budgetPersistence'
import { categorize, type RuleLike } from '@/lib/budget/categorize'

// Categorization rules.
//   GET  /api/user/budget/rules
//   POST /api/user/budget/rules → { pattern, categoryId, matchType?, accountId?,
//        minAmount?, maxAmount?, priority?, applyToExisting? }
// applyToExisting re-runs the FULL rule set over this user's uncategorized
// transactions (first match wins across all rules, not just the new one) and
// reports how many it categorized.

export const dynamic = 'force-dynamic'

export interface RulesResponse {
  ok: boolean
  rules?: RuleLike[]
  recategorized?: number
  error?: string
}

const MATCH_TYPES = ['contains', 'starts_with', 'regex', 'exact'] as const

export async function GET() {
  const g = await budgetGuard()
  if ('response' in g) return g.response
  return NextResponse.json<RulesResponse>({ ok: true, rules: await loadRules(g.userId) })
}

export async function POST(request: Request) {
  const g = await budgetGuard()
  if ('response' in g) return g.response

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return badRequest('Expected a JSON body') }

  const pattern = cleanText(body.pattern, 200)
  if (!pattern) return badRequest('pattern is required (≤200 chars)')
  if (!isUuid(body.categoryId) || !(await ownsCategory(g.userId, body.categoryId))) return badRequest('Unknown category')
  const matchType = (body.matchType ?? 'contains') as (typeof MATCH_TYPES)[number]
  if (!MATCH_TYPES.includes(matchType)) return badRequest(`matchType must be one of ${MATCH_TYPES.join(', ')}`)
  if (matchType === 'regex') {
    try { new RegExp(pattern) } catch { return badRequest('pattern is not a valid regex') }
  }
  let accountId: string | null = null
  if (body.accountId != null) {
    if (!isUuid(body.accountId) || !(await ownsAccount(g.userId, body.accountId))) return badRequest('Unknown account')
    accountId = body.accountId
  }
  const minAmount = body.minAmount == null ? null : parseMoney(body.minAmount)
  const maxAmount = body.maxAmount == null ? null : parseMoney(body.maxAmount)
  if (body.minAmount != null && minAmount == null) return badRequest('minAmount must be a finite amount')
  if (body.maxAmount != null && maxAmount == null) return badRequest('maxAmount must be a finite amount')
  const priority = body.priority == null ? 100 : Number(body.priority)
  if (!Number.isInteger(priority) || priority < 0 || priority > 10_000) return badRequest('priority must be an integer 0–10000')

  await db.insert(categorizationRules).values({
    userId: g.userId, categoryId: body.categoryId, matchType, pattern, accountId,
    minAmount: minAmount == null ? null : minAmount.toFixed(2),
    maxAmount: maxAmount == null ? null : maxAmount.toFixed(2),
    priority,
  })

  let recategorized = 0
  if (body.applyToExisting === true) {
    recategorized = await applyRulesToUncategorized(g.userId, await loadRules(g.userId))
  }

  return NextResponse.json<RulesResponse>({ ok: true, rules: await loadRules(g.userId), recategorized }, { status: 201 })
}

async function applyRulesToUncategorized(userId: string, rules: RuleLike[]): Promise<number> {
  const rows = await db.select()
    .from(financeTransactions)
    .where(and(eq(financeTransactions.userId, userId), isNull(financeTransactions.categoryId)))
  let n = 0
  for (const row of rows) {
    const match = categorize(rules, {
      description: row.description, rawDescription: row.rawDescription,
      amount: parseFloat(row.amount), accountId: row.accountId,
    })
    if (!match) continue
    await db.update(financeTransactions)
      .set({ categoryId: match.categoryId })
      .where(eq(financeTransactions.id, row.id))
    n++
  }
  return n
}
