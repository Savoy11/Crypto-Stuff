import { describe, it, expect } from 'vitest'
import { INSTRUMENT_BY_KEY, formatInstrumentQuote } from '../instruments'
import { COMMODITY_BY_SLUG, formatCommodityPrice } from '../commodityCatalog'
import { CURRENCY_BY_SLUG, formatFxRate } from '../currencyCatalog'
import { RATES_BY_SLUG, formatRatesQuote } from '../ratesCatalog'
import { convertFx } from '../../utils/fxConvert'

// These formatters carry the macro module's honesty guarantee: a corn quote
// rendered as "$482" instead of 482¢/bu overstates the price ~100×, and a
// yield rendered as a dollar price is a category error, not a cosmetic one.

const inst = (symbol: string) => {
  const i = INSTRUMENT_BY_KEY[`sec:${symbol}`]
  expect(i, `instrument sec:${symbol} must exist`).toBeDefined()
  return i
}

describe('formatInstrumentQuote', () => {
  it('renders cents-quoted grains as cents per unit, never dollars', () => {
    const out = formatInstrumentQuote(inst('ZC=F'), 472.75)
    expect(out).toBe('472.75¢/bu')
    expect(out).not.toContain('$')
  })

  it('renders USD-quoted commodities as dollars', () => {
    expect(formatInstrumentQuote(inst('GC=F'), 2412.3)).toBe('$2,412.30')
  })

  it('renders yield indices as percents', () => {
    expect(formatInstrumentQuote(inst('^TNX'), 4.28)).toBe('4.28%')
  })

  it('renders bond futures as bare points-of-par numbers (no $)', () => {
    expect(formatInstrumentQuote(inst('ZN=F'), 110.484375)).toBe('110.48')
  })

  it('renders the dollar index as a bare level (no $)', () => {
    expect(formatInstrumentQuote(inst('DX-Y.NYB'), 104.567)).toBe('104.57')
  })

  it('honours per-pair precision: EUR/USD at 4dp', () => {
    expect(formatInstrumentQuote(inst('EURUSD=X'), 1.08423)).toBe('$1.0842')
  })

  it('honours per-pair precision: USD/JPY at 2dp', () => {
    // Pinned discrepancy: the instrument row for a non-USD-quoted pair carries
    // quoteKind 'usd', so USD/JPY renders with a '$' prefix even though 147.26
    // is a yen amount. The precision (2dp) is correct; the currency symbol
    // overstates nothing numerically but mislabels the quote currency.
    expect(formatInstrumentQuote(inst('JPY=X'), 147.256)).toBe('$147.26')
  })

  it('defaults to a USD price for instruments without quoteKind (crypto/equity)', () => {
    expect(formatInstrumentQuote(undefined, 187.5)).toBe('$187.50')
  })

  it('uses 4dp for sub-dollar default-quoted prices', () => {
    expect(formatInstrumentQuote(undefined, 0.08231)).toBe('$0.0823')
  })

  it('returns null (never "$0.00") for missing or non-finite prices', () => {
    expect(formatInstrumentQuote(inst('ZC=F'), null)).toBeNull()
    expect(formatInstrumentQuote(inst('GC=F'), undefined)).toBeNull()
    expect(formatInstrumentQuote(undefined, NaN)).toBeNull()
    expect(formatInstrumentQuote(undefined, Infinity)).toBeNull()
  })
})

describe('formatCommodityPrice', () => {
  const corn = COMMODITY_BY_SLUG['corn']
  const gold = COMMODITY_BY_SLUG['gold']
  const gas = COMMODITY_BY_SLUG['natural-gas']

  it('renders corn in cents per bushel, never dollars', () => {
    const out = formatCommodityPrice(corn, 472.75)
    expect(out).toBe('472.75¢/bu')
    expect(out).not.toContain('$')
  })

  it('drops to 1dp for cents quotes at 500¢ and above', () => {
    expect(formatCommodityPrice(corn, 512.25)).toBe('512.3¢/bu')
  })

  it('renders gold in whole dollars per troy ounce at 4 figures', () => {
    expect(formatCommodityPrice(gold, 2412.3)).toBe('$2,412/oz t')
  })

  it('renders mid-range USD quotes at 2dp', () => {
    expect(formatCommodityPrice(gold, 812.5)).toBe('$812.50/oz t')
  })

  it('renders sub-$20 USD quotes at 3dp (natural gas)', () => {
    expect(formatCommodityPrice(gas, 2.845)).toBe('$2.845/MMBtu')
  })
})

