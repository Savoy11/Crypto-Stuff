import 'server-only'

import { and, asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { userWallets } from '@/lib/db/schema'

// ─── Wallet persistence helpers (NT3) ────────────────────────────────────────
// Shared by /api/user/wallets and /api/user/wallets/[id]. Route files can only
// export HTTP methods, so validation and queries live here — and, being pure of
// HTTP, they are unit-testable (see __tests__/walletValidation.test.ts).

export const WALLET_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Ceiling on a bulk import so one request cannot write an unbounded batch. */
export const MAX_BULK_WALLETS = 100

/**
 * Chains the app can actually fetch a balance for. Kept as a literal list here
 * rather than imported from the client store: this is a trust boundary, and a
 * server-side allowlist must not be able to widen because a client constant
 * changed. `walletValidation.test.ts` pins the two lists together, so they stay
 * in step deliberately rather than by accident.
 */
export const WALLET_CHAINS = [
  'ethereum', 'polygon', 'arbitrum', 'base', 'optimism', 'bsc', 'avalanche',
  'solana', 'bitcoin', 'xrp', 'tron',
] as const

export const WALLET_KINDS = ['watched', 'connected'] as const
export const WALLET_PROVIDERS = ['metamask', 'phantom', 'coinbase-wallet', 'walletconnect'] as const

export type WalletKind = (typeof WALLET_KINDS)[number]

export interface WireWallet {
  id: string
  kind: WalletKind
  address: string
  chain: string
  label: string
  provider: string | null
  createdAt: string
}

export interface IncomingWallet {
  id?: unknown
  kind?: unknown
  address?: unknown
  chain?: unknown
  label?: unknown
  provider?: unknown
}

export interface ValidatedWallet {
  id?: string
  kind: WalletKind
  address: string
  chain: string
  label: string
  provider: string | null
}

/**
 * Address length bounds, not format checks.
 *
 * Deliberately NOT per-chain regex validation: an over-tight pattern rejects
 * legitimate addresses (new EVM chains, XRP x-addresses, Tron's several
 * encodings) and the cost of a wrong reject — a user unable to watch their own
 * wallet — is worse than storing a string that later returns no balance. The
 * balance routes already handle an address that resolves to nothing.
 */
const MIN_ADDRESS = 20
const MAX_ADDRESS = 128

export function validateWallet(w: IncomingWallet): ValidatedWallet | { error: string } {
  if (w.id !== undefined && (typeof w.id !== 'string' || !WALLET_UUID_RE.test(w.id))) {
    return { error: 'Wallet id must be a UUID' }
  }

  const kind = typeof w.kind === 'string' ? w.kind : ''
  if (!(WALLET_KINDS as readonly string[]).includes(kind)) {
    return { error: `kind must be one of: ${WALLET_KINDS.join(', ')}` }
  }

  const address = typeof w.address === 'string' ? w.address.trim() : ''
  if (address.length < MIN_ADDRESS || address.length > MAX_ADDRESS) {
    return { error: 'address must be a plausible on-chain address' }
  }

  const chain = typeof w.chain === 'string' ? w.chain : ''
  if (!(WALLET_CHAINS as readonly string[]).includes(chain)) {
    return { error: `chain must be one of: ${WALLET_CHAINS.join(', ')}` }
  }

  const provider = typeof w.provider === 'string' ? w.provider : null
  if (provider !== null && !(WALLET_PROVIDERS as readonly string[]).includes(provider)) {
    return { error: `provider must be one of: ${WALLET_PROVIDERS.join(', ')}` }
  }
  // A connected wallet without a provider is meaningless — the provider is how
  // it was connected. A watched address with one is a client bug, so it is
  // dropped rather than stored as a half-truth.
  if (kind === 'connected' && !provider) return { error: 'connected wallets must name their provider' }

  return {
    id: typeof w.id === 'string' ? w.id : undefined,
    kind: kind as WalletKind,
    address,
    chain,
    label: typeof w.label === 'string' ? w.label.trim().slice(0, 120) : '',
    provider: kind === 'connected' ? provider : null,
  }
}

/** Load a user's wallets, oldest first (the order both tabs render in). */
export async function loadWallets(userId: string): Promise<WireWallet[]> {
  const rows = await db.select().from(userWallets)
    .where(eq(userWallets.userId, userId))
    .orderBy(asc(userWallets.createdAt))
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind as WalletKind,
    address: r.address,
    chain: r.chain,
    label: r.label,
    provider: r.provider,
    createdAt: r.createdAt.toISOString(),
  }))
}

/**
 * Insert one wallet, ignoring an exact duplicate.
 *
 * onConflictDoNothing rather than an error: the one-time localStorage import
 * runs against an account that may already hold the same address (imported from
 * a second browser), and re-adding an address you already watch should be a
 * no-op, not a failure. Returns the row id when inserted, null when skipped.
 */
export async function insertWallet(userId: string, v: ValidatedWallet): Promise<string | null> {
  const [row] = await db.insert(userWallets).values({
    ...(v.id ? { id: v.id } : {}),
    userId,
    kind: v.kind,
    address: v.address,
    chain: v.chain,
    label: v.label,
    provider: v.provider,
  }).onConflictDoNothing().returning({ id: userWallets.id })
  return row?.id ?? null
}

/** Rename a watched address. Ownership is in the WHERE, never a check after. */
export async function renameWallet(userId: string, id: string, label: string): Promise<boolean> {
  const [row] = await db.update(userWallets)
    .set({ label: label.trim().slice(0, 120) })
    .where(and(eq(userWallets.id, id), eq(userWallets.userId, userId)))
    .returning({ id: userWallets.id })
  return !!row
}

export async function deleteWallet(userId: string, id: string): Promise<boolean> {
  const [row] = await db.delete(userWallets)
    .where(and(eq(userWallets.id, id), eq(userWallets.userId, userId)))
    .returning({ id: userWallets.id })
  return !!row
}
