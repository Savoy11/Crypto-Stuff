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
