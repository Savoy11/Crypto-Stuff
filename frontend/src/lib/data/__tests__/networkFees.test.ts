import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  computeNetworkFees, NETWORK_GAS, FALLBACK_PRICES, type NetworkKey,
} from '../networkFees'

// W4-C9. This module is declared the single source of truth for two API layers
// — /live-data/network-fees (UI) and /api/v1/network-fees (public, consumed by
// the MCP server and external agents) — and produces dollar figures. It had no
// tests. These pin the arithmetic and, more importantly, the live-vs-estimate
// labelling: a static gas amount priced live still moves on screen, and motion
// reads as freshness.

const COINGECKO = 'api.coingecko.com'
const MEMPOOL = 'mempool.space'

function mockFetch(handlers: { prices?: unknown | null; btc?: unknown | null }) {
  return vi.fn(async (url: string | URL) => {
    const href = String(url)
    if (href.includes(COINGECKO)) {
      if (handlers.prices == null) return { ok: false, status: 502, json: async () => ({}) }
      return { ok: true, status: 200, json: async () => handlers.prices }
    }
    if (href.includes(MEMPOOL)) {
      if (handlers.btc == null) return { ok: false, status: 502, json: async () => ({}) }
      return { ok: true, status: 200, json: async () => handlers.btc }
    }
    throw new Error(`unexpected fetch: ${href}`)
  })
}

/** CoinGecko's shape, keyed by the ids the module actually asks for. */
function priceResponse(usdById: Record<string, number>) {
  return Object.fromEntries(Object.entries(usdById).map(([id, usd]) => [id, { usd }]))
}

const ALL_IDS = Object.fromEntries(
  Object.values(NETWORK_GAS).map((g) => [g.coingeckoId, 2000]),
)

afterEach(() => { vi.unstubAllGlobals() })

describe('computeNetworkFees', () => {
  it('returns an entry for every network in the gas table', async () => {
    vi.stubGlobal('fetch', mockFetch({ prices: priceResponse(ALL_IDS), btc: { halfHourFee: 10 } }))
    const { fees } = await computeNetworkFees()
    const keys = Object.keys(NETWORK_GAS) as NetworkKey[]
    expect(Object.keys(fees).sort()).toEqual([...keys].sort())
  })

  it('prices each network as gas amount x token price', async () => {
    vi.stubGlobal('fetch', mockFetch({ prices: priceResponse(ALL_IDS), btc: null }))
    const { fees, prices } = await computeNetworkFees()
    for (const key of Object.keys(NETWORK_GAS) as NetworkKey[]) {
      const info = NETWORK_GAS[key]
      const expected = parseFloat((info.native * prices[info.priceKey]).toFixed(4))
      expect(fees[key].feeUsd).toBe(expected)
    }
  })

  // The distinction the Transfer Fees audit (T8) turned on: only Bitcoin has a
  // live gas amount. Everything else is a static amount multiplied by a live
  // price, which moves on screen while the gas component never updates.
  it('labels a network live only when a provider supplied the gas amount', async () => {
    vi.stubGlobal('fetch', mockFetch({ prices: priceResponse(ALL_IDS), btc: { halfHourFee: 20 } }))
    const { fees } = await computeNetworkFees()
    expect(fees.bitcoin.source).toBe('live')
    for (const key of Object.keys(NETWORK_GAS) as NetworkKey[]) {
      if (key !== 'bitcoin') expect(fees[key].source).toBe('estimate')
    }
  })

  it('falls back to the static Bitcoin estimate when mempool.space fails', async () => {
    vi.stubGlobal('fetch', mockFetch({ prices: priceResponse(ALL_IDS), btc: null }))
    const { fees, btcSatPerVbyte } = await computeNetworkFees()
    expect(fees.bitcoin.source).toBe('estimate')
    expect(fees.bitcoin.feeNative).toBe(NETWORK_GAS.bitcoin.native)
    expect(btcSatPerVbyte).toBeNull()
  })

  it('derives the Bitcoin fee from sat/vByte over a 250-vByte transfer', async () => {
    vi.stubGlobal('fetch', mockFetch({ prices: priceResponse(ALL_IDS), btc: { halfHourFee: 12 } }))
    const { fees, btcSatPerVbyte } = await computeNetworkFees()
    expect(btcSatPerVbyte).toBe(12)
    expect(fees.bitcoin.feeNative).toBeCloseTo((12 * 250) / 1e8, 12)
  })

  it('prefers halfHourFee, falling back to fastestFee', async () => {
    vi.stubGlobal('fetch', mockFetch({ prices: priceResponse(ALL_IDS), btc: { fastestFee: 30, hourFee: 5 } }))
    const { btcSatPerVbyte } = await computeNetworkFees()
    expect(btcSatPerVbyte).toBe(30)
  })

  it('uses fallback prices and reports the source when CoinGecko fails', async () => {
    vi.stubGlobal('fetch', mockFetch({ prices: null, btc: { halfHourFee: 10 } }))
    const { prices, priceSource } = await computeNetworkFees()
    expect(priceSource).toBe('fallback')
    for (const [key, value] of Object.entries(FALLBACK_PRICES)) {
      expect(prices[key]).toBe(value)
    }
  })

  it('reports fallback when CoinGecko answers with nothing usable', async () => {
    vi.stubGlobal('fetch', mockFetch({ prices: {}, btc: null }))
    const { priceSource } = await computeNetworkFees()
    expect(priceSource).toBe('fallback')
  })

  it('survives every upstream failing at once', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down') }))
    const { fees, priceSource, btcSatPerVbyte } = await computeNetworkFees()
    expect(priceSource).toBe('fallback')
    expect(btcSatPerVbyte).toBeNull()
    // Still a complete, labelled table rather than a crash or a partial one.
    for (const key of Object.keys(NETWORK_GAS) as NetworkKey[]) {
      expect(fees[key].source).toBe('estimate')
      expect(Number.isFinite(fees[key].feeUsd)).toBe(true)
    }
  })

  it('never emits a NaN or negative dollar figure', async () => {
    vi.stubGlobal('fetch', mockFetch({ prices: priceResponse(ALL_IDS), btc: { halfHourFee: 8 } }))
    const { fees } = await computeNetworkFees()
    for (const fee of Object.values(fees)) {
      expect(Number.isFinite(fee.feeUsd)).toBe(true)
      expect(fee.feeUsd).toBeGreaterThanOrEqual(0)
    }
  })
})
