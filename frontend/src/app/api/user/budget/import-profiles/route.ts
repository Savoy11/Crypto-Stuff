import { NextResponse } from 'next/server'
import { asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { importProfiles } from '@/lib/db/schema'
import { badRequest, budgetGuard, cleanText } from '@/lib/server/budgetApi'
import { DATE_FORMATS, type CsvMapping } from '@/lib/budget/csv'

// Saved CSV column mappings ("import profiles") — the second import from the
// same bank auto-selects its profile by header signature.
//   GET  /api/user/budget/import-profiles
//   POST /api/user/budget/import-profiles → { name, mapping, headerSignature? }
//        Upserts by (user, name) so re-saving a bank's profile updates it.

export const dynamic = 'force-dynamic'

export interface WireImportProfile {
  id: string
  name: string
  mapping: CsvMapping
  headerSignature: string | null
}

export interface ImportProfilesResponse {
  ok: boolean
  profiles?: WireImportProfile[]
  error?: string
}

async function loadProfiles(userId: string): Promise<WireImportProfile[]> {
  const rows = await db.select().from(importProfiles)
    .where(eq(importProfiles.userId, userId))
    .orderBy(asc(importProfiles.name))
  return rows.map((r) => ({
    id: r.id, name: r.name, mapping: r.mapping as CsvMapping, headerSignature: r.headerSignature,
  }))
}

function validMapping(m: unknown): m is CsvMapping {
  if (typeof m !== 'object' || m === null) return false
  const map = m as Record<string, unknown>
  if (typeof map.date !== 'string' || typeof map.description !== 'string') return false
  if (!DATE_FORMATS.includes(map.dateFormat as (typeof DATE_FORMATS)[number])) return false
  if (map.amountConvention === 'debit_credit') return typeof map.debit === 'string' && typeof map.credit === 'string'
  if (map.amountConvention === 'signed' || map.amountConvention === 'inverted') return typeof map.amount === 'string'
  return false
}

export async function GET() {
  const g = await budgetGuard()
  if ('response' in g) return g.response
  return NextResponse.json<ImportProfilesResponse>({ ok: true, profiles: await loadProfiles(g.userId) })
}

export async function POST(request: Request) {
  const g = await budgetGuard()
  if ('response' in g) return g.response

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return badRequest('Expected a JSON body') }

  const name = cleanText(body.name, 80)
  if (!name) return badRequest('name is required (≤80 chars)')
  if (!validMapping(body.mapping)) return badRequest('mapping is malformed — need date, description, dateFormat, and amount columns per convention')
  const headerSignature = body.headerSignature == null ? null : cleanText(body.headerSignature, 2000)

  await db.insert(importProfiles)
    .values({ userId: g.userId, name, mapping: body.mapping, headerSignature })
    .onConflictDoUpdate({
      target: [importProfiles.userId, importProfiles.name],
      set: { mapping: body.mapping, headerSignature },
    })
  return NextResponse.json<ImportProfilesResponse>({ ok: true, profiles: await loadProfiles(g.userId) }, { status: 201 })
}
