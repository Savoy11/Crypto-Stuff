import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { importProfiles } from '@/lib/db/schema'
import { badRequest, budgetGuard, cleanText, isUuid } from '@/lib/server/budgetApi'

// Single import-profile operations.
//   PATCH  /api/user/budget/import-profiles/[id] — rename
//   DELETE /api/user/budget/import-profiles/[id]
//
// Added by NT1 (2026-08-19). This was the one budget table without full CRUD
// (review Budget note 3): a mis-saved column mapping for a bank was permanent
// until someone fixed it in SQL, and re-importing that bank re-applied the
// wrong mapping every time.
//
// Ownership is in the WHERE of both statements, so another user's id behaves
// exactly like a missing one.

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: Params) {
  const g = await budgetGuard()
  if ('response' in g) return g.response
  const { id } = await params
  if (!isUuid(id)) return badRequest('Invalid profile id')

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return badRequest('Expected a JSON body') }

  const name = cleanText(body.name, 120)
  if (!name) return badRequest('name is required (≤120 chars)')

  const [row] = await db.update(importProfiles)
    .set({ name })
    .where(and(eq(importProfiles.id, id), eq(importProfiles.userId, g.userId)))
    .returning({ id: importProfiles.id })
  if (!row) return NextResponse.json({ ok: false, error: 'Profile not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_request: Request, { params }: Params) {
  const g = await budgetGuard()
  if ('response' in g) return g.response
  const { id } = await params
  if (!isUuid(id)) return badRequest('Invalid profile id')

  // Deleting a mapping deletes NO transactions: profiles only describe how a
  // CSV's columns map, and imported rows are independent of the profile that
  // helped read them.
  const [row] = await db.delete(importProfiles)
    .where(and(eq(importProfiles.id, id), eq(importProfiles.userId, g.userId)))
    .returning({ id: importProfiles.id })
  if (!row) return NextResponse.json({ ok: false, error: 'Profile not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
