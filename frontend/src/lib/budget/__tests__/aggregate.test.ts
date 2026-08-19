import { describe, expect, it } from 'vitest'
import { accountBalance, monthTotals, type CategoryKind, averageMonthlySpend } from '../aggregate'

describe('accountBalance', () => {
  it('balance is the opening anchor plus the signed transaction sum', () => {
    expect(accountBalance(1000, -250.5)).toBe(749.5)
    expect(accountBalance(0, 42)).toBe(42)
  })

  it('rounds to cents so float drift never reaches the wire', () => {
    expect(accountBalance(0.1, 0.2)).toBe(0.3)
    expect(accountBalance(100, -0.030000000000000002)).toBe(99.97)
  })

  it('a spent-down account can go negative — overdrafts are shown, not clamped', () => {
    expect(accountBalance(50, -75.25)).toBe(-25.25)
  })

  it('an account with no transactions is just its opening balance', () => {
    expect(accountBalance(1234.56, 0)).toBe(1234.56)
  })
})

describe('monthTotals', () => {
  const kinds: Record<string, CategoryKind> = {
    salary: 'income', groceries: 'expense', rent: 'expense', savings: 'transfer',
  }
  const kindOf = (id: string) => kinds[id]

  it('income sums income categories; spend reads positive from negative expense sums', () => {
    const t = monthTotals([
      { categoryId: 'salary', total: 5000 },
      { categoryId: 'groceries', total: -600 },
      { categoryId: 'rent', total: -1500 },
    ], kindOf)
    expect(t.income).toBe(5000)
    expect(t.spend).toBe(2100)
    expect(t.uncategorized).toBe(0)
  })

  it('a refund in an expense category reduces spending rather than counting as income', () => {
    const t = monthTotals([
      { categoryId: 'groceries', total: -600 },
      { categoryId: 'groceries', total: 50 },
    ], kindOf)
    expect(t.income).toBe(0)
    expect(t.spend).toBe(550)
  })

  it('transfers between own accounts appear on neither side', () => {
    const t = monthTotals([
      { categoryId: 'savings', total: -2000 },
      { categoryId: 'salary', total: 3000 },
    ], kindOf)
    expect(t.income).toBe(3000)
    expect(t.spend === 0).toBe(true)
  })

  it('uncategorized keeps its signed total and is excluded from income/spend', () => {
    const t = monthTotals([
      { categoryId: null, total: -321.45 },
      { categoryId: 'salary', total: 1000 },
    ], kindOf)
    expect(t.uncategorized).toBe(-321.45)
    expect(t.income).toBe(1000)
    expect(t.spend === 0).toBe(true)
  })

  it('a categoryId the lookup does not know is excluded, not guessed', () => {
    const t = monthTotals([{ categoryId: 'deleted-cat', total: -99 }], kindOf)
    expect(t.income).toBe(0)
    expect(t.spend === 0).toBe(true)
    expect(t.uncategorized).toBe(0)
  })

  it('an empty month is all zeros', () => {
    const t = monthTotals([], kindOf)
    expect(t.income).toBe(0)
    expect(t.spend === 0).toBe(true)
    expect(t.uncategorized).toBe(0)
  })
})

// ─── averageMonthlySpend (NT1 extension: Budget → Retirement) ────────────────

describe('averageMonthlySpend', () => {
  const m = (month: string, spend: number, uncategorized = 0) => ({ month, spend, uncategorized })

  it('averages the months that have activity', () => {
    const r = averageMonthlySpend([m('2026-05', 3000), m('2026-06', 3400), m('2026-07', 3200)])
    expect(r.averageMonthly).toBe(3200)
    expect(r.monthsUsed).toBe(3)
  })

  it('drops empty months instead of averaging them in as zeros', () => {
    // The failure this prevents: two months of imported history plus one empty
    // month would report an average a third too low, which is exactly the kind
    // of confidently wrong number a plan gets built on.
    const r = averageMonthlySpend([m('2026-05', 3000), m('2026-06', 3000), m('2026-07', 0)])
    expect(r.averageMonthly).toBe(3000)
    expect(r.monthsUsed).toBe(2)
  })

  it('counts uncategorized outflow as spending and reports its share', () => {
    // Uncategorized money left the account whether or not it was labelled.
    const r = averageMonthlySpend([m('2026-06', 800, -200)])
    expect(r.averageMonthly).toBe(1000)
    expect(r.uncategorizedShare).toBe(0.2)
  })

  it('ignores uncategorized INFLOW — an unlabelled deposit is not spending', () => {
    const r = averageMonthlySpend([m('2026-06', 900, 500)])
    expect(r.averageMonthly).toBe(900)
    expect(r.uncategorizedShare).toBe(0)
  })

  it('degenerates cleanly with no data at all', () => {
    expect(averageMonthlySpend([])).toEqual({ averageMonthly: 0, monthsUsed: 0, uncategorizedShare: 0 })
    expect(averageMonthlySpend([m('2026-06', 0)])).toMatchObject({ averageMonthly: 0, monthsUsed: 0 })
  })
})
