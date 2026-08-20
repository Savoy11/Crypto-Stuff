import { describe, it, expect } from 'vitest'
import {
  computeSaleCost, SPOT_TRADING_FEES, EXCHANGES, getTradingFeeProvenance,
} from '../transferFees'

// S3. computeSaleCost produces dollar figures a user acts on, so it is pure
// and tested per the house rule.

describe('computeSaleCost', () => {
  it('adds taker fee + withdrawal + network into an all-in figure', () => {
    // Binance taker 0.1% on $10,000 = $10, plus $2 withdrawal, $1.50 network.
    const r = computeSaleCost('binance', 10_000, 2, 1.5)!
    expect(r.tradeFeeUsd).toBeCloseTo(10, 6)
    expect(r.totalUsd).toBeCloseTo(13.5, 6)
    expect(r.totalPct).toBeCloseTo(0.135, 4)
  })

  it('returns null for an uncatalogued exchange — unknown is not zero', () => {
    // The failure this prevents: a venue with no fee data showing an all-in
    // cost that silently omits the trade fee would look CHEAPER than venues
    // we know about, inverting the comparison.
    expect(computeSaleCost('hotcoin', 10_000, 2, 1.5)).toBeNull()
    expect(computeSaleCost('nonexistent', 10_000, 2, 1.5)).toBeNull()
  })

  it('a sale is charged at the TAKER rate — maker-zero venues still cost on sale', () => {
    // MEXC advertises 0% maker, and a market sell is a taker order: 0.05% of
    // $10,000 = $5. Using the maker rate here would understate every sale.
    const r = computeSaleCost('mexc', 10_000, 0, 0)!
    expect(r.takerPct).toBe(0.05)
    expect(r.tradeFeeUsd).toBeCloseTo(5, 6)
  })

  it('degenerates on a non-positive amount', () => {
    expect(computeSaleCost('binance', 0, 2, 1.5)).toBeNull()
  })
})

describe('SPOT_TRADING_FEES coverage', () => {
  it('has an entry (fee or explicit null) for every exchange in the catalog', () => {
    // The coverage half of the owner's concern: a venue silently absent from
    // the fee map would render as if trading there were free.
    const missing = EXCHANGES.filter((e) => !(e.id in SPOT_TRADING_FEES)).map((e) => e.id)
    expect(missing, `exchanges with no trading-fee entry: ${missing.join(', ')}`).toEqual([])
  })

  it('never carries a negative or absurd rate', () => {
    for (const [id, fees] of Object.entries(SPOT_TRADING_FEES)) {
      if (!fees) continue
      expect(fees.makerPct, id).toBeGreaterThanOrEqual(0)
      expect(fees.takerPct, id).toBeGreaterThanOrEqual(0)
      expect(fees.takerPct, id).toBeLessThan(2) // >2% taker would be a typo, not a fee
    }
  })

  it('provenance is pinned to low confidence while seeded', () => {
    // A seeded table must not inherit high confidence from a fresh compile
    // date — the sourceTerms lesson, enforced rather than remembered.
    expect(getTradingFeeProvenance().confidence).toBe('low')
  })
})
