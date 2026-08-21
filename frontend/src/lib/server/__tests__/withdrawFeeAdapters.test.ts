import { describe, it, expect } from 'vitest'
import {
  normalizeSymbol,
  normalizeChain,
  parseKucoinCurrencies,
  parseHtxCurrencies,
  parseBitgetCoins,
  parsePoloniexCurrencies,
  parseLbankWithdrawConfigs,
  parseBitfinexTxFees,
  parseXtSupportCurrency,
  buildFeeOverrideMap,
  type ParsedFeeRow,
} from '../withdrawFeeAdapters'
import { EXCHANGES, findTransferPaths, type NetworkFeeMap, type CoinPriceMap } from '@/lib/data/transferFees'

describe('normalizeSymbol', () => {
  it('maps known symbols case-insensitively', () => {
    expect(normalizeSymbol('BTC')).toBe('btc')
    expect(normalizeSymbol('usdt')).toBe('usdt')
  })
  it('maps POL (the Polygon rename) onto our matic id', () => {
    expect(normalizeSymbol('POL')).toBe('matic')
  })
  it('returns null for uncatalogued symbols instead of guessing', () => {
    expect(normalizeSymbol('PEPE')).toBeNull()
  })
})

describe('normalizeChain', () => {
  it('maps each exchange spelling variant onto one NetworkId', () => {
    expect(normalizeChain('ERC20')).toBe('erc20')
    expect(normalizeChain('Ethereum')).toBe('erc20')
    expect(normalizeChain('ETH')).toBe('erc20')
    expect(normalizeChain('AVAX C-Chain')).toBe('avalanche')
    expect(normalizeChain('BEP20(BSC)')).toBe('bep20')
    expect(normalizeChain('Arbitrum One')).toBe('arbitrum')
    expect(normalizeChain('TRC20')).toBe('trc20')
  })
  it('returns null for unknown chains instead of guessing', () => {
    expect(normalizeChain('Lightning')).toBeNull()
  })
})

describe('parseKucoinCurrencies', () => {
  const payload = {
    code: '200000',
    data: [
      {
        currency: 'BTC',
        chains: [
          { chainName: 'BTC', withdrawalMinFee: '0.0005', withdrawalMinSize: '0.001', isWithdrawEnabled: true },
        ],
      },
    ],
  }
  it('parses fee rows', () => {
    expect(parseKucoinCurrencies(payload)).toEqual([
      { exchangeId: 'kucoin', coin: 'btc', network: 'bitcoin', withdrawFee: 0.0005, minWithdraw: 0.001, withdrawEnabled: true },
    ])
  })
  it('returns nothing on a non-success code', () => {
    expect(parseKucoinCurrencies({ code: '500000' })).toEqual([])
  })
})

describe('parseHtxCurrencies', () => {
  const payload = {
    code: 200,
    data: [
      {
        currency: 'usdt',
        chains: [
          { displayName: 'TRC20', withdrawFeeType: 'fixed', transactFeeWithdraw: '1', minWithdrawAmt: '10', withdrawStatus: 'allowed' },
          // ratio-type fee AND no status → nothing usable, so the row is dropped.
          // (A ratio fee WITH a status survives as status-only — see below.)
          { displayName: 'ERC20', withdrawFeeType: 'ratio', transactFeeRateWithdraw: '0.001' },
        ],
      },
    ],
  }
  it('parses fixed-fee rows and drops a ratio row carrying no status', () => {
    expect(parseHtxCurrencies(payload)).toEqual([
      { exchangeId: 'htx', coin: 'usdt', network: 'trc20', withdrawFee: 1, minWithdraw: 10, withdrawEnabled: true },
    ])
  })
})

