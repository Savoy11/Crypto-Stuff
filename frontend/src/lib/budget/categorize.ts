// Rule-based transaction categorization (Budget module). Pure logic —
// unit-tested in __tests__/categorize.test.ts. Applied server-side on import
// and on demand; the same function backs both so a preview can never disagree
// with what the import actually does.

export interface RuleLike {
  id: string
  categoryId: string
  matchType: 'contains' | 'starts_with' | 'regex' | 'exact'
  pattern: string
  accountId?: string | null
  minAmount?: number | null
  maxAmount?: number | null
  priority: number
  enabled: boolean
}

export interface TxLike {
  description: string
  rawDescription?: string | null
  amount: number
  accountId?: string
}

function matches(rule: RuleLike, tx: TxLike): boolean {
  if (!rule.enabled) return false
  if (rule.accountId && tx.accountId && rule.accountId !== tx.accountId) return false
  // Amount narrowing compares magnitudes so "$5–$15 subscriptions" reads
  // naturally regardless of sign convention.
  const mag = Math.abs(tx.amount)
  if (rule.minAmount != null && mag < rule.minAmount) return false
  if (rule.maxAmount != null && mag > rule.maxAmount) return false

  // Rules match what the bank actually wrote when available — the cleaned-up
  // description can drift as the user edits it.
  const hay = (tx.rawDescription ?? tx.description).toLowerCase()
  const needle = rule.pattern.toLowerCase()
  switch (rule.matchType) {
    case 'contains':    return hay.includes(needle)
    case 'starts_with': return hay.startsWith(needle)
    case 'exact':       return hay === needle
    case 'regex':
      try { return new RegExp(rule.pattern, 'i').test(hay) } catch { return false }
  }
}

/**
 * First match wins, in ascending priority order (ties broken by insertion
 * order, which is stable in JS sorts). Returns the winning category id, or
 * null — uncategorized is an honest state the UI surfaces, not a default
 * bucket that hides misses.
 */
export function categorize(rules: RuleLike[], tx: TxLike): { categoryId: string; ruleId: string } | null {
  const ordered = [...rules].sort((a, b) => a.priority - b.priority)
  for (const rule of ordered) {
    if (matches(rule, tx)) return { categoryId: rule.categoryId, ruleId: rule.id }
  }
  return null
}

/** Default category set seeded for a new user — names only; ids come from the DB. */
export const DEFAULT_CATEGORIES: Array<{ name: string; kind: 'expense' | 'income' | 'transfer' }> = [
  { name: 'Groceries', kind: 'expense' },
  { name: 'Dining', kind: 'expense' },
  { name: 'Housing', kind: 'expense' },
  { name: 'Utilities', kind: 'expense' },
  { name: 'Transport', kind: 'expense' },
  { name: 'Health', kind: 'expense' },
  { name: 'Shopping', kind: 'expense' },
  { name: 'Subscriptions', kind: 'expense' },
  { name: 'Entertainment', kind: 'expense' },
  { name: 'Travel', kind: 'expense' },
  { name: 'Other', kind: 'expense' },
  { name: 'Salary', kind: 'income' },
  { name: 'Other Income', kind: 'income' },
  { name: 'Transfers', kind: 'transfer' },
]
