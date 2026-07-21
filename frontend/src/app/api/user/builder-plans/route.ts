import { NextResponse } from 'next/server'
import { desc, eq } from 'drizzle-orm'
import { db, isDbConfigured } from '@/lib/db'
import { builderPlans, type BuilderPlanRow } from '@/lib/db/schema'
import { getCurrentUserId } from '@/lib/auth/session'
import type { BuiltPortfolio } from '@/lib/data/portfolioBuilder'

// Portfolio Builder plans — DB-backed persistence (replaces localStorage).
//   GET  /api/user/builder-plans           → this user's saved plans
//   POST /api/user/builder-plans           → save one plan {name, plan}
//        body may also be {plans: [{name, plan, createdAt?, lastReviewedAt?}]}
//        — the bulk shape exists for the one-time localStorage import, which
//        preserves original timestamps so review reminders don't reset.
//
// Lives under /api/user/ ON PURPOSE: the next.config.mjs rewrite proxies
// un-excluded /api/* paths to the legacy backend, and dynamic segments lose
// to that rewrite. See the comment in next.config.mjs before moving these.

export const dynamic = 'force-dynamic'

/** Wire shape — matches the client's SavedPlan so page logic is unchanged. */
export interface SavedPlanDto {
  id: string
  name: string
  createdAt: string
  lastReviewedAt: string
  linkedPortfolioId: string | null
  plan: BuiltPortfolio
}

export interface BuilderPlansResponse {
  ok: boolean
  plans?: SavedPlanDto[]
  error?: string
}

function toDto(row: BuilderPlanRow): SavedPlanDto {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    lastReviewedAt: row.lastReviewedAt.toISOString(),
    linkedPortfolioId: row.linkedPortfolioId,
    plan: row.plan as BuiltPortfolio,
  }
}

function dbUnavailable() {
  return NextResponse.json(
    { ok: false, error: 'Database is not configured — run `npm run db:status` and set DATABASE_URL in frontend/.env.local.' },
    { status: 503 },
  )
}

export async function GET() {
  if (!isDbConfigured) return dbUnavailable()
  const userId = await getCurrentUserId()
  if (!userId) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

  const rows = await db.select().from(builderPlans)
    .where(eq(builderPlans.userId, userId))
    .orderBy(desc(builderPlans.createdAt))
  return NextResponse.json<BuilderPlansResponse>({ ok: true, plans: rows.map(toDto) })
}

interface IncomingPlan {
  name?: unknown
  plan?: unknown
  createdAt?: unknown
  lastReviewedAt?: unknown
}

/** Minimal structural check — the engine's output is the real authority. */
function isPlanShaped(p: unknown): p is BuiltPortfolio {
  return !!p && typeof p === 'object'
    && Array.isArray((p as BuiltPortfolio).holdings)
    && Array.isArray((p as BuiltPortfolio).classMix)
    && typeof (p as BuiltPortfolio).driftBandPct === 'number'
}

function parseDate(v: unknown): Date | undefined {
  if (typeof v !== 'string') return undefined
  const t = new Date(v)
  return Number.isFinite(t.getTime()) ? t : undefined
}

const MAX_NAME_LENGTH = 120
const MAX_BULK = 50

export async function POST(request: Request) {
  if (!isDbConfigured) return dbUnavailable()
  const userId = await getCurrentUserId()
  if (!userId) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Expected a JSON body' }, { status: 400 })
  }

  const incoming: IncomingPlan[] = Array.isArray((body as { plans?: unknown })?.plans)
    ? ((body as { plans: IncomingPlan[] }).plans).slice(0, MAX_BULK)
    : [body as IncomingPlan]

  const values = []
  for (const item of incoming) {
    const name = typeof item.name === 'string' ? item.name.trim().slice(0, MAX_NAME_LENGTH) : ''
    if (!name) return NextResponse.json({ ok: false, error: 'Every plan needs a name' }, { status: 400 })
    if (!isPlanShaped(item.plan)) return NextResponse.json({ ok: false, error: `"${name}" is not a valid built portfolio` }, { status: 400 })
    values.push({
      userId,
      name,
      plan: item.plan,
      // Bulk import preserves original timestamps; fresh saves default in the DB.
      ...(parseDate(item.createdAt) ? { createdAt: parseDate(item.createdAt) } : {}),
      ...(parseDate(item.lastReviewedAt) ? { lastReviewedAt: parseDate(item.lastReviewedAt) } : {}),
    })
  }

  const rows = await db.insert(builderPlans).values(values).returning()
  return NextResponse.json<BuilderPlansResponse>({ ok: true, plans: rows.map(toDto) }, { status: 201 })
}
