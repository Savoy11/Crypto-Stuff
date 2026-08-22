import { describe, it, expect } from 'vitest'
import {
  feeFromGasPriceHex,
  EVM_LIVE_GAS,
  EVM_TOKEN_TRANSFER_GAS,
  NETWORK_GAS,
  FEE_PROVIDERS,
} from '../networkFees'

describe('feeFromGasPriceHex — unit conversion', () => {
  it('converts wei to native units at a realistic gas price', () => {
    // 30 gwei = 3e10 wei; x 65,000 gas = 0.00195 ETH
    const fee = feeFromGasPriceHex('0x6FC23AC00', 65_000)!
    expect(fee).toBeCloseTo(0.00195, 8)
  })

  it('scales linearly with the gas price', () => {
    const a = feeFromGasPriceHex('0x6FC23AC00', 65_000)!   // 30 gwei
    const b = feeFromGasPriceHex('0xDF8475800', 65_000)!   // 60 gwei
    expect(b / a).toBeCloseTo(2, 6)
  })

  it('accepts upper- and lower-case hex', () => {
    expect(feeFromGasPriceHex('0x6fc23ac00', 65_000))
      .toBe(feeFromGasPriceHex('0x6FC23AC00', 65_000))
  })

  // Every one of these must fall back to the static estimate, never to zero:
  // a fee of 0 would render as "Free" on a route the user then underfunds.
  it('returns null — never zero — for anything unusable', () => {
    for (const bad of [undefined, null, '', '0x', 'abc', '123', '0xZZ', 0, {}, [], '0x0']) {
      expect(feeFromGasPriceHex(bad, 65_000), `${JSON.stringify(bad)}`).toBeNull()
    }
  })

  it('rejects an absurd reading rather than printing a headline dollar figure', () => {
    // 1e6 gwei — a malfunctioning node or a units mistake
    expect(feeFromGasPriceHex('0xE8D4A51000000', 65_000)).toBeNull()
  })
})

describe('EVM live-gas registration', () => {
  it('covers only EVM L1s — L2 gas prices understate the L1 data fee', () => {
    expect(Object.keys(EVM_LIVE_GAS).sort()).toEqual(['avalanche', 'bep20', 'erc20', 'polygon'])
    // Explicitly excluded: an OP-stack/Arbitrum fee is dominated by the L1
    // component, which eth_gasPrice does not report.
    for (const l2 of ['arbitrum', 'optimism', 'base']) {
      expect(EVM_LIVE_GAS[l2 as keyof typeof EVM_LIVE_GAS], l2).toBeUndefined()
    }
  })

  it('registers one provider per live-gas network, plus bitcoin', () => {
    const networks = FEE_PROVIDERS.map(p => p.network).sort()
    expect(networks).toEqual(['avalanche', 'bep20', 'bitcoin', 'erc20', 'polygon'])
  })

  it('every configured network exists in NETWORK_GAS and has usable endpoints', () => {
    for (const [network, cfg] of Object.entries(EVM_LIVE_GAS)) {
      expect(NETWORK_GAS[network as keyof typeof NETWORK_GAS], network).toBeDefined()
      expect(cfg!.rpcUrls.length, network).toBeGreaterThan(0)
      for (const u of cfg!.rpcUrls) expect(u.startsWith('https://'), u).toBe(true)
      expect(cfg!.gasLimit).toBe(EVM_TOKEN_TRANSFER_GAS)
    }
  })

  // A live gas price against a wrong gas limit is still a wrong fee. This pins
  // the assumption in view: at ordinary gas prices the live figure should land
  // in the same ballpark as the hand-set estimate it replaces.
  it('produces a fee of the same order as the static estimate it replaces', () => {
    const live = feeFromGasPriceHex('0x6FC23AC00', EVM_TOKEN_TRANSFER_GAS)!  // 30 gwei
    const stat = NETWORK_GAS.erc20.native
    expect(live).toBeGreaterThan(stat / 10)
    expect(live).toBeLessThan(stat * 10)
  })
})
