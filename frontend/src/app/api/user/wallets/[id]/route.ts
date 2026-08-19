import { NextResponse } from 'next/server'
import { isDbConfigured } from '@/lib/db'
import { getCurrentUserId } from '@/lib/auth/session'
import { WALLET_UUID_RE, deleteWallet, loadWallets, renameWallet } from '@/lib/server/walletPersistence'

// Single-wallet operations (NT3).
//   PATCH  /api/user/wallets/[id]  → rename a watched address (label only —
//          an address and its chain are identity, not editable fields)
//   DELETE /api/user/wallets/[id]  → stop watching / forget a connection
//
// DYNAMIC route — reachable only because /api/user/ is excluded from the
// legacy-backend rewrite (next.config.mjs). Ownership is enforced in the WHERE
// of every statement: another user's id behaves exactly like a missing one.

export const dynamic = 'force-dynamic'

function dbUnavailable() {
  return NextResponse.json(
    { ok: false, error: 'Database is not configured — run `npm run db:status` and set DATABASE_URL in frontend/.env.local.' },
    { status: 503 },
  )
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isDbConfigured) return dbUnavailable()
  const userId = await getCurrentUserId()
  if (!userId) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })
  if (!WALLET_UUID_RE.test(id)) return NextResponse.json({ ok: false, error: 'Invalid wallet id' }, { status: 400 })

  let body: { label?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Expected a JSON body' }, { status: 400 })
  }
  if (typeof body.label !== 'string') {
    return NextResponse.json({ ok: false, error: 'label must be a string' }, { status: 400 })
  }

  const ok = await renameWallet(userId, id, body.label)
  if (!ok) return NextResponse.json({ ok: false, error: 'Wallet not found' }, { status: 404 })
  return NextResponse.json({ ok: true, wallets: await loadWallets(userId) })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isDbConfigured) return dbUnavailable()
  const userId = await getCurrentUserId()
  if (!userId) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })
  if (!WALLET_UUID_RE.test(id)) return NextResponse.json({ ok: false, error: 'Invalid wallet id' }, { status: 400 })

  const ok = await deleteWallet(userId, id)
  if (!ok) return NextResponse.json({ ok: false, error: 'Wallet not found' }, { status: 404 })
  return NextResponse.json({ ok: true, wallets: await loadWallets(userId) })
}
