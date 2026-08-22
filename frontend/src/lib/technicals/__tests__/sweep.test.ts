import { describe, it, expect, vi } from 'vitest'
import { computeTechnicals, sweepTechnicals } from '../sweep'
import type { OhlcvCandle } from '@/lib/utils/indicators'

const candles = (closes: number[]): OhlcvCandle[] =>
  closes.map((c, i) => ({ time: i, open: c, high: c, low: c, close: c, volume: 0 }))

/** n closes rising by 1 — a clean uptrend, so price sits above every average. */
const rising = (n: number) => candles(Array.from({ length: n }, (_, i) => 100 + i))

describe('computeTechnicals', () => {
  it('returns all-null for an empty series rather than zeros', () => {
    expect(computeTechnicals([])).toEqual({ rsi14: null, vsSma50Pct: null, vsSma200Pct: null })
  })

  it('withholds the 200-day average when history is shorter than 200 candles', () => {
    // The bug this forbids: a 60-candle coin reported as "0% from its SMA200"
    // would sort into the middle of the pack on a filter it cannot answer.
    const t = computeTechnicals(rising(60))
    expect(t.vsSma50Pct).not.toBeNull()
    expect(t.vsSma200Pct).toBeNull()
  })

  it('withholds the 50-day average when history is shorter than 50 candles', () => {
    const t = computeTechnicals(rising(30))
    expect(t.vsSma50Pct).toBeNull()
  })

  it('computes both averages once there is enough history', () => {
    const t = computeTechnicals(rising(250))
    expect(t.vsSma50Pct).not.toBeNull()
    expect(t.vsSma200Pct).not.toBeNull()
  })

  it('puts price above its averages in an uptrend, and further above the longer one', () => {
    // A directional assertion, not just non-null: a sign flip here would make
    // every "price below its 50-day average" filter select the wrong coins.
    const t = computeTechnicals(rising(250))
    expect(t.vsSma50Pct!).toBeGreaterThan(0)
    expect(t.vsSma200Pct!).toBeGreaterThan(t.vsSma50Pct!)
  })

  it('puts price below its averages in a downtrend', () => {
    const falling = candles(Array.from({ length: 250 }, (_, i) => 500 - i))
    const t = computeTechnicals(falling)
    expect(t.vsSma50Pct!).toBeLessThan(0)
    expect(t.vsSma200Pct!).toBeLessThan(0)
  })

  it('reports RSI in range for a monotonic series', () => {
    const t = computeTechnicals(rising(250))
    expect(t.rsi14).not.toBeNull()
    expect(t.rsi14!).toBeGreaterThan(50)
    expect(t.rsi14!).toBeLessThanOrEqual(100)
  })
})

describe('sweepTechnicals', () => {
  const okResponse = (n: number) => ({
    ok: true,
    json: async () => ({ ok: true, candles: rising(n) }),
  })

  it('omits a coin whose fetch fails instead of giving it a neutral value', async () => {
    // The whole reason the screener can call a gap "not tested": a failed coin
    // must be ABSENT, never filled in with a 0 or an RSI of 50, or the filter
    // silently passes or fails something nobody measured.
    const fetchImpl = vi.fn(async (url: string) =>
      url.includes('btc') ? okResponse(250) : Promise.reject(new Error('429')),
    ) as unknown as typeof fetch

    const out = await sweepTechnicals(['btc', 'eth'], { fetchImpl, concurrency: 2 })
    expect(out.has('btc')).toBe(true)
    expect(out.has('eth')).toBe(false)
  })

  it('omits a coin the route answers with ok:false', async () => {
    const fetchImpl = (async () => ({
      ok: true, json: async () => ({ ok: false, candles: [] }),
    })) as unknown as typeof fetch
    const out = await sweepTechnicals(['btc'], { fetchImpl })
    expect(out.size).toBe(0)
  })

  it('reports progress for every coin, failures included', async () => {
    // Progress must count attempts, not successes, or the indicator stalls
    // short of the total on a partial sweep and reads as a hang.
    const fetchImpl = vi.fn(async (url: string) =>
      url.includes('a') ? okResponse(250) : Promise.reject(new Error('nope')),
    ) as unknown as typeof fetch
    const seen: number[] = []
    await sweepTechnicals(['a', 'b', 'c'], {
      fetchImpl, concurrency: 1, onProgress: d => seen.push(d),
    })
    expect(seen).toEqual([1, 2, 3])
  })

  it('makes exactly one request per coin', async () => {
    const fetchImpl = vi.fn(async () => okResponse(250)) as unknown as typeof fetch
    await sweepTechnicals(['a', 'b', 'c', 'd'], { fetchImpl })
    expect((fetchImpl as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(4)
  })
})