describe('parseBitgetCoins', () => {
  const payload = {
    code: '00000',
    data: [
      {
        coin: 'SOL',
        chains: [
          { chain: 'SOL', withdrawFee: '0.005', minWithdrawAmount: '0.01', withdrawable: 'true' },
          { chain: 'MADEUP', withdrawFee: '1' },
        ],
      },
    ],
  }
  it('parses fee rows and drops unknown chains', () => {
    expect(parseBitgetCoins(payload)).toEqual([
      { exchangeId: 'bitget', coin: 'sol', network: 'solana', withdrawFee: 0.005, minWithdraw: 0.01, withdrawEnabled: true },
    ])
  })
  it('returns nothing on a non-success code', () => {
    expect(parseBitgetCoins({ code: '40001' })).toEqual([])
  })
})

describe('parsePoloniexCurrencies', () => {
  const payload = [
    { BTC: { blockchain: 'BTC', withdrawalFee: '0.0005', walletState: 'ENABLED' } },
    // multi-chain child: coin comes from parentChain, network from blockchain
    { USDTTRON: { blockchain: 'TRX', withdrawalFee: '1', walletState: 'ENABLED', parentChain: 'USDT' } },
    { OBSCURE: { blockchain: 'OBS', withdrawalFee: '1' } },
  ]
  it('parses direct and multi-chain-child rows', () => {
    expect(parsePoloniexCurrencies(payload)).toEqual([
      { exchangeId: 'poloniex', coin: 'btc', network: 'bitcoin', withdrawFee: 0.0005, withdrawEnabled: true },
      { exchangeId: 'poloniex', coin: 'usdt', network: 'trc20', withdrawFee: 1, withdrawEnabled: true },
    ])
  })
  it('returns nothing for a non-array payload', () => {
    expect(parsePoloniexCurrencies({ error: 'x' })).toEqual([])
  })
})

describe('parseLbankWithdrawConfigs', () => {
  const payload = {
    result: 'true',
    data: [
      { assetCode: 'usdt', chain: 'trc20', fee: '1', min: '10', canWithDraw: true },
      // single-chain asset with no chain field falls back to the asset code
      { assetCode: 'btc', fee: '0.0005', min: '0.001', canWithDraw: true },
    ],
  }
  it('parses rows, falling back to assetCode for the chain', () => {
    expect(parseLbankWithdrawConfigs(payload)).toEqual([
      { exchangeId: 'lbank', coin: 'usdt', network: 'trc20', withdrawFee: 1, minWithdraw: 10, withdrawEnabled: true },
      { exchangeId: 'lbank', coin: 'btc', network: 'bitcoin', withdrawFee: 0.0005, minWithdraw: 0.001, withdrawEnabled: true },
    ])
  })
  it('returns nothing on a failed result', () => {
    expect(parseLbankWithdrawConfigs({ result: 'false' })).toEqual([])
  })
})

describe('parseBitfinexTxFees', () => {
  const payload = [[['BTC', ['0', '0.0004']], ['UST', ['0', '15']], ['USTT', ['0', '1']], ['ZZZ', ['0', '9']]]]
  it('maps only explicitly-listed codes (no chain guessing)', () => {
    expect(parseBitfinexTxFees(payload)).toEqual([
      { exchangeId: 'bitfinex', coin: 'btc', network: 'bitcoin', withdrawFee: 0.0004 },
      // UST is ERC-20 tether on Bitfinex; USTT (TRC-20) is deliberately unmapped
      { exchangeId: 'bitfinex', coin: 'usdt', network: 'erc20', withdrawFee: 15 },
    ])
  })
  it('returns nothing for a malformed payload', () => {
    expect(parseBitfinexTxFees({ nope: 1 })).toEqual([])
  })
})

describe('parseXtSupportCurrency', () => {
  const payload = {
    rc: 0,
    result: [
      {
        currency: 'usdt',
        supportChains: [
          { chain: 'Tron', withdrawFeeAmount: '1', withdrawEnabled: true },
          { chain: 'Bitcoin Cash', withdrawFeeAmount: '1' },
        ],
      },
    ],
  }
  it('parses fee rows and drops unmapped chains', () => {
    expect(parseXtSupportCurrency(payload)).toEqual([
      { exchangeId: 'xtcom', coin: 'usdt', network: 'trc20', withdrawFee: 1, withdrawEnabled: true },
    ])
  })
  it('returns nothing on a non-zero rc', () => {
    expect(parseXtSupportCurrency({ rc: 1 })).toEqual([])
  })
})

