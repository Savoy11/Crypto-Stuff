import 'server-only'

import { and, asc, desc, eq, gte, lt, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  budgetCategories, budgets, categorizationRules, financeAccounts, financeTransactions,
  type AccountType, type TransactionSource,
} from '@/lib/db/schema'
import { DEFAULT_CATEGORIES, type RuleLike } from '@/lib/budget/categorize'
import { accountBalance } from '@/lib/budget/aggregate'

// Data access for the /api/user/budget/* routes. Lives here, not in the route
// files — route files may only export handlers and types (the C1 lesson), and
// several of these loaders serve more than one route. Numeric columns come
// back from postgres as strings; the wire shape is numbers, converted here so
// no route or client ever parses money.

// ─── Accounts ────────────────────────────────────────────────────────────────

export interface WireAccount {
  id: string
  name: string
  type: AccountType
  institution: string | null
  currency: string
  openingBalance: number
  openingBalanceDate: string | null
  archived: boolean
  /** openingBalance + SUM(transactions) — see the anchor note in the schema. */
  balance: number
  transactionCount: number
}

export async function loadAccounts(userId: string): Promise<WireAccount[]> {
  const rows = await db
    .select({
      id: financeAccounts.id,
      name: financeAccounts.name,
      type: financeAccounts.type,
      institution: financeAccounts.institution,
      currency: financeAccounts.currency,
      openingBalance: financeAccounts.openingBalance,
      openingBalanceDate: financeAccounts.openingBalanceDate,
      archived: financeAccounts.archived,
      txSum: sql<string>`coalesce(sum(${financeTransactions.amount}), 0)`,
      txCount: sql<number>`count(${financeTransactions.id})::int`,
    })
    .from(financeAccounts)
    .leftJoin(financeTransactions, eq(financeTransactions.accountId, financeAccounts.id))
    .where(eq(financeAccounts.userId, userId))
    .groupBy(financeAccounts.id)
    .orderBy(asc(financeAccounts.createdAt))
  return rows.map((r) => ({
    id: r.id, name: r.name, type: r.type, institution: r.institution,
    currency: r.currency,
    openingBalance: parseFloat(r.openingBalance),
    openingBalanceDate: r.openingBalanceDate,
    archived: r.archived,
    balance: accountBalance(parseFloat(r.openingBalance), parseFloat(r.txSum)),
    transactionCount: r.txCount,
  }))
}

// ─── Categories ──────────────────────────────────────────────────────────────

export interface WireCategory {
  id: string
  name: string
  parentId: string | null
  kind: 'expense' | 'income' | 'transfer'
  color: string | null
  sortOrder: number
}

/**
 * Load categories, seeding the default set on first use so the categorize/
 * budget UIs are never empty. Seeding is idempotent under the (userId, name)
 * unique index — a concurrent first request just no-ops on conflict.
 */
export async function loadCategoriesSeeded(userId: string): Promise<WireCategory[]> {
  const existing = await loadCategories(userId)
  if (existing.length > 0) return existing
  await db.insert(budgetCategories)
    .values(DEFAULT_CATEGORIES.map((c, i) => ({ userId, name: c.name, kind: c.kind, sortOrder: i })))
    .onConflictDoNothing()
  return loadCategories(userId)
}

async function loadCategories(userId: string): Promise<WireCategory[]> {
  const rows = await db
    .select()
    .from(budgetCategories)
    .where(eq(budgetCategories.userId, userId))
    .orderBy(asc(budgetCategories.sortOrder), asc(budgetCategories.name))
  return rows.map((r) => ({
    id: r.id, name: r.name, parentId: r.parentId, kind: r.kind, color: r.color, sortOrder: r.sortOrder,
  }))
}

// ─── Rules ───────────────────────────────────────────────────────────────────

