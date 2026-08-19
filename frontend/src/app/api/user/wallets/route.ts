import { NextResponse } from 'next/server'
import { isDbConfigured } from '@/lib/db'
import { getCurrentUserId } from '@/lib/auth/session'
import {
  MAX_BULK_WALLETS, insertWallet, loadWallets, validateWallet,
  type IncomingWallet, type ValidatedWallet, type WireWallet,
} from '@/lib/server/walletPersistence'

// Wallets — DB-backed persistence (NT3). The last user data that lived only in
// browser storage; portfolios, watchlists and builder plans moved in Phase 1.
//   GET  /api/user/wallets  → this user's watched addresses + connected wallets
//   POST /api/user/wallets  → create one, or bulk {wallets: [...]} for the
//        one-time localStorage import.
// Client-supplied UUID ids are accepted so the store can stay optimistic: the
// row it added locally IS the row the server created.
// Lives under /api/user/ — see the rewrite comment in next.config.mjs.

export const dynamic = 'force-dynamic'

export interface WalletsResponse {
  ok: boolean
  wallets?: WireWallet[]
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
  return NextResponse.json<WalletsResponse>({ ok: true, wallets: await loadWallets(userId) })
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

  const incoming: IncomingWallet[] = Array.isArray((body as { wallets?: unknown })?.wallets)
    ? ((body as { wallets: IncomingWallet[] }).wallets).slice(0, MAX_BULK_WALLETS)
    : [body as IncomingWallet]

  // Validate the whole batch before writing any of it: a half-applied import
  // leaves the user reconciling two partial lists by hand.
  const validated: ValidatedWallet[] = []
  for (const w of incoming) {
    const v = validateWallet(w)
    if ('error' in v) return NextResponse.json({ ok: false, error: v.error }, { status: 400 })
    validated.push(v)
  }

  for (const v of validated) await insertWallet(userId, v)

  return NextResponse.json<WalletsResponse>(
    { ok: true, wallets: await loadWallets(userId) },
    { status: 201 },
  )
}
