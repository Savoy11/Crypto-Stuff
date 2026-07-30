import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { financeAccounts, ACCOUNT_TYPES, type AccountType } from '@/lib/db/schema'
import { badRequest, budgetGuard, cleanText, isIsoDate, parseMoney } from '@/lib/server/budgetApi'
import { loadAccounts, type WireAccount } from '@/lib/server/budgetPersistence'

// Budget accounts.
//   GET  /api/user/budget/accounts → accounts with computed current balance
//   POST /api/user/budget/accounts → { name, type, institution?, openingBalance?, openingBalanceDate? }
// Current balance = openingBalance + SUM(transactions) — the anchor design in
// db/schema/budget.ts that keeps an imported backlog from double-counting.
// Lives under /api/user/ — see the rewrite comment in next.config.mjs.

export const dynamic = 'force-dynamic'

export type { WireAccount }

export interface AccountsResponse {
  ok: boolean
  accounts?: WireAccount[]
  error?: string
}

export async function GET() {
  const g = await budgetGuard()
  if ('response' in g) return g.response
  return NextResponse.json<AccountsResponse>({ ok: true, accounts: await loadAccounts(g.userId) })
}

export async function POST(request: Request) {
  const g = await budgetGuard()
  if ('response' in g) return g.response

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return badRequest('Expected a JSON body') }

  const name = cleanText(body.name, 80)
  if (!name) return badRequest('name is required (≤80 chars)')
  const type = body.type as AccountType
  if (!ACCOUNT_TYPES.includes(type)) return badRequest(`type must be one of ${ACCOUNT_TYPES.join(', ')}`)
  const institution = body.institution == null ? null : cleanText(body.institution, 80)
  const openingBalance = body.openingBalance == null ? 0 : parseMoney(body.openingBalance)
  if (openingBalance == null) return badRequest('openingBalance must be a finite amount')
  const openingBalanceDate = body.openingBalanceDate == null ? null : (isIsoDate(body.openingBalanceDate) ? body.openingBalanceDate : undefined)
  if (openingBalanceDate === undefined) return badRequest('openingBalanceDate must be YYYY-MM-DD')

  await db.insert(financeAccounts).values({
    userId: g.userId, name, type, institution,
    openingBalance: openingBalance.toFixed(2), openingBalanceDate,
  })
  return NextResponse.json<AccountsResponse>({ ok: true, accounts: await loadAccounts(g.userId) }, { status: 201 })
}
