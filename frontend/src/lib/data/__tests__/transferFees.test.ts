import { describe, expect, it } from 'vitest'
import {
  EXCHANGES, NETWORKS, EVM_NETWORKS, COIN_INFO,
  findTransferPaths, PERSONAL_WALLET_ID,
  type NetworkId, type NetworkFeeMap, type CoinPriceMap,
} from '../transferFees'

// A fee map covering every network (all 'estimate') so path-finding isn't
// starved of gas data, plus reference prices for a few majors.
const ALL_FEES: NetworkFeeMap = Object.fromEntries(
  (Object.keys(NETWORKS) as NetworkId[]).map((id) => [
    id, { feeNative: 0.001, feeUsd: 1, nativeToken: NETWORKS[id].nativeToken, source: 'estimate' as const },
  ]),
)
const PRICES: CoinPriceMap = { btc: 60000, eth: 3000, usdt: 1, usdc: 1, sol: 150 }

describe('transferFees data integrity', () => {
  it('every exchange network entry references a valid network with sane, finite fees', () => {
    const validNetworks = new Set(Object.keys(NETWORKS))
    for (const ex of EXCHANGES) {
      for (const [coinId, coin] of Object.entries(ex.coins)) {
        const seen = new Set<string>()
        for (const n of coin!.networks) {
          const where = `${ex.id}/${coinId}/${n.networkId}`
          expect(validNetworks.has(n.networkId), `${where}: unknown network`).toBe(true)
          expect(Number.isFinite(n.withdrawFee) && n.withdrawFee >= 0, `${where}: bad withdrawFee`).toBe(true)
          expect(Number.isFinite(n.minWithdraw) && n.minWithdraw >= 0, `${where}: bad minWithdraw`).toBe(true)
          expect(seen.has(n.networkId), `${where}: duplicate network in coin`).toBe(false)
          seen.add(n.networkId)
        }
      }
    }
  })

  it('exchange ids are unique and every coin key is a known coin', () => {
    const ids = EXCHANGES.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    const validCoins = new Set(Object.keys(COIN_INFO))
    for (const ex of EXCHANGES)
      for (const coinId of Object.keys(ex.coins))
        expect(validCoins.has(coinId), `${ex.id}: unknown coin ${coinId}`).toBe(true)
  })

  // The collision warning keys off EVM_NETWORKS — it must equal exactly the set
  // of 0x-address networks, or the most expensive user error goes unwarned.
  it('EVM_NETWORKS is exactly the set of 0x-address networks', () => {
    const zeroX = (Object.keys(NETWORKS) as NetworkId[]).filter((id) => NETWORKS[id].addressFormat === '0x')
    expect([...EVM_NETWORKS].sort()).toEqual([...zeroX].sort())
  })
})

describe('findTransferPaths', () => {
  it('returns [] for same source and destination, and for an unknown exchange', () => {
    expect(findTransferPaths('binance', 'binance', 'usdt', 1000, ALL_FEES, PRICES)).toEqual([])
    expect(findTransferPaths('does-not-exist', 'coinbase', 'usdt', 1000, ALL_FEES, PRICES)).toEqual([])
  })

  it('prefers direct routes, sorts viable-cheapest-first, and recommends exactly one', () => {
    const paths = findTransferPaths('binance', 'coinbase', 'usdt', 1000, ALL_FEES, PRICES)
    expect(paths.length).toBeGreaterThan(0)
    expect(paths[0].type).toBe('direct')
    // Viable paths are sorted ascending by total fee and come before non-viable.
    const viable = paths.filter((p) => p.isViable)
    for (let i = 1; i < viable.length; i++) expect(viable[i].totalFeeUsd).toBeGreaterThanOrEqual(viable[i - 1].totalFeeUsd)
    const recommended = paths.filter((p) => p.isRecommended)
    expect(recommended).toHaveLength(1)
    expect(recommended[0]).toBe(paths.find((p) => p.isViable))
  })

  it('direct-path total is the exchange fee only (on-chain gas not double-counted)', () => {
    const paths = findTransferPaths('binance', 'coinbase', 'usdt', 1000, ALL_FEES, PRICES)
    for (const p of paths.filter((p) => p.type === 'direct'))
      expect(p.totalFeeUsd).toBeCloseTo(p.exchangeFeeUsd, 9)
  })

  it('a wallet destination yields direct routes only (never a multi-hop)', () => {
    const paths = findTransferPaths('binance', PERSONAL_WALLET_ID, 'usdt', 1000, ALL_FEES, PRICES)
    expect(paths.length).toBeGreaterThan(0)
    expect(paths.some((p) => p.type === 'multi-hop')).toBe(false)
  })

  it('fires the EVM address-collision warning on 0x-network routes', () => {
    const paths = findTransferPaths('binance', 'coinbase', 'eth', 1, ALL_FEES, PRICES)
    const evmPath = paths.find((p) => p.networkId != null && EVM_NETWORKS.includes(p.networkId))
    expect(evmPath, 'expected at least one EVM-network route for ETH').toBeTruthy()
    expect(evmPath!.warnings.some((w) => w.title === 'Address format collision risk')).toBe(true)
  })
})