export async function loadRules(userId: string): Promise<RuleLike[]> {
  const rows = await db
    .select()
    .from(categorizationRules)
    .where(eq(categorizationRules.userId, userId))
    .orderBy(asc(categorizationRules.priority), asc(categorizationRules.createdAt))
  return rows.map((r) => ({
    id: r.id, categoryId: r.categoryId, matchType: r.matchType, pattern: r.pattern,
    accountId: r.accountId, priority: r.priority, enabled: r.enabled,
    minAmount: r.minAmount == null ? null : parseFloat(r.minAmount),
    maxAmount: r.maxAmount == null ? null : parseFloat(r.maxAmount),
  }))
}

// ─── Transactions ────────────────────────────────────────────────────────────

export interface WireTransaction {
  id: string
  accountId: string
  categoryId: string | null
  amount: number
  description: string
  rawDescription: string | null
  postedAt: string
  source: TransactionSource
  pending: boolean
  note: string | null
}

export async function loadTransactions(
  userId: string,
  opts: { from?: string; to?: string; accountId?: string; limit?: number },
): Promise<WireTransaction[]> {
  const conds = [eq(financeTransactions.userId, userId)]
  if (opts.from) conds.push(gte(financeTransactions.postedAt, opts.from))
  if (opts.to) conds.push(lt(financeTransactions.postedAt, opts.to))
  if (opts.accountId) conds.push(eq(financeTransactions.accountId, opts.accountId))
  const rows = await db
    .select()
    .from(financeTransactions)
    .where(and(...conds))
    .orderBy(desc(financeTransactions.postedAt), desc(financeTransactions.createdAt))
    .limit(Math.min(opts.limit ?? 500, 2000))
  return rows.map((r) => ({
    id: r.id, accountId: r.accountId, categoryId: r.categoryId,
    amount: parseFloat(r.amount), description: r.description,
    rawDescription: r.rawDescription, postedAt: r.postedAt,
    source: r.source, pending: r.pending, note: r.note,
  }))
}

/** User owns this account? (IDOR guard for account-scoped writes.) */
export async function ownsAccount(userId: string, accountId: string): Promise<boolean> {
  const [row] = await db.select({ id: financeAccounts.id }).from(financeAccounts)
    .where(and(eq(financeAccounts.id, accountId), eq(financeAccounts.userId, userId))).limit(1)
  return !!row
}

export async function ownsCategory(userId: string, categoryId: string): Promise<boolean> {
  const [row] = await db.select({ id: budgetCategories.id }).from(budgetCategories)
    .where(and(eq(budgetCategories.id, categoryId), eq(budgetCategories.userId, userId))).limit(1)
  return !!row
}

// ─── Budgets (monthly targets) ───────────────────────────────────────────────

export interface WireBudget {
  categoryId: string
  periodStart: string
  amount: number
}

export async function loadBudgets(userId: string, periodStart: string): Promise<WireBudget[]> {
  const rows = await db
    .select()
    .from(budgets)
    .where(and(eq(budgets.userId, userId), eq(budgets.periodStart, periodStart)))
  return rows.map((r) => ({ categoryId: r.categoryId, periodStart: r.periodStart, amount: parseFloat(r.amount) }))
}

/** Per-category signed sum of the month's transactions. */
export async function monthActuals(userId: string, from: string, to: string): Promise<Array<{ categoryId: string | null; total: number; count: number }>> {
  const rows = await db
    .select({
      categoryId: financeTransactions.categoryId,
      total: sql<string>`coalesce(sum(${financeTransactions.amount}), 0)`,
      count: sql<number>`count(*)::int`,
    })
    .from(financeTransactions)
    .where(and(
      eq(financeTransactions.userId, userId),
      gte(financeTransactions.postedAt, from),
      lt(financeTransactions.postedAt, to),
    ))
    .groupBy(financeTransactions.categoryId)
  return rows.map((r) => ({ categoryId: r.categoryId, total: parseFloat(r.total), count: r.count }))
}
