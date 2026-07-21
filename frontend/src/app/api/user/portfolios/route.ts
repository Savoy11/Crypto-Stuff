import { NextResponse } from 'next/server'
import { isDbConfigured } from '@/lib/db'
import { getCurrentUserId } from '@/lib/auth/session'
import {
  MAX_BULK_PORTFOLIOS, insertPortfolio, loadPortfolios, validatePortfolio,
  type IncomingPortfolio, type ValidatedPortfolio,
} from '@/lib/server/portfolioPersistence'
import type { Portfolio } from '@/lib/data/portfolioUtils'

// Portfolios — DB-backed persistence (replaces the localStorage Zustand
// store). Wire shape is the client's existing Portfolio type.
//   GET  /api/user/portfolios  → this user's portfolios with holdings
//   POST /api/user/portfolios  → create {id?, name, description,
//        startingCapital, holdings} or bulk {portfolios: [...]} (the
//        one-time localStorage import; original timestamps preserved).
// Client-supplied UUID ids are accepted so the store can be optimistic:
// the row it inserted locally IS the row the server created.
// Lives under /api/user/ — see the rewrite comment in next.config.mjs.

export const dynamic = 'force-dynamic'

export interface PortfoliosResponse {
  ok: boolean
  portfolios?: Portfolio[]
  error?: string
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
  return NextResponse.json<PortfoliosResponse>({ ok: true, portfolios: await loadPortfolios(userId) })
}

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

  const incoming: IncomingPortfolio[] = Array.isArray((body as { portfolios?: unknown })?.portfolios)
    ? ((body as { portfolios: IncomingPortfolio[] }).portfolios).slice(0, MAX_BULK_PORTFOLIOS)
    : [body as IncomingPortfolio]

  const validated: ValidatedPortfolio[] = []
  for (const p of incoming) {
    const v = validatePortfolio(p)
    if ('error' in v) return NextResponse.json({ ok: false, error: v.error }, { status: 400 })
    validated.push(v)
  }

  for (const v of validated) await insertPortfolio(userId, v)
  return NextResponse.json<PortfoliosResponse>(
    { ok: true, portfolios: await loadPortfolios(userId) },
    { status: 201 },
  )
}
