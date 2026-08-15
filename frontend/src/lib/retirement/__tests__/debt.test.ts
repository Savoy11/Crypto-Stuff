import { describe, expect, it } from 'vitest'
import { amortize, cardPayoff, monthlyPayment, remainingPrincipal } from '../debt'

describe('monthlyPayment', () => {
  it('matches the standard annuity payment', () => {
    // $200,000 at 6.275% over 30 years — the spreadsheet's House row.
    expect(monthlyPayment(200_000, 6.275, 30)).toBeCloseTo(1234.69, 2)
  })

  it('is principal ÷ months at 0%', () => {
    expect(monthlyPayment(12_000, 0, 1)).toBeCloseTo(1000, 6)
  })

  it('is zero for a loan with no principal or no term', () => {
    expect(monthlyPayment(0, 6, 30)).toBe(0)
    expect(monthlyPayment(10_000, 6, 0)).toBe(0)
  })
})

describe('remainingPrincipal', () => {
  it('is the full financed amount before any payment', () => {
    expect(remainingPrincipal(10_000, 8, 5, 0)).toBeCloseTo(10_000, 6)
  })

  it('is zero at the end of the term', () => {
    expect(remainingPrincipal(10_000, 8, 5, 60)).toBeCloseTo(0, 6)
  })

  it('never goes negative when more payments are claimed than the term holds', () => {
    expect(remainingPrincipal(10_000, 8, 5, 500)).toBe(0)
  })

  it('amortizes slowly at first on a long high-rate loan', () => {
    // After 1 of 360 payments, almost the whole payment is interest.
    const left = remainingPrincipal(200_000, 6.275, 30, 1)
    expect(200_000 - left).toBeLessThan(200)
  })
})

describe('amortize', () => {
  const car = { principal: 10_000, annualRatePct: 8, termYears: 5, monthsPaid: 1, downPayment: 0 }

  it('reconciles: principal paid + remaining principal = financed', () => {
    const s = amortize(car)
    expect(s.principalPaid + s.remainingPrincipal).toBeCloseTo(s.financed, 1)
  })

  it('reconciles: interest paid + remaining interest = total interest', () => {
    const s = amortize(car)
    expect(s.interestPaid + s.remainingInterest).toBeCloseTo(s.totalInterest, 1)
  })

  it('reconciles: total paid = financed + total interest', () => {
    const s = amortize(car)
    expect(s.totalPaid).toBeCloseTo(s.financed + s.totalInterest, 1)
  })

  it('splits the next payment into interest and principal that sum to it', () => {
    const s = amortize(car)
    expect(s.nextInterest + s.nextPrincipal).toBeCloseTo(s.monthlyPayment, 1)
    expect(s.nextInterest).toBeGreaterThan(0)
  })

  it('applies the down payment before financing', () => {
    const s = amortize({ ...car, principal: 12_000, downPayment: 2000 })
    expect(s.financed).toBe(10_000)
  })

  it('reports a paid-off loan cleanly at the end of the term', () => {
    const s = amortize({ ...car, monthsPaid: 60 })
    expect(s.paidOff).toBe(true)
    expect(s.remainingPrincipal).toBe(0)
    expect(s.remainingPayments).toBe(0)
    expect(s.nextInterest).toBe(0)
  })

  it('shifts the payment toward principal as the loan ages', () => {
    const early = amortize({ ...car, monthsPaid: 1 })
    const late = amortize({ ...car, monthsPaid: 55 })
    expect(late.nextPrincipal).toBeGreaterThan(early.nextPrincipal)
    expect(late.nextInterest).toBeLessThan(early.nextInterest)
  })

  it('handles an interest-free loan', () => {
    const s = amortize({ principal: 12_000, annualRatePct: 0, termYears: 1, monthsPaid: 6, downPayment: 0 })
    expect(s.totalInterest).toBe(0)
    expect(s.remainingPrincipal).toBeCloseTo(6000, 2)
  })

  it('handles a 30-year mortgage — the row whose sheet formula was broken', () => {
    // Debt Calculators!P11 carries a #REF!; this is the repaired definition.
    const s = amortize({ principal: 200_000, annualRatePct: 6.275, termYears: 30, monthsPaid: 1, downPayment: 0 })
    expect(s.totalPaid).toBeCloseTo(s.financed + s.totalInterest, 0)
    expect(s.remainingPayments).toBe(359)
    expect(s.totalInterest).toBeGreaterThan(200_000) // more interest than principal at this rate
  })
})

describe('cardPayoff', () => {
  const card = { balance: 2342.18, aprPct: 29.49, creditLimit: 4750, monthlyPayment: 300 }

  it('reports one cycle of interest and the utilization ratio', () => {
    const p = cardPayoff(card)
    expect(p.monthlyInterest).toBeCloseTo((2342.18 * 0.2949) / 12, 2)
    expect(p.utilizationPct).toBeCloseTo(49.31, 1)
  })

  it('computes months to payoff and the interest that costs', () => {
    const p = cardPayoff(card)
    expect(p.monthsToPayOff).toBe(9)
    expect(p.totalInterestToPayOff!).toBeGreaterThan(0)
    expect(p.neverPaysOff).toBe(false)
  })

  it('reports NEVER when the payment does not cover the interest', () => {
    // The spreadsheet's balance ÷ payment returns a confident finite month
    // count here — wrong precisely when the user most needs to be told.
    const p = cardPayoff({ ...card, monthlyPayment: 40 })
    expect(p.neverPaysOff).toBe(true)
    expect(p.monthsToPayOff).toBeNull()
    expect(p.totalInterestToPayOff).toBeNull()
  })

  it('treats a payment exactly equal to the interest as never paying off', () => {
    const interest = (2342.18 * 0.2949) / 12
    expect(cardPayoff({ ...card, monthlyPayment: interest }).neverPaysOff).toBe(true)
  })

  it('handles a cleared card', () => {
    const p = cardPayoff({ ...card, balance: 0 })
    expect(p.monthsToPayOff).toBe(0)
    expect(p.monthlyInterest).toBe(0)
    expect(p.neverPaysOff).toBe(false)
  })

  it('returns null utilization when no limit is known, rather than dividing by zero', () => {
    expect(cardPayoff({ ...card, creditLimit: 0 }).utilizationPct).toBeNull()
  })

  it('handles a 0% promotional rate', () => {
    const p = cardPayoff({ balance: 1200, aprPct: 0, creditLimit: 5000, monthlyPayment: 100 })
    expect(p.monthsToPayOff).toBe(12)
    expect(p.totalInterestToPayOff).toBe(0)
  })
})
