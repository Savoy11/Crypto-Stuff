import 'server-only'

import { and, asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { instrumentCrypto, instruments, watchlistItems, watchlists } from '@/lib/db/schema'
import { clientKeyFor, resolveInstruments } from './instrumentResolve'
import { INSTRUMENT_BY_KEY } from '@/lib/data/instruments'

// ─── Watchlist persistence helpers ───────────────────────────────────────────
// Shared by /api/user/watchlists and /api/user/watchlists/[id]. Route files
// can only export HTTP methods, so the real logic lives here.
//
// Wire shape matches what the watchlist page always kept in localStorage:
// { id, name, keys } where keys are instrument keys (CoinGecko id or
// 'sec:SYMBOL'). Items are stored relationally against the instruments
// catalog so the same rows can later serve alerts, notes, and sync — but the
// client never sees instrument UUIDs, only its keys.

export const WATCHLIST_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const MAX_BULK_WATCHLISTS = 20
export const MAX_KEYS = 300

export interface WireWatchlist {
  id: string
  name: string
  keys: string[]
}

/** Load a user's watchlists in the client's wire shape, stable tab order. */
export async function loadWatchlists(userId: string): Promise<WireWatchlist[]> {
  const lists = await db.select().from(watchlists)
    .where(eq(watchlists.userId, userId))
    .orderBy(asc(watchlists.sortOrder), asc(watchlists.createdAt))
  if (lists.length === 0) return []

  const items = await db.select({
    watchlistId: watchlistItems.watchlistId,
    sortOrder: watchlistItems.sortOrder,
    createdAt: watchlistItems.createdAt,
    symbol: instruments.symbol,
    assetClass: instruments.assetClass,
    coingeckoId: instrumentCrypto.coingeckoId,
  }).from(watchlistItems)
    .innerJoin(instruments, eq(watchlistItems.instrumentId, instruments.id))
    .leftJoin(instrumentCrypto, eq(instrumentCrypto.instrumentId, instruments.id))
    .where(eq(watchlistItems.userId, userId))
    .orderBy(asc(watchlistItems.sortOrder), asc(watchlistItems.createdAt))

  const byList = new Map<string, string[]>()
  for (const it of items) {
    const keys = byList.get(it.watchlistId) ?? []
    keys.push(clientKeyFor(it.assetClass, it.symbol, it.coingeckoId))
    byList.set(it.watchlistId, keys)
  }

  return lists.map((l) => ({ id: l.id, name: l.name, keys: byList.get(l.id) ?? [] }))
}

// ─── Validation ──────────────────────────────────────────────────────────────

export interface IncomingWatchlist {
  id?: unknown
  name?: unknown
  keys?: unknown
}

export interface ValidatedWatchlist {
  id?: string
  name: string
  keys: string[]
}

export function validateWatchlist(w: IncomingWatchlist): ValidatedWatchlist | { error: string } {
  const name = typeof w.name === 'string' ? w.name.trim().slice(0, 120) : ''
  if (!name) return { error: 'Every watchlist needs a name' }
  if (w.id !== undefined && (typeof w.id !== 'string' || !WATCHLIST_UUID_RE.test(w.id))) {
    return { error: 'Watchlist id must be a UUID' }
  }
  const raw = Array.isArray(w.keys) ? w.keys.slice(0, MAX_KEYS) : []
  const keys: string[] = []
  for (const k of raw) {
    if (typeof k !== 'string') return { error: `"${name}": instrument keys must be strings` }
    const key = k.trim()
    if (!key || key.length > 64) return { error: `"${name}": invalid instrument key` }
    if (!keys.includes(key)) keys.push(key)
  }
  return { id: typeof w.id === 'string' ? w.id : undefined, name, keys }
}

// ─── Writes ──────────────────────────────────────────────────────────────────

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

async function insertItems(userId: string, watchlistId: string, keys: string[], tx: Tx | typeof db = db) {
  if (keys.length === 0) return
  // The catalog carries symbol/name for every key the UI can add; the key
  // itself is a safe fallback for anything it can't (classify() prefers the
  // catalog entry anyway).
  const keyToId = await resolveInstruments(keys.map((key) => {
    const inst = INSTRUMENT_BY_KEY[key]
    return { key, symbol: inst?.symbol ?? key, name: inst?.name ?? key }
  }))
  await tx.insert(watchlistItems).values(keys.map((key, i) => ({
    userId,
    watchlistId,
    instrumentId: keyToId.get(key)!,
    sortOrder: i,
  })))
}

export async function insertWatchlist(userId: string, v: ValidatedWatchlist, sortOrder = 0): Promise<string> {
  const [row] = await db.insert(watchlists).values({
    ...(v.id ? { id: v.id } : {}),
    userId,
    name: v.name,
    sortOrder,
  }).returning({ id: watchlists.id })
  await insertItems(userId, row.id, v.keys)
  return row.id
}

/**
 * Full-document update: name merges, items replace wholesale. The page edits
 * one list's whole key set at a time, so replace-all is the semantics that
 * cannot drift — no diffing, no orphans.
 */
export async function replaceWatchlist(userId: string, watchlistId: string, v: ValidatedWatchlist): Promise<boolean> {
  // Transactional for the same reason replacePortfolio is: replace-all means
  // DELETE-then-INSERT, and a failing insert would otherwise leave the delete
  // committed and the list empty while the client reports "not saved".
  return db.transaction(async (tx) => {
    // Ownership lives in the WHERE, not a check afterwards — the update must
    // never touch a row that turns out to belong to someone else.
    const [updated] = await tx.update(watchlists)
      .set({ name: v.name })
      .where(and(eq(watchlists.id, watchlistId), eq(watchlists.userId, userId)))
      .returning({ id: watchlists.id })
    if (!updated) return false

    await tx.delete(watchlistItems)
      .where(and(eq(watchlistItems.watchlistId, watchlistId), eq(watchlistItems.userId, userId)))
    await insertItems(userId, watchlistId, v.keys, tx)
    return true
  })
}
