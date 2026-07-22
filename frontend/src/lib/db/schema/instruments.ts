import { pgTable, text, timestamp, uuid, numeric, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './auth'

// ─── Cross-asset instrument core ─────────────────────────────────────────────
// The make-or-break table (docs/ROADMAP.md). A crypto coin, a stock, a bond and
// a house share almost no metrics, so the core holds only what is universally
// true — identity, class, currency, where a price comes from — and per-class
// detail lives in extension tables.
//
// The payoff: holdings, watchlist items, budget links and net-worth snapshots
// all reference instrument_id and never asset-class specifics, so Portfolio,
// Budget and Plan become cross-asset automatically the moment a new analysis
// module lands. Adding commodities later is a new extension table, not a
// migration of every personal-finance table.

// 'commodity'/'currency'/'rate' cover macro instruments (futures, FX pairs,
// yield indices) — text column, so extending this union needs no migration.
export const ASSET_CLASSES = ['crypto', 'equity', 'etf', 'mutual', 'commodity', 'currency', 'rate', 'bond', 'cash', 'manual'] as const
export type AssetClass = (typeof ASSET_CLASSES)[number]

// Which live-data route can price this instrument. 'manual' means the user
// supplies the value (a house, a private holding) and nothing is fetched.
export const PRICE_SOURCES = ['coingecko', 'yahoo', 'fmp', 'stooq', 'catalog', 'manual'] as const
export type PriceSource = (typeof PRICE_SOURCES)[number]

export const instruments = pgTable('instruments', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Null = global catalog row shared by every tenant (BTC, AAPL, VOO).
  // Set    = a user-private manual asset ("my house") that must never leak
  //          across tenants. Enforced by the two partial unique indexes below.
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  symbol: text('symbol').notNull(),
  name: text('name').notNull(),
  assetClass: text('asset_class').$type<AssetClass>().notNull(),
  priceSource: text('price_source').$type<PriceSource>().notNull().default('catalog'),
  currency: text('currency').notNull().default('USD'),
  // Only meaningful when priceSource = 'manual'. Numeric (not float) because
  // this feeds net worth — see the money-precision note in invest.ts.
  manualValue: numeric('manual_value', { precision: 20, scale: 2 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // Global catalog: one row per (class, symbol) across the whole install.
  globalUnique: uniqueIndex('instruments_global_unique')
    .on(t.assetClass, t.symbol)
    .where(sql`user_id IS NULL`),
  // Manual assets: unique per user, so two users can both own "HOUSE".
  userUnique: uniqueIndex('instruments_user_unique')
    .on(t.userId, t.assetClass, t.symbol)
    .where(sql`user_id IS NOT NULL`),
  symbolIdx: index('instruments_symbol_idx').on(t.symbol),
}))

// ─── Per-class extensions ────────────────────────────────────────────────────
// One row per instrument, keyed by instrument_id. Nothing outside the matching
// analysis module should read these.

export const instrumentCrypto = pgTable('instrument_crypto', {
  instrumentId: uuid('instrument_id').primaryKey().references(() => instruments.id, { onDelete: 'cascade' }),
  // CoinGecko id ('bitcoin') — differs from symbol and is what the markets
  // route actually queries by.
  coingeckoId: text('coingecko_id'),
  network: text('network'),
  contractAddress: text('contract_address'),
  // Comma-free JSON array of category tags ('stablecoin', 'l1', ...).
  categories: text('categories').array(),
  pegTarget: numeric('peg_target', { precision: 20, scale: 8 }),
})

export const instrumentEquity = pgTable('instrument_equity', {
  instrumentId: uuid('instrument_id').primaryKey().references(() => instruments.id, { onDelete: 'cascade' }),
  exchange: text('exchange'),
  sector: text('sector'),
  industry: text('industry'),
  // SEC CIK — the join key for the EDGAR filings/XBRL routes.
  cik: text('cik'),
  // ETFs/mutual funds only.
  issuer: text('issuer'),
  expenseRatio: numeric('expense_ratio', { precision: 8, scale: 4 }),
})

export type Instrument = typeof instruments.$inferSelect
export type NewInstrument = typeof instruments.$inferInsert
