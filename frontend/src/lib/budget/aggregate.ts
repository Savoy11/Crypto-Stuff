// Money aggregation for the Budget module — pure so the dollar figures the
// user acts on are testable. Transaction amounts are signed: deposits/income
// positive, spending negative.

export type CategoryKind = 'expense' | 'income' | 'transfer'

/** openingBalance + signed transaction sum, rounded to cents (float sums drift). */
export function accountBalance(openingBalance: number, txSum: number): number {
  return Math.round((openingBalance + txSum) * 100) / 100
}

export interface ActualLike {
  categoryId: string | null
  total: number   // signed sum of the period's transactions in this category
}

export interface MonthTotals {
  income: number          // signed sum over income categories
  spend: number           // expense-category sum, sign flipped so spending reads positive
  uncategorized: number   // signed sum of transactions with no category
}

/**
 * Month income/spend/uncategorized from per-category actuals. Kind rules live
 * on the category. Transfers are deliberately excluded from both sides — money
 * moved between own accounts is neither income nor spending. A categoryId the
 * lookup does not know is likewise excluded rather than guessed.
 */
export function monthTotals(
  actuals: ActualLike[],
  kindOf: (categoryId: string) => CategoryKind | undefined
): MonthTotals {
  let income = 0, spend = 0, uncategorized = 0
  for (const a of actuals) {
    if (a.categoryId == null) { uncategorized += a.total; continue }
    const kind = kindOf(a.categoryId)
    if (kind === 'income') income += a.total
    else if (kind === 'expense') spend += a.total
  }
  return { income, spend: -spend, uncategorized }
}

// ─── Budget → Retirement bridge (NT1 extension) ──────────────────────────────

export interface MonthSpend {
  /** 'YYYY-MM'. */
  month: string
  /** Expense-category spend for the month, positive. */
  spend: number
  /** Unclassified spend in the same month, positive. */
  uncategorized: number
}

export interface AverageSpendResult {
  /** Mean monthly spend across the months used, rounded to cents. */
  averageMonthly: number
  /** How many months actually contributed. */
  monthsUsed: number
  /**
   * Share of the averaged spend that sat in no category (0–1).
   *
   * Reported, not hidden: the planner treats this figure as "essential monthly
   * expenses", and a month that is 40% uncategorized is not yet an answer to
   * that question. The UI discloses it rather than the engine silently
   * excluding or including it.
   */
  uncategorizedShare: number
}

/**
 * Average monthly spend from a set of month totals — the planner's expense feed.
 *
 * This is how the owner's source spreadsheet was wired: `Hypotheticals` pulled
 * its bill totals from `Detailed Expense Breakdown` by cell reference, so the
 * tracker is the planner's input rather than a rival to it.
 *
 * Months with zero activity are DROPPED, not averaged in as zeros. A user who
 * imported two months of history would otherwise see their average halved by a
 * third month that simply has no data — the most confidently wrong number this
 * bridge could produce.
 */
export function averageMonthlySpend(months: MonthSpend[]): AverageSpendResult {
  const active = months.filter((m) => m.spend > 0 || m.uncategorized !== 0)
  if (active.length === 0) return { averageMonthly: 0, monthsUsed: 0, uncategorizedShare: 0 }

  const totalSpend = active.reduce((s, m) => s + m.spend, 0)
  // Uncategorized amounts are signed sums; only the outflow side is spending.
  const totalUncat = active.reduce((s, m) => s + Math.max(0, -m.uncategorized), 0)
  const combined = totalSpend + totalUncat

  return {
    averageMonthly: Math.round((combined / active.length) * 100) / 100,
    monthsUsed: active.length,
    uncategorizedShare: combined > 0 ? Math.round((totalUncat / combined) * 1000) / 1000 : 0,
  }
}