describe('formatFxRate', () => {
  it('quotes EUR/USD at its 4dp market convention', () => {
    expect(formatFxRate(CURRENCY_BY_SLUG['eur-usd'], 1.08423)).toBe('1.0842')
  })

  it('quotes USD/JPY at its 2dp market convention', () => {
    expect(formatFxRate(CURRENCY_BY_SLUG['usd-jpy'], 147.256)).toBe('147.26')
  })

  it('quotes USD/KRW at 1dp with thousands separator', () => {
    expect(formatFxRate(CURRENCY_BY_SLUG['usd-krw'], 1372.45)).toBe('1,372.5')
  })

  it('pads to the pair precision so 1.5 reads as 1.5000', () => {
    expect(formatFxRate(CURRENCY_BY_SLUG['gbp-usd'], 1.5)).toBe('1.5000')
  })
})

describe('formatRatesQuote', () => {
  const tnx = RATES_BY_SLUG['10-year-yield']
  const zn = RATES_BY_SLUG['10-year-note-future']

  it('renders yield indices as percents, never prices', () => {
    const out = formatRatesQuote(tnx, 4.28)
    expect(out).toBe('4.28%')
    expect(out).not.toContain('$')
  })

  it('renders futures as points of par with 2–3dp', () => {
    expect(formatRatesQuote(zn, 110.5)).toBe('110.50 pts')
    expect(formatRatesQuote(zn, 110.484375)).toBe('110.484 pts')
  })
})

describe('convertFx', () => {
  // Feed convention: every rate is quoted against the same base, so any
  // pair converts as rate(to) / rate(from). USD is itself a rate entry.
  const rates = { USD: 1, EUR: 0.92, JPY: 147.2, GBP: 0.79 }

  it('converts via the direct rate when from is the base', () => {
    const c = convertFx(1000, 'USD', 'EUR', rates)!
    expect(c.rate).toBeCloseTo(0.92, 10)
    expect(c.result).toBeCloseTo(920, 10)
  })

  it('inverts for the reverse direction', () => {
    const c = convertFx(920, 'EUR', 'USD', rates)!
    expect(c.rate).toBeCloseTo(1 / 0.92, 10)
    expect(c.result).toBeCloseTo(1000, 6)
    expect(c.inverse).toBeCloseTo(0.92, 10)
  })

  it('crosses two non-base currencies as rate(to)/rate(from)', () => {
    const c = convertFx(100, 'EUR', 'JPY', rates)!
    expect(c.rate).toBeCloseTo(147.2 / 0.92, 10)
    expect(c.result).toBeCloseTo(100 * (147.2 / 0.92), 8)
  })

  it('round-trips: converting there and back recovers the amount', () => {
    const there = convertFx(1234.56, 'GBP', 'JPY', rates)!
    const back = convertFx(there.result, 'JPY', 'GBP', rates)!
    expect(back.result).toBeCloseTo(1234.56, 8)
  })

  it('returns null for a missing rate on either leg', () => {
    expect(convertFx(100, 'USD', 'XXX', rates)).toBeNull()
    expect(convertFx(100, 'XXX', 'USD', rates)).toBeNull()
  })

  it('returns null (not Infinity) for a zero rate on either leg', () => {
    const withZero = { ...rates, BAD: 0 }
    expect(convertFx(100, 'BAD', 'USD', withZero)).toBeNull()
    expect(convertFx(100, 'USD', 'BAD', withZero)).toBeNull()
  })

  it('returns null for negative or non-finite amounts', () => {
    expect(convertFx(-1, 'USD', 'EUR', rates)).toBeNull()
    expect(convertFx(NaN, 'USD', 'EUR', rates)).toBeNull()
    expect(convertFx(Infinity, 'USD', 'EUR', rates)).toBeNull()
  })

  it('accepts a zero amount and returns zero', () => {
    expect(convertFx(0, 'USD', 'EUR', rates)!.result).toBe(0)
  })
})
