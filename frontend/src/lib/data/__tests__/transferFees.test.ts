import { describe, expect, it } from 'vitest'
import {
  EXCHANGES, NETWORKS, EVM_NETWORKS, COIN_INFO,
  findTransferPaths, PERSONAL_WALLET_ID, TRANSFER_FEES_LAST_VERIFIED,
  type NetworkId, type NetworkFeeMap, type CoinPriceMap, type LiveFeeOverrideMap,
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

  // Regression: both the route-builder UI and the public v1 API accept
  // "wallet" as a SOURCE; findTransferPaths used to return [] for it, so
  // wallet-origin legs silently rendered nothing and v1 replied with an empty
  // routes array for a documented parameter value.
  it('wallet → exchange yields viable deposit routes: no exchange fee, total = gas, cheapest recommended', () => {
    const paths = findTransferPaths(PERSONAL_WALLET_ID, 'coinbase', 'usdt', 1000, ALL_FEES, PRICES)
    expect(paths.length).toBeGreaterThan(0)
    for (const p of paths) {
      expect(p.type).toBe('direct')
      expect(p.exchangeFeeCoin).toBe(0)
      expect(p.exchangeFeeUsd).toBe(0)
      // The sender pays gas from their own wallet — it IS the total cost.
      expect(p.totalFeeUsd).toBeCloseTo(p.networkFeeUsd, 9)
      expect(p.isViable).toBe(true)
      expect(p.hops[0].gasCoveredByFee).toBe(false)
      expect(p.warnings.some((w) => w.title === 'Gas paid from your wallet')).toBe(true)
      // No exchange minimum applies to an on-chain deposit.
      expect(p.warnings.some((w) => w.title === 'Below minimum withdrawal')).toBe(false)
    }
    for (let i = 1; i < paths.length; i++) expect(paths[i].totalFeeUsd).toBeGreaterThanOrEqual(paths[i - 1].totalFeeUsd)
    const recommended = paths.filter((p) => p.isRecommended)
    expect(recommended).toHaveLength(1)
    expect(recommended[0]).toBe(paths[0])
  })

  it('wallet → exchange that does not list the coin returns an explanatory no-path', () => {
    // Hyperliquid only supports USDC — BTC from a wallet has no destination.
    const paths = findTransferPaths(PERSONAL_WALLET_ID, 'hyperliquid', 'btc', 1, ALL_FEES, PRICES)
    expect(paths).toHaveLength(1)
    expect(paths[0].type).toBe('no-path')
    expect(paths[0].isViable).toBe(false)
  })

  // The hop-level invariant the v1 API payload relies on: a hop's true cost is
  // exchangeFeeUsd when its gas is covered by the withdrawal fee, otherwise
  // exchangeFeeUsd + networkFeeUsd — and those must sum to the path total.
  it('per-hop costs (respecting gasCoveredByFee) sum exactly to the path total', () => {
    const scenarios: Array<[string, string]> = [
      ['binance', 'coinbase'],
      ['binance', PERSONAL_WALLET_ID],
      [PERSONAL_WALLET_ID, 'kraken'],
    ]
    for (const [from, to] of scenarios) {
      for (const p of findTransferPaths(from, to, 'usdt', 1000, ALL_FEES, PRICES)) {
        if (p.type === 'no-path') continue
        const hopSum = p.hops.reduce(
          (s, h) => s + (h.gasCoveredByFee ? h.exchangeFeeUsd : h.exchangeFeeUsd + h.networkFeeUsd),
          0,
        )
        expect(hopSum, `${from}→${to} ${p.id}`).toBeCloseTo(p.totalFeeUsd, 9)
      }
    }
  })
})

