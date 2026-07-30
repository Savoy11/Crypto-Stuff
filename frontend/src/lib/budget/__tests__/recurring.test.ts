import { describe, expect, it } from 'vitest'
import { detectRecurring, merchantKey } from '../recurring'

describe('merchantKey', () => {
  it('groups store numbers and reference ids together', () => {
    expect(merchantKey('NETFLIX.COM 866-579-7172 #4821')).toBe(merchantKey('NETFLIX.COM 866-579-7172 #4907'))
  })
})

describe('detectRecurring', () => {
  const monthly = (desc: string, amount: number, dates: string[]) =>
    dates.map((d) => ({ description: desc, amount, postedAt: d }))

  it('detects a monthly subscription and estimates the next due date', () => {
    const out = detectRecurring(monthly('NETFLIX.COM #1', -15.49, ['2026-04-05', '2026-05-05', '2026-06-05', '2026-07-05']))
    expect(out).toHaveLength(1)
    expect(out[0].cadence).toBe('monthly')
    expect(out[0].amount).toBe(-15.49)
    expect(out[0].occurrences).toBe(4)
    expect(out[0].nextDueAt).toBe('2026-08-04') // +30 days — estimate, not calendar month
  })

  it('detects positive recurring income too', () => {
    const out = detectRecurring(monthly('EMPLOYER PAYROLL', 2500, ['2026-05-01', '2026-05-15', '2026-05-29', '2026-06-12']))
    expect(out).toHaveLength(1)
    expect(out[0].cadence).toBe('biweekly')
  })

  it('requires at least 3 occurrences', () => {
    expect(detectRecurring(monthly('SPOTIFY', -9.99, ['2026-06-01', '2026-07-01']))).toHaveLength(0)
  })

  it('rejects variable-amount merchants (a habit is not a subscription)', () => {
    const txs = [
      { description: 'GROCERY MART', amount: -20, postedAt: '2026-05-01' },
      { description: 'GROCERY MART', amount: -85, postedAt: '2026-06-01' },
      { description: 'GROCERY MART', amount: -140, postedAt: '2026-07-01' },
    ]
    expect(detectRecurring(txs)).toHaveLength(0)
  })

  it('rejects irregular intervals even when the median fits', () => {
    const txs = [
      { description: 'RANDOM SHOP', amount: -10, postedAt: '2026-01-01' },
      { description: 'RANDOM SHOP', amount: -10, postedAt: '2026-01-03' },
      { description: 'RANDOM SHOP', amount: -10, postedAt: '2026-02-01' },
      { description: 'RANDOM SHOP', amount: -10, postedAt: '2026-05-20' },
    ]
    expect(detectRecurring(txs)).toHaveLength(0)
  })

  it('sorts suggestions by amount magnitude', () => {
    const out = detectRecurring([
      ...monthly('SMALL SUB', -5, ['2026-05-01', '2026-06-01', '2026-07-01']),
      ...monthly('BIG RENT', -1800, ['2026-05-02', '2026-06-02', '2026-07-02']),
    ])
    expect(out.map((s) => s.description)).toEqual(['BIG RENT', 'SMALL SUB'])
  })
})