describe('buildFeeOverrideMap — overlay-only rule', () => {
  it('keeps rows matching curated routes and drops the rest', () => {
    // A row every exchange table carries: bybit holds usdt/trc20
    const bybitUsdt = EXCHANGES.find(e => e.id === 'bybit')!.coins.usdt!
    expect(bybitUsdt.networks.some(n => n.networkId === 'trc20')).toBe(true)

    const rows: ParsedFeeRow[] = [
      { exchangeId: 'bybit', coin: 'usdt', network: 'trc20', withdrawFee: 1.23 },
      // curated table has no such route → must be dropped, not added
      { exchangeId: 'bybit', coin: 'ltc', network: 'erc20', withdrawFee: 9 },
      // exchange we have no live adapter relationship with in the table
      { exchangeId: 'not-an-exchange', coin: 'btc', network: 'bitcoin', withdrawFee: 1 },
    ]
    const { overrides, applied, skipped } = buildFeeOverrideMap(rows)
    expect(applied).toBe(1)
    expect(skipped).toBe(2)
    expect(overrides.bybit?.usdt?.trc20?.withdrawFee).toBe(1.23)
    expect(overrides.bybit?.ltc).toBeUndefined()
  })
})

describe('findTransferPaths with live overrides', () => {
  const fees: NetworkFeeMap = {
    trc20: { feeNative: 0.5, feeUsd: 0.5, nativeToken: 'TRX', source: 'estimate' },
    erc20: { feeNative: 0.002, feeUsd: 6, nativeToken: 'ETH', source: 'estimate' },
  } as NetworkFeeMap
  const prices: CoinPriceMap = { usdt: 1 } as CoinPriceMap

  it('uses the live fee for the withdrawing exchange and tags the hop', () => {
    const { overrides } = buildFeeOverrideMap([
      { exchangeId: 'bybit', coin: 'usdt', network: 'trc20', withdrawFee: 2.5 },
    ])
    const paths = findTransferPaths('bybit', 'wallet', 'usdt', 1000, fees, prices, overrides)
    const trc = paths.find(p => p.networkId === 'trc20')!
    expect(trc.exchangeFeeCoin).toBe(2.5)
    expect(trc.hops[0].feeLive).toBe(true)
  })

  it('surfaces a live-reported suspension as a visible blocked route, not a silent drop', () => {
    const { overrides } = buildFeeOverrideMap([
      { exchangeId: 'bybit', coin: 'usdt', network: 'trc20', withdrawFee: 2.5, withdrawEnabled: false },
    ])
    const paths = findTransferPaths('bybit', 'wallet', 'usdt', 1000, fees, prices, overrides, '7:52 PM')
    const trc = paths.find(p => p.networkId === 'trc20')
    // The route must still appear — vanishing tells the user nothing
    expect(trc).toBeDefined()
    expect(trc!.isViable).toBe(false)
    expect(trc!.blockedReason).toBe('withdrawals-suspended')
    // and it must attribute the claim to the live source, with its timestamp
    const w = trc!.warnings.find(w => w.title === 'Withdrawals suspended')!
    expect(w.type).toBe('danger')
    expect(w.message).toContain('public API')
    expect(w.message).toContain('7:52 PM')
    // a suspended route is never presented as costing anything
    expect(trc!.totalFeeUsd).toBe(0)
    expect(trc!.isRecommended).toBe(false)
  })

  it('does not claim a live check when the adapter reported no availability flag', () => {
    // fee present, withdrawEnabled absent → liveFee true, liveAvailability unset
    const { overrides } = buildFeeOverrideMap([
      { exchangeId: 'bybit', coin: 'usdt', network: 'trc20', withdrawFee: 2.5 },
    ])
    const paths = findTransferPaths('bybit', 'wallet', 'usdt', 1000, fees, prices, overrides)
    const trc = paths.find(p => p.networkId === 'trc20')!
    expect(trc.hops[0].feeLive).toBe(true)
    expect(trc.isViable).toBe(true)
    expect(trc.blockedReason).toBeUndefined()
  })

  it('labels a below-minimum block distinctly from a suspension', () => {
    const paths = findTransferPaths('bybit', 'wallet', 'usdt', 0.0001, fees, prices)
    const blocked = paths.filter(p => !p.isViable && p.type !== 'no-path')
    expect(blocked.length).toBeGreaterThan(0)
    expect(blocked.every(p => p.blockedReason === 'below-minimum')).toBe(true)
  })

  it('is byte-identical to the static result when no overrides are passed', () => {
    const a = findTransferPaths('bybit', 'wallet', 'usdt', 1000, fees, prices)
    const b = findTransferPaths('bybit', 'wallet', 'usdt', 1000, fees, prices, undefined)
    expect(a).toEqual(b)
    expect(a.every(p => p.hops.every(h => !h.feeLive))).toBe(true)
  })
})

