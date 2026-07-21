import { pgTable, text, timestamp, uuid, jsonb, index } from 'drizzle-orm/pg-core'
import { users } from './auth'
import { portfolios } from './invest'

// ─── Portfolio Builder plans ─────────────────────────────────────────────────
//
// A saved plan is a *snapshot of engine output*: buildPortfolio()'s
// BuiltPortfolio — holdings with rationale strings, class mix, fee summary,
// suitability notes, and the inputs that produced them. It is written once,
// read whole, never queried by its parts, and its shape evolves with the
// engine. That makes it a document, not a relation — so it lives in one jsonb
// column instead of being shredded across rows that would need a migration
// every time the engine grows a field. Drift/suitability checks all run
// client-side against this snapshot (see lib/data/portfolioBuilder.ts).

export const builderPlans = pgTable('builder_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  /** The full BuiltPortfolio the engine produced, verbatim. */
  plan: jsonb('plan').notNull(),
  /**
   * Which real portfolio the monitor compares this plan against. Optional —
   * drift can also run on hand-entered weights. SET NULL on portfolio delete:
   * losing the comparison target should not delete the plan.
   */
  linkedPortfolioId: uuid('linked_portfolio_id').references(() => portfolios.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastReviewedAt: timestamp('last_reviewed_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdx: index('builder_plans_user_idx').on(t.userId),
}))

export type BuilderPlanRow = typeof builderPlans.$inferSelect
