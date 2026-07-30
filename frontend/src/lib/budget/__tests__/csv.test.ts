import { describe, expect, it } from 'vitest'
import { applyMapping, guessMapping, headerSignature, parseAmount, parseCsv, parseDate, type CsvMapping } from '../csv'

describe('parseCsv', () => {
  it('parses headers and rows, honoring quoted commas', () => {
    const { headers, rows, skipped } = parseCsv('Date,Description,Amount\n01/05/2026,"COFFEE, THE GOOD KIND",-4.50\n01/06/2026,MARKET,-20.00')
    expect(headers).toEqual(['Date', 'Description', 'Amount'])
    expect(rows).toEqual([['01/05/2026', 'COFFEE, THE GOOD KIND', '-4.50'], ['01/06/2026', 'MARKET', '-20.00']])
    expect(skipped).toBe(0)
  })

  it('drops rows with mismatched column counts and reports them', () => {
    const { rows, skipped } = parseCsv('A,B\n1,2\nTotals\n3,4')
    expect(rows).toHaveLength(2)
    expect(skipped).toBe(1)
  })

  it('handles escaped quotes', () => {
    const { rows } = parseCsv('A,B\n"say ""hi""",2')
    expect(rows[0][0]).toBe('say "hi"')
  })

  it('empty input yields empty result', () => {
    expect(parseCsv('')).toEqual({ headers: [], rows: [], skipped: 0 })
  })
})

describe('headerSignature', () => {
  it('is case-insensitive and order-sensitive', () => {
    expect(headerSignature(['Date', 'Amount'])).toBe(headerSignature(['date', 'AMOUNT']))
    expect(headerSignature(['Date', 'Amount'])).not.toBe(headerSignature(['Amount', 'Date']))
  })
})

describe('parseAmount', () => {
  it('parses plain, thousands, currency symbols', () => {
    expect(parseAmount('1234.56')).toBe(1234.56)
    expect(parseAmount('1,234.56')).toBe(1234.56)
    expect(parseAmount('$12.30')).toBe(12.3)
  })
  it('parses accounting negatives', () => {
    expect(parseAmount('(45.00)')).toBe(-45)
  })
  it('NaN on junk and empty', () => {
    expect(parseAmount('')).toBeNaN()
    expect(parseAmount('abc')).toBeNaN()
  })
})

describe('parseDate', () => {
  it('parses each supported format to ISO', () => {
    expect(parseDate('2026-07-30', 'YYYY-MM-DD')).toBe('2026-07-30')
    expect(parseDate('07/30/2026', 'MM/DD/YYYY')).toBe('2026-07-30')
    expect(parseDate('30/07/2026', 'DD/MM/YYYY')).toBe('2026-07-30')
    expect(parseDate('07-30-2026', 'MM-DD-YYYY')).toBe('2026-07-30')
    expect(parseDate('30.07.2026', 'DD.MM.YYYY')).toBe('2026-07-30')
  })
  it('rejects impossible dates rather than rolling them over', () => {
    expect(parseDate('02/30/2026', 'MM/DD/YYYY')).toBeNull()
    expect(parseDate('13/01/2026', 'MM/DD/YYYY')).toBeNull()
  })
  it('expands two-digit years to this century', () => {
    expect(parseDate('07/30/26', 'MM/DD/YYYY')).toBe('2026-07-30')
  })
})

describe('applyMapping', () => {
  const csv = parseCsv('Posted Date,Payee,Amount\n07/01/2026,NETFLIX.COM,-15.49\n07/02/2026,PAYCHECK,2500.00\nbad-date,X,-1.00')
  const mapping: CsvMapping = { date: 'Posted Date', description: 'Payee', amount: 'Amount', dateFormat: 'MM/DD/YYYY', amountConvention: 'signed' }

  it('maps rows and reports unmappable ones instead of dropping them', () => {
    const { rows, errors } = applyMapping(csv, mapping)
    expect(rows).toEqual([
      { postedAt: '2026-07-01', amount: -15.49, description: 'NETFLIX.COM' },
      { postedAt: '2026-07-02', amount: 2500, description: 'PAYCHECK' },
    ])
    expect(errors).toEqual([{ line: 3, reason: 'unparseable date "bad-date"' }])
  })

  it('inverted convention flips sign', () => {
    const inv = parseCsv('Date,Desc,Amount\n07/01/2026,CARD PURCHASE,15.49')
    const { rows } = applyMapping(inv, { date: 'Date', description: 'Desc', amount: 'Amount', dateFormat: 'MM/DD/YYYY', amountConvention: 'inverted' })
    expect(rows[0].amount).toBe(-15.49)
  })

  it('debit/credit columns produce signed amounts', () => {
    const dc = parseCsv('Date,Desc,Debit,Credit\n07/01/2026,GROCERY,52.10,\n07/02/2026,REFUND,,12.00')
    const { rows } = applyMapping(dc, { date: 'Date', description: 'Desc', debit: 'Debit', credit: 'Credit', dateFormat: 'MM/DD/YYYY', amountConvention: 'debit_credit' })
    expect(rows[0].amount).toBe(-52.1)
    expect(rows[1].amount).toBe(12)
  })

  it('fails loudly when a mapped column is missing', () => {
    const { rows, errors } = applyMapping(csv, { ...mapping, amount: 'Nope' })
    expect(rows).toHaveLength(0)
    expect(errors[0].reason).toContain('not found')
  })
})

describe('guessMapping', () => {
  it('guesses common bank headers', () => {
    const g = guessMapping(['Posted Date', 'Payee', 'Amount'])
    expect(g.date).toBe('Posted Date')
    expect(g.description).toBe('Payee')
    expect(g.amount).toBe('Amount')
    expect(g.amountConvention).toBe('signed')
  })
  it('prefers debit/credit pair when both present without amount', () => {
    const g = guessMapping(['Date', 'Details', 'Debit', 'Credit'])
    expect(g.amountConvention).toBe('debit_credit')
    expect(g.debit).toBe('Debit')
    expect(g.credit).toBe('Credit')
  })
})
