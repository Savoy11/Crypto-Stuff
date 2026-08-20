// ⚠ RETAINED FOR DATA ONLY — the Budget module was REMOVED from the app on
// 2026-08-20 (owner decision: "remove the budget and retirement tools … the
// other two need to be explored somewhere else").
//
// Nothing in the application imports these tables any more: the pages, the
// /api/user/budget/* routes, lib/budget/ and the server helpers are all gone.
// The DEFINITIONS stay for two deliberate reasons:
//
//  1. **Your data is still in them.** These tables hold imported bank history
//     that took real effort to get in, and the replacement tool may want it.
//     Deleting the definitions would make drizzle-kit generate a DROP migration
//     — and the next routine `npm run db:migrate` would then destroy that data
//     silently, which is not a thing a migration should ever do by accident.
//  2. Keeping them means the migration journal stays consistent with the
//     database as it actually is.
//
// To export before dropping:
//   pg_dump "$DATABASE_URL" -t finance_accounts -t finance_transactions \
//     -t budget_categories -t budgets -t categorization_rules \
//     -t import_profiles -t recurring_rules > budget-export.sql
//
// To drop them once the data is somewhere else, run that SQL by hand, then
// delete this file and generate the migration deliberately.

import { pgTable, text, timestamp, uuid, numeric, integer, boolean, date, jsonb, uniqueIndex, index, type AnyPgColumn } from 'drizzle-orm/pg-core'
import { users } from './auth'

// ─── Budget pillar (docs/ROADMAP.md Phase 2) ─────────────────────────────────
// Manual entry + CSV import first; bank sync (Plaid/Teller) deferred until
// revenue justifies it. The schema doesn't presume either: an imported row and
// a hand-typed row are the same row, distinguished only by `source`.

export const ACCOUNT_TYPES = ['checking', 'savings', 'credit_card', 'cash', 'loan', 'investment'] as const
export type AccountType = (typeof ACCOUNT_TYPES)[number]

export const financeAccounts = pgTable('finance_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: text('type').$type<AccountType>().notNull(),
  institution: text('institution'),
  currency: text('currency').notNull().default('USD'),
  // Balance as of account creation / last reconcile. Current balance =
  // this + sum(transactions since). Storing an anchor rather than a live
  // balance means an imported backlog can't silently double-count.
  openingBalance: numeric('opening_balance', { precision: 20, scale: 2 }).notNull().default('0'),
  openingBalanceDate: date('opening_balance_date'),
  archived: boolean('archived').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdx: index('finance_accounts_user_idx').on(t.userId),
}))

export const budgetCategories = pgTable('budget_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  // Self-reference for a two-level tree (Food > Groceries). Depth isn't
  // enforced in the DB — the UI flattens anything deeper — but the FK is, so a
  // deleted parent can't strand its children pointing at a missing row.
  // Deleting a parent promotes its children to top level rather than taking
  // their transactions down with them.
  // The AnyPgColumn return annotation is what lets a table reference itself
  // without TypeScript hitting a circular inference error.
  parentId: uuid('parent_id').references((): AnyPgColumn => budgetCategories.id, { onDelete: 'set null' }),
  // 'income' categories are excluded from spend totals rather than counted as
  // negative spend, which keeps budget-vs-actual arithmetic readable.
  kind: text('kind').$type<'expense' | 'income' | 'transfer'>().notNull().default('expense'),
  color: text('color'),
  icon: text('icon'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  nameUnique: uniqueIndex('budget_categories_name_unique').on(t.userId, t.name),
  userIdx: index('budget_categories_user_idx').on(t.userId),
}))

export const TRANSACTION_SOURCES = ['manual', 'csv_import', 'recurring'] as const
export type TransactionSource = (typeof TRANSACTION_SOURCES)[number]

export const financeTransactions = pgTable('finance_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  accountId: uuid('account_id').notNull().references(() => financeAccounts.id, { onDelete: 'cascade' }),
  categoryId: uuid('category_id').references(() => budgetCategories.id, { onDelete: 'set null' }),
  // Signed: negative = money out, positive = money in. One signed column beats
  // a type enum + unsigned amount because every sum is then just SUM(amount).
  amount: numeric('amount', { precision: 20, scale: 2 }).notNull(),
  description: text('description').notNull(),
  // What the bank actually wrote, kept verbatim. `description` may be cleaned
  // up by rules or the user; this is what categorization rules match against
  // and what makes a re-import idempotent.
  rawDescription: text('raw_description'),
  postedAt: date('posted_at').notNull(),
  source: text('source').$type<TransactionSource>().notNull().default('manual'),
  // Stable hash of (account, date, amount, raw description) for imported rows.
  // The unique index on it is what makes re-importing an overlapping CSV a
  // no-op instead of a duplicate. Null for manual entries, which are allowed
  // to legitimately repeat (two $4 coffees on the same day).
  importHash: text('import_hash'),
  pending: boolean('pending').notNull().default(false),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  importUnique: uniqueIndex('finance_tx_import_unique').on(t.userId, t.importHash),
  // Every budget-vs-actual query is "this user, this month" — index accordingly.
  userDateIdx: index('finance_tx_user_date_idx').on(t.userId, t.postedAt),
  accountIdx: index('finance_tx_account_idx').on(t.accountId),
}))

