import { pgTable, text, timestamp, uuid, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { users } from './auth'

// ─── Wallets (NT3) ───────────────────────────────────────────────────────────
//
// The last user data living only in browser storage (`fn:wallets`). Portfolios,
// watchlists and builder plans all moved to Postgres in Phase 1; this closes the
// set, so clearing site data no longer silently discards a user's records.
//
// ONE table, not two, even though the UI shows watched addresses and connected
// browser wallets on separate tabs: both are "an address this user cares about,
// on a chain", and the only real difference is how it arrived. A `kind`
// discriminator keeps that distinction without duplicating five columns.
//
// What is deliberately NOT here: exchange API credentials. That feature was
// removed on 2026-08-18 on security grounds (rejected-proposals RP-5) — no
// column, no table, nothing to migrate. Do not add one back without reversing
// that decision.

export const userWallets = pgTable('user_wallets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /**
   * 'watched'   — an address the user typed in to follow (read-only, any chain).
   * 'connected' — an address handed over by a browser wallet (MetaMask, Phantom…).
   */
  kind: text('kind').notNull(),
  /**
   * The address as the user's chain formats it. Stored verbatim rather than
   * lower-cased: Solana and Tron addresses are case-SIGNIFICANT (base58), and
   * only EVM hex is safely case-insensitive. Normalising everything would
   * corrupt two of the five supported chains.
   */
  address: text('address').notNull(),
  chain: text('chain').notNull(),
  /** User's own name for a watched address. Empty for connected wallets. */
  label: text('label').notNull().default(''),
  /** Browser wallet that supplied a connected address; null for watched ones. */
  provider: text('provider'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdx: index('user_wallets_user_idx').on(t.userId),
  // The same address on the same chain is one entry per user per kind. A user
  // may legitimately both watch an address AND connect it (the wallet tab shows
  // live connection state), so `kind` is part of the key rather than a conflict.
  addressUnique: uniqueIndex('user_wallets_unique').on(t.userId, t.kind, t.chain, t.address),
}))

export type UserWalletRow = typeof userWallets.$inferSelect