describe('status survives an unparseable fee (the suspension is the point)', () => {
  const fees: NetworkFeeMap = {
    trc20: { feeNative: 0.5, feeUsd: 0.5, nativeToken: 'TRX', source: 'estimate' },
    erc20: { feeNative: 0.002, feeUsd: 6, nativeToken: 'ETH', source: 'estimate' },
  } as NetworkFeeMap
  const prices: CoinPriceMap = { usdt: 1 } as CoinPriceMap

  it('keeps an HTX ratio-fee chain as a status-only row instead of discarding it', () => {
    // HTX quotes some chains on a ratio basis. The fee does not map to a
    // per-withdrawal amount — but "withdrawals prohibited" still does, and
    // dropping the row would fall back to the 2025 snapshot's "open".
    const rows = parseHtxCurrencies({
      code: 200,
      data: [{
        currency: 'usdt',
        chains: [{ displayName: 'ERC20', withdrawFeeType: 'ratio', transactFeeRateWithdraw: '0.001', withdrawStatus: 'prohibited' }],
      }],
    })
    expect(rows).toEqual([
      { exchangeId: 'htx', coin: 'usdt', network: 'erc20', withdrawFee: undefined, minWithdraw: undefined, withdrawEnabled: false },
    ])
  })

  it('a status-only override blocks the route without promoting the stored fee to live', () => {
    const { overrides, availabilityRows } = buildFeeOverrideMap([
      { exchangeId: 'bybit', coin: 'usdt', network: 'trc20', withdrawEnabled: false },
    ])
    expect(availabilityRows).toEqual(['bybit:usdt:trc20'])
    const paths = findTransferPaths('bybit', 'wallet', 'usdt', 1000, fees, prices, overrides, '4:10 PM')
    const trc = paths.find(p => p.networkId === 'trc20')!
    expect(trc.blockedReason).toBe('withdrawals-suspended')
  })

  it('tracks availability coverage per row, not per exchange', () => {
    // one row reports status, another reports only a fee — the second must not
    // inherit "status checked" from the first
    const { availabilityRows } = buildFeeOverrideMap([
      { exchangeId: 'bybit', coin: 'usdt', network: 'trc20', withdrawFee: 1, withdrawEnabled: true },
      { exchangeId: 'bybit', coin: 'usdt', network: 'erc20', withdrawFee: 3 },
    ])
    expect(availabilityRows).toEqual(['bybit:usdt:trc20'])
  })

  it('marks availabilityLive only on the hop whose status was reported', () => {
    const { overrides } = buildFeeOverrideMap([
      { exchangeId: 'bybit', coin: 'usdt', network: 'trc20', withdrawFee: 1, withdrawEnabled: true },
    ])
    const paths = findTransferPaths('bybit', 'wallet', 'usdt', 1000, fees, prices, overrides)
    const trc = paths.find(p => p.networkId === 'trc20')!
    expect(trc.hops[0].availabilityLive).toBe(true)
    for (const p of paths.filter(p => p.networkId !== 'trc20' && p.hops.length)) {
      expect(p.hops[0].availabilityLive).toBeFalsy()
    }
  })
})