// Monthly budget target per category. `periodStart` is always the 1st of the
// month; a missing row means "no budget set", which the UI shows differently
// from a budget of 0.
export const budgets = pgTable('budgets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  categoryId: uuid('category_id').notNull().references(() => budgetCategories.id, { onDelete: 'cascade' }),
  periodStart: date('period_start').notNull(),
  amount: numeric('amount', { precision: 20, scale: 2 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  periodUnique: uniqueIndex('budgets_period_unique').on(t.userId, t.categoryId, t.periodStart),
}))

// Rule-based auto-categorization. Applied in `priority` order on import and on
// demand; first match wins.
export const categorizationRules = pgTable('categorization_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  categoryId: uuid('category_id').notNull().references(() => budgetCategories.id, { onDelete: 'cascade' }),
  matchType: text('match_type').$type<'contains' | 'starts_with' | 'regex' | 'exact'>().notNull().default('contains'),
  pattern: text('pattern').notNull(),
  // Optional narrowing: only apply to this account, or only to amounts in a
  // range (separates "AMZN" the $9 subscription from "AMZN" the $400 order).
  accountId: uuid('account_id').references(() => financeAccounts.id, { onDelete: 'cascade' }),
  minAmount: numeric('min_amount', { precision: 20, scale: 2 }),
  maxAmount: numeric('max_amount', { precision: 20, scale: 2 }),
  priority: integer('priority').notNull().default(100),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdx: index('categorization_rules_user_idx').on(t.userId),
}))

// Saved CSV column mapping per bank, so the second import from the same bank
// needs no mapping UI at all.
export const importProfiles = pgTable('import_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  // { date: 'Posted Date', amount: 'Amount', description: 'Payee',
  //   dateFormat: 'MM/DD/YYYY', amountSign: 'negative_is_debit', ... }
  mapping: jsonb('mapping').notNull(),
  // Fingerprint of the CSV header row — lets an upload auto-select its profile.
  headerSignature: text('header_signature'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  nameUnique: uniqueIndex('import_profiles_name_unique').on(t.userId, t.name),
}))

// Detected or user-declared recurring transactions. Feeds both the Budget
// module's "expected this month" and the Plan module's cash-flow forecast.
export const recurringRules = pgTable('recurring_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  accountId: uuid('account_id').references(() => financeAccounts.id, { onDelete: 'cascade' }),
  categoryId: uuid('category_id').references(() => budgetCategories.id, { onDelete: 'set null' }),
  description: text('description').notNull(),
  amount: numeric('amount', { precision: 20, scale: 2 }).notNull(),
  cadence: text('cadence').$type<'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly'>().notNull(),
  nextDueAt: date('next_due_at'),
  // False when the app inferred this from transaction history and the user
  // hasn't confirmed it — inferred rules are shown as suggestions, not facts.
  confirmed: boolean('confirmed').notNull().default(false),
  active: boolean('active').notNull().default(true),
  /**
   * The user saw this suggestion and said no.
   *
   * Added by NT1 (2026-08-19) to close the review's Budget note 7: detection
   * runs fresh on every load, so a suggestion the user did not want came back
   * forever and the only way to silence it was to confirm it, then deactivate
   * it by curl. A dismissal is a real answer and needs somewhere to live.
   *
   * Dismissed rows stay in the table — they are what suppresses the suggestion
   * (matched by merchant key) — but they are never returned as confirmed
   * recurring items.
   */
  dismissed: boolean('dismissed').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdx: index('recurring_rules_user_idx').on(t.userId),
}))

export type FinanceAccount = typeof financeAccounts.$inferSelect
export type FinanceTransaction = typeof financeTransactions.$inferSelect
export type BudgetCategory = typeof budgetCategories.$inferSelect
export type Budget = typeof budgets.$inferSelect
export type CategorizationRule = typeof categorizationRules.$inferSelect
export type ImportProfile = typeof importProfiles.$inferSelect
export type RecurringRule = typeof recurringRules.$inferSelect
