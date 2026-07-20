import { pgTable, text, timestamp, uuid, numeric, integer, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { users } from './auth'
import { instruments } from './instruments'

// ─── Invest pillar: portfolios, holdings, trades, watchlists ─────────────────
//
// Money precision: every quantity and price is `numeric`, never a float or a
// JS number column. Drizzle returns numeric as a *string*, which is
// deliberate — it means no value silently loses precision on the way through
// JS, and callers must opt into a rounding decision. Quantities carry 18
// decimals because that is what an ERC-20 wei-denominated balance needs; fiat
// amounts carry 2.

export const portfolios = pgTable('portfolios', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  // Hypothetical capital for allocation-model portfolios (the existing
  // /portfolios and /portfolio-builder behaviour). Null for portfolios that
  // are a real ledger of trades, where value comes from holdings instead.
  startingCapital: numeric('starting_capital', { precision: 20, scale: 2 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdx: index('portfolios_user_idx').on(t.userId),
}))

export const holdings = pgTable('holdings', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Denormalised from portfolios.user_id. Redundant, but it lets every
  // tenant-scoped query filter on user_id without a join — the one place
  // where forgetting a join would leak another tenant's rows.
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  portfolioId: uuid('portfolio_id').notNull().references(() => portfolios.id, { onDelete: 'cascade' }),
  instrumentId: uuid('instrument_id').notNull().references(() => instruments.id, { onDelete: 'restrict' }),
  // Real position size. Null on allocation-model portfolios that only express
  // target weights.
  quantity: numeric('quantity', { precision: 38, scale: 18 }),
  // Target weight 0–100 for allocation-model portfolios; null on real ledgers.
  targetAllocPct: numeric('target_alloc_pct', { precision: 7, scale: 4 }),
  // Average cost per unit. Maintained by the trade ledger when trades exist,
  // or entered directly when the user just states a cost basis.
  avgCostBasis: numeric('avg_cost_basis', { precision: 20, scale: 8 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // One position per instrument per portfolio; adding to a position updates
  // the row rather than creating a second one.
  positionUnique: uniqueIndex('holdings_position_unique').on(t.portfolioId, t.instrumentId),
  userIdx: index('holdings_user_idx').on(t.userId),
}))

export const TRADE_SIDES = ['buy', 'sell', 'transfer_in', 'transfer_out'] as const
export type TradeSide = (typeof TRADE_SIDES)[number]

// The append-only ledger cost basis and realized P&L derive from. Nothing here
// is ever mutated in place — a correction is a new offsetting row, so the
// history stays auditable.
export const tradeTransactions = pgTable('trade_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  portfolioId: uuid('portfolio_id').notNull().references(() => portfolios.id, { onDelete: 'cascade' }),
  instrumentId: uuid('instrument_id').notNull().references(() => instruments.id, { onDelete: 'restrict' }),
  side: text('side').$type<TradeSide>().notNull(),
  quantity: numeric('quantity', { precision: 38, scale: 18 }).notNull(),
  pricePerUnit: numeric('price_per_unit', { precision: 20, scale: 8 }).notNull(),
  feeUsd: numeric('fee_usd', { precision: 20, scale: 2 }).notNull().default('0'),
  executedAt: timestamp('executed_at', { withTimezone: true }).notNull(),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdx: index('trade_tx_user_idx').on(t.userId),
  // Cost-basis recomputation always walks one portfolio's trades in time
  // order — this index is what keeps that a range scan.
  ledgerIdx: index('trade_tx_ledger_idx').on(t.portfolioId, t.instrumentId, t.executedAt),
}))

export const watchlists = pgTable('watchlists', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdx: index('watchlists_user_idx').on(t.userId),
}))

export const watchlistItems = pgTable('watchlist_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  watchlistId: uuid('watchlist_id').notNull().references(() => watchlists.id, { onDelete: 'cascade' }),
  instrumentId: uuid('instrument_id').notNull().references(() => instruments.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').notNull().default(0),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  itemUnique: uniqueIndex('watchlist_items_unique').on(t.watchlistId, t.instrumentId),
  userIdx: index('watchlist_items_user_idx').on(t.userId),
}))

export type Portfolio = typeof portfolios.$inferSelect
export type Holding = typeof holdings.$inferSelect
export type TradeTransaction = typeof tradeTransactions.$inferSelect
export type Watchlist = typeof watchlists.$inferSelect
export type WatchlistItem = typeof watchlistItems.$inferSelect
