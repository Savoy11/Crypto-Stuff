import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { financeTransactions } from '@/lib/db/schema'
import { badRequest, budgetGuard, cleanText, isIsoDate, isUuid, monthEnd, monthStart, parseMoney } from '@/lib/server/budgetApi'
import { loadRules, loadTransactions, ownsAccount, ownsCategory, type WireTransaction } from '@/lib/server/budgetPersistence'
import { categorize } from '@/lib/budget/categorize'

// Budget transactions.
//   GET  /api/user/budget/transactions?month=YYYY-MM&accountId=…&limit=…
//   POST /api/user/budget/transactions
//        single: { accountId, amount, description, postedAt, categoryId?, note? }
//        import: { accountId, imported: [{ postedAt, amount, description }, …] }
// Imported rows get an importHash (account+date+amount+raw description) whose
// unique index makes re-importing an overlapping CSV a no-op instead of a
// duplicate; the response reports inserted vs skipped so the UI can say so.
// Categorization rules run server-side on every insert that has no explicit
// category — same categorize() the preview uses, so they cannot disagree.

export const dynamic = 'force-dynamic'

export type { WireTransaction }

export interface TransactionsResponse {
  ok: boolean
  transactions?: WireTransaction[]
  /** Import only: how the batch landed. */
  inserted?: number
  duplicates?: number
  autoCategorized?: number
  error?: string
}

const MAX_IMPORT_ROWS = 5000

export async function GET(request: NextRequest) {
  const g = await budgetGuard()
  if ('response' in g) return g.response
  const sp = request.nextUrl.searchParams

  const month = sp.get('month')
  let from: string | undefined
  let to: string | undefined
  if (month != null) {
    const start = monthStart(month)
    if (!start) return badRequest('month must be YYYY-MM')
    from = start
    to = monthEnd(start)
  }
  const accountId = sp.get('accountId') ?? undefined
  if (accountId !== undefined && !isUuid(accountId)) return badRequest('accountId must be a UUID')
  const limitRaw = sp.get('limit')
  const limit = limitRaw == null ? undefined : parseInt(limitRaw, 10)
  if (limit !== undefined && (!isFinite(limit) || limit < 1)) return badRequest('limit must be a positive integer')

  return NextResponse.json<TransactionsResponse>({
    ok: true,
    transactions: await loadTransactions(g.userId, { from, to, accountId, limit }),
  })
}

interface ImportedRow { postedAt: string; amount: number; description: string }

function importHash(accountId: string, row: ImportedRow): string {
  return createHash('sha256')
    .update(`${accountId}|${row.postedAt}|${row.amount.toFixed(2)}|${row.description}`)
    .digest('hex')
}

export async function POST(request: Request) {
  const g = await budgetGuard()
  if ('response' in g) return g.response

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return badRequest('Expected a JSON body') }

  const accountId = body.accountId
  if (!isUuid(accountId)) return badRequest('accountId (UUID) is required')
  if (!(await ownsAccount(g.userId, accountId))) return badRequest('Unknown account')

  // ── CSV import batch ──
  if (Array.isArray(body.imported)) {
    const raw = body.imported as unknown[]
    if (raw.length === 0) return badRequest('imported[] is empty')
    if (raw.length > MAX_IMPORT_ROWS) return badRequest(`imported[] exceeds ${MAX_IMPORT_ROWS} rows`)

    const rows: ImportedRow[] = []
    for (const [i, r] of raw.entries()) {
      const row = r as Record<string, unknown>
      const amount = parseMoney(row.amount)
      const description = cleanText(row.description, 300)
      if (!isIsoDate(row.postedAt) || amount == null || !description) {
        return badRequest(`imported[${i}] is malformed — need postedAt (YYYY-MM-DD), amount, description`)
      }
      rows.push({ postedAt: row.postedAt, amount, description })
    }

    const rules = await loadRules(g.userId)
    let autoCategorized = 0
    const values = rows.map((row) => {
      const match = categorize(rules, { description: row.description, rawDescription: row.description, amount: row.amount, accountId })
      if (match) autoCategorized++
      return {
        userId: g.userId, accountId,
        categoryId: match?.categoryId ?? null,
        amount: row.amount.toFixed(2),
        description: row.description,
        rawDescription: row.description,
        postedAt: row.postedAt,
        source: 'csv_import' as const,
        importHash: importHash(accountId, row),
      }
    })

    const inserted = await db.insert(financeTransactions)
      .values(values)
      .onConflictDoNothing({ target: [financeTransactions.userId, financeTransactions.importHash] })
      .returning({ id: financeTransactions.id })

    return NextResponse.json<TransactionsResponse>({
      ok: true,
      inserted: inserted.length,
      duplicates: rows.length - inserted.length,
      autoCategorized,
      transactions: await loadTransactions(g.userId, { accountId }),
    }, { status: 201 })
  }

  // ── Single manual entry ──
  const amount = parseMoney(body.amount)
  if (amount == null) return badRequest('amount must be a finite number (negative = money out)')
  const description = cleanText(body.description, 300)
  if (!description) return badRequest('description is required (≤300 chars)')
  if (!isIsoDate(body.postedAt)) return badRequest('postedAt must be YYYY-MM-DD')
  let categoryId: string | null = null
  if (body.categoryId != null) {
    if (!isUuid(body.categoryId) || !(await ownsCategory(g.userId, body.categoryId))) return badRequest('Unknown category')
    categoryId = body.categoryId
  } else {
    const match = categorize(await loadRules(g.userId), { description, amount, accountId })
    categoryId = match?.categoryId ?? null
  }
  const note = body.note == null ? null : cleanText(body.note, 500)

  await db.insert(financeTransactions).values({
    userId: g.userId, accountId, categoryId,
    amount: amount.toFixed(2), description, postedAt: body.postedAt,
    source: 'manual', note,
  })
  return NextResponse.json<TransactionsResponse>({
    ok: true,
    transactions: await loadTransactions(g.userId, { accountId }),
  }, { status: 201 })
}
