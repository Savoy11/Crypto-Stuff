import { describe, it, expect } from 'vitest'
import {
  normalizeSymbol,
  normalizeChain,
  parseBybitCoinInfo,
  parseKucoinCurrencies,
  parseHtxCurrencies,
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

describe('parseBybitCoinInfo', () => {
  const payload = {
    retCode: 0,
    result: {
      rows: [
        {
          coin: 'USDT',
          chains: [
            { chain: 'TRX', withdrawFee: '1', withdrawMin: '10', chainWithdraw: '1' },
            { chain: 'ETH', withdrawFee: '', withdrawMin: '20', chainWithdraw: '1' }, // empty fee = unknown
            { chain: 'MADEUPCHAIN', withdrawFee: '1', chainWithdraw: '1' },
          ],
        },
        { coin: 'WEIRDCOIN', chains: [{ chain: 'ETH', withdrawFee: '1' }] },
      ],
    },
  }
  it('parses fee rows and maps chain names', () => {
    const rows = parseBybitCoinInfo(payload)
    expect(rows).toEqual([
      { exchangeId: 'bybit', coin: 'usdt', network: 'trc20', withdrawFee: 1, minWithdraw: 10, withdrawEnabled: true },
    ])
  })
  it('drops empty fees (unknown is not zero) and unknown coins/chains', () => {
    const rows = parseBybitCoinInfo(payload)
    expect(rows.some(r => r.network === 'erc20')).toBe(false)
  })
  it('returns nothing on an error payload', () => {
    expect(parseBybitCoinInfo({ retCode: 10001 })).toEqual([])
    expect(parseBybitCoinInfo(null)).toEqual([])
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
          // ratio-type fees don't map to a flat per-withdrawal amount — skipped
          { displayName: 'ERC20', withdrawFeeType: 'ratio', transactFeeRateWithdraw: '0.001' },
        ],
      },
    ],
  }
  it('parses fixed-fee rows and skips ratio fees', () => {
    expect(parseHtxCurrencies(payload)).toEqual([
      { exchangeId: 'htx', coin: 'usdt', network: 'trc20', withdrawFee: 1, minWithdraw: 10, withdrawEnabled: true },
    ])
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

  it('is byte-identical to the static result when no overrides are passed', () => {
    const a = findTransferPaths('bybit', 'wallet', 'usdt', 1000, fees, prices)
    const b = findTransferPaths('bybit', 'wallet', 'usdt', 1000, fees, prices, undefined)
    expect(a).toEqual(b)
    expect(a.every(p => p.hops.every(h => !h.feeLive))).toBe(true)
  })
})