// A withdrawal the exchange has closed is the one stale value that can strand
// funds rather than merely misprice them, so these guard how it is reported.
describe('findTransferPaths — withdrawal suspensions', () => {
  /** Suspend every network the source lists for a coin, as a live report would. */
  function suspendAll(exchangeId: string, coin: 'usdt'): LiveFeeOverrideMap {
    const ex = EXCHANGES.find(e => e.id === exchangeId)!
    const byNet: Record<string, { withdrawFee: number; withdrawEnabled: boolean }> = {}
    for (const n of ex.coins[coin]!.networks) {
      byNet[n.networkId] = { withdrawFee: n.withdrawFee, withdrawEnabled: false }
    }
    return { [exchangeId]: { [coin]: byNet } } as LiveFeeOverrideMap
  }

  it('still searches for a wallet alternative when every direct network is suspended', () => {
    const paths = findTransferPaths(
      'binance', 'coinbase', 'usdt', 1000, ALL_FEES, PRICES, suspendAll('binance', 'usdt'),
    )
    // Every direct route is reported blocked...
    const suspended = paths.filter(p => p.blockedReason === 'withdrawals-suspended')
    expect(suspended.length).toBeGreaterThan(0)
    // ...and the fallback still ran rather than being suppressed by them. Before
    // suspensions were pushed as paths, `paths.length === 0` gated this branch;
    // counting a blocked route as "found a route" would silently hide the
    // alternative in exactly the case the user most needs it.
    expect(paths.some(p => p.blockedReason !== 'withdrawals-suspended')).toBe(true)
  })

  it('never recommends or prices a suspended route', () => {
    const paths = findTransferPaths(
      'binance', 'coinbase', 'usdt', 1000, ALL_FEES, PRICES, suspendAll('binance', 'usdt'),
    )
    for (const p of paths.filter(p => p.blockedReason === 'withdrawals-suspended')) {
      expect(p.isViable).toBe(false)
      expect(p.isRecommended).toBe(false)
      expect(p.totalFeeUsd).toBe(0)
      expect(p.hops).toEqual([])
    }
  })

  it('a live fee carrying no status flag blocks nothing', () => {
    // An adapter can report a price while saying nothing about availability
    // (Bitfinex's fee map has no status field). That must not be read as a
    // suspension — absent is unknown, not closed.
    const overrides = { binance: { usdt: { trc20: { withdrawFee: 1 } } } } as LiveFeeOverrideMap
    const paths = findTransferPaths('binance', 'coinbase', 'usdt', 1000, ALL_FEES, PRICES, overrides)
    expect(paths.some(p => p.blockedReason === 'withdrawals-suspended')).toBe(false)
    const trc = paths.find(p => p.networkId === 'trc20')
    expect(trc?.isViable).toBe(true)
  })

  it('a live suspension is attributed to the exchange, never to the stored table', () => {
    const overrides = {
      binance: { usdt: { trc20: { withdrawFee: 1, withdrawEnabled: false } } },
    } as LiveFeeOverrideMap
    const paths = findTransferPaths('binance', 'coinbase', 'usdt', 1000, ALL_FEES, PRICES, overrides, '3:04 PM')
    const msg = paths.find(p => p.blockedReason === 'withdrawals-suspended')!
      .warnings.find(w => w.title === 'Withdrawals suspended')!.message
    expect(msg).toContain('public API')
    expect(msg).toContain('3:04 PM')
    // must NOT blame the stored snapshot for something an exchange reported live
    expect(msg).not.toContain(TRANSFER_FEES_LAST_VERIFIED)
  })

  // The other branch of that message — "the stored table records this as
  // disabled" — is unreachable while every catalogued row is enabled. This
  // guard documents that, and fires the day a refresh writes the first
  // disabled row, which is when that copy starts rendering to users.
  it('every catalogued row is withdrawEnabled: true (stored-suspension copy is unreachable)', () => {
    const disabled = EXCHANGES.flatMap(ex =>
      Object.entries(ex.coins).flatMap(([coinId, coin]) =>
        coin!.networks.filter(n => !n.withdrawEnabled).map(n => `${ex.id}/${coinId}/${n.networkId}`)))
    expect(disabled).toEqual([])
  })
})
