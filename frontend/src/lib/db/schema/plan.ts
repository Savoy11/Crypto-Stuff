import { pgTable, text, timestamp, uuid, numeric, date, jsonb, index } from 'drizzle-orm/pg-core'
import { users } from './auth'

// ─── Plan pillar (docs/ROADMAP.md Phase 3) ───────────────────────────────────
// Schema only at this stage — no UI consumes these yet. They live here so the
// Phase 0 migration covers the full multi-tenant table set the roadmap
// specifies, rather than requiring a second foundation migration later.

export const goals = pgTable('goals', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  targetAmount: numeric('target_amount', { precision: 20, scale: 2 }).notNull(),
  targetDate: date('target_date'),
  // Progress is computed from linked accounts/holdings where possible; this is
  // the manual override for goals funded outside the app.
  currentAmount: numeric('current_amount', { precision: 20, scale: 2 }),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdx: index('goals_user_idx').on(t.userId),
}))

// Periodic point-in-time net worth, written by a scheduled job. Snapshotting
// rather than recomputing history is deliberate: past net worth depended on
// past prices, and re-deriving it from today's prices would rewrite history.
export const netWorthSnapshots = pgTable('net_worth_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  capturedAt: date('captured_at').notNull(),
  totalAssets: numeric('total_assets', { precision: 20, scale: 2 }).notNull(),
  totalLiabilities: numeric('total_liabilities', { precision: 20, scale: 2 }).notNull(),
  netWorth: numeric('net_worth', { precision: 20, scale: 2 }).notNull(),
  // Per-source contribution at capture time ({ cash: …, crypto: …, equity: … })
  // so the trend chart can break the line down without re-pricing history.
  breakdown: jsonb('breakdown'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userDateIdx: index('net_worth_user_date_idx').on(t.userId, t.capturedAt),
}))

export type Goal = typeof goals.$inferSelect
export type NetWorthSnapshot = typeof netWorthSnapshots.$inferSelect
