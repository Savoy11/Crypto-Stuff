import { describe, it, expect } from 'vitest'
import { sortAssets, compareValues, applyParams } from '../assets'
import type { Asset } from '@/types/asset'

const a = (id: string, price: number | null, extra: Partial<Asset> = {}) =>
  ({ id, symbol: id.toUpperCase(), price, volume24h: null, marketCap: null, ...extra } as unknown as Asset)

const UNIVERSE = [a('btc', 77246), a('eth', 2428), a('pol', 0.1078), a('hype', 62.43), a('nodata', null)]

describe('sortAssets — direction', () => {
  // The regression this file exists for: a second copy of the direction
  // convention was written inverted, so the rows came back reversed after the
  // API had already ordered them. Asserting "a sort happened" would have passed;
  // only asserting the ACTUAL ORDER catches it.
  it('desc puts the highest price first', () => {
    expect(sortAssets(UNIVERSE, 'price', 'desc').map(x => x.id))
      .toEqual(['btc', 'eth', 'hype', 'pol', 'nodata'])
  })

  it('asc puts the lowest price first', () => {
    expect(sortAssets(UNIVERSE, 'price', 'asc').map(x => x.id))
      .toEqual(['pol', 'hype', 'eth', 'btc', 'nodata'])
  })

  it('asc and desc are exact reverses of each other, ignoring the null tail', () => {
    const desc = sortAssets(UNIVERSE, 'price', 'desc').filter(x => x.price !== null).map(x => x.id)
    const asc = sortAssets(UNIVERSE, 'price', 'asc').filter(x => x.price !== null).map(x => x.id)
    expect(asc).toEqual([...desc].reverse())
  })

  // Missing values are not "cheapest" — they go last whichever way you sort.
  it('sorts rows with no value to the end in BOTH directions', () => {
    expect(sortAssets(UNIVERSE, 'price', 'desc').at(-1)!.id).toBe('nodata')
    expect(sortAssets(UNIVERSE, 'price', 'asc').at(-1)!.id).toBe('nodata')
  })

  it('does not mutate its input', () => {
    const before = UNIVERSE.map(x => x.id)
    sortAssets(UNIVERSE, 'price', 'asc')
    expect(UNIVERSE.map(x => x.id)).toEqual(before)
  })

  it('handles the derived liquidityRatio key', () => {
    const rows = [
      a('low', 1, { volume24h: 1, marketCap: 100 }),     // 1%
      a('high', 1, { volume24h: 50, marketCap: 100 }),   // 50%
      a('nocap', 1, { volume24h: 10, marketCap: null }), // underivable
    ]
    expect(sortAssets(rows, 'liquidityRatio', 'desc').map(x => x.id)).toEqual(['high', 'low', 'nocap'])
    expect(sortAssets(rows, 'liquidityRatio', 'asc').map(x => x.id)).toEqual(['low', 'high', 'nocap'])
  })
})

describe('compareValues', () => {
  it('uses dir=1 for ascending, matching sortAssets', () => {
    // Pins the convention itself, since the bug was a caller assuming the
    // opposite sign.
    expect(compareValues(1, 2, 1)).toBeLessThan(0)
    expect(compareValues(1, 2, -1)).toBeGreaterThan(0)
  })
})

const mkAsset = (id: string) => a(id, 1)

describe('applyParams merges technicals before filtering', () => {
  it('applies a technical rule against swept values, not undefined', () => {
    // The R2 lesson repeated: the risk composite had to be joined BEFORE
    // filtering or every rule ran against null and silently emptied the table.
    // Technicals arrive from a separate query, so they have the same hazard.
    const assets = [mkAsset('btc'), mkAsset('eth')]
    const technicals = new Map([
      ['btc', { rsi14: 25, vsSma50Pct: -5, vsSma200Pct: -10 }],
      ['eth', { rsi14: 80, vsSma50Pct: 5, vsSma200Pct: 10 }],
    ])
    const res = applyParams(assets, {
      technicals,
      filterRules: [{ id: '1', field: 'rsi14', operator: 'lte', value: 30 }],
    })
    expect(res.data.map(a => a.id)).toEqual(['btc'])
    expect(res.total).toBe(1)
  })

  it('counts every coin as untested when the sweep has not landed yet', () => {
    // In-flight is NOT a reason to show the unfiltered table: that would
    // present coins which may not match as though they did.
    const res = applyParams([mkAsset('btc'), mkAsset('eth')], {
      filterRules: [{ id: '1', field: 'rsi14', operator: 'lte', value: 30 }],
    })
    expect(res.total).toBe(0)
    expect(res.untested).toBe(2)
  })
})
