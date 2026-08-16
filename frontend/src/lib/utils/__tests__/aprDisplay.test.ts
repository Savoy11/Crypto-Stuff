import { describe, it, expect } from 'vitest'
import { aprDisplay, resolveLiveAprKey } from '../aprDisplay'
import { DEFAULT_LIVE_APR_KEY, type StakingProvider, type StakingCoinId } from '@/lib/data/stakingProviders'

type Asset = StakingProvider['assets'][StakingCoinId]

const provider = (category: StakingProvider['category']) =>
  ({ category } as StakingProvider)

const asset = (liveAprKey?: string) => ({ liveAprKey } as Asset)

describe('aprDisplay', () => {
  it('shows the static APR, unlabelled, when the row has no live key at all', () => {
    expect(aprDisplay(4.2, undefined, { lido_eth: 3.1 }, { lido_eth: 'live' }))
      .toEqual({ apr: 4.2, live: false })
  })

  it('shows the live rate with the live badge when its own key resolves as live', () => {
    expect(aprDisplay(4.2, 'lido_eth', { lido_eth: 3.1 }, { lido_eth: 'live' }))
      .toEqual({ apr: 3.1, live: true })
  })

  it('shows a resolved rate WITHOUT the live badge when the feed marks it an estimate', () => {
    expect(aprDisplay(4.2, 'lido_eth', { lido_eth: 3.1 }, { lido_eth: 'estimate' }))
      .toEqual({ apr: 3.1, live: false })
  })

  it('falls back to the static APR, unlabelled, when the key has no rate in the feed', () => {
    expect(aprDisplay(4.2, 'coinbase_eth', {}, {})).toEqual({ apr: 4.2, live: false })
  })

  it('treats a 0% live rate as a real rate, not a miss', () => {
    expect(aprDisplay(4.2, 'native_sol', { native_sol: 0 }, { native_sol: 'live' }))
      .toEqual({ apr: 0, live: true })
  })
})

describe('resolveLiveAprKey', () => {
  it('always honors an explicit per-asset key, regardless of category', () => {
    expect(resolveLiveAprKey(provider('cefi'), 'eth', asset('coinbase_eth'))).toBe('coinbase_eth')
    expect(resolveLiveAprKey(provider('wallet'), 'sol', asset('custom_sol'))).toBe('custom_sol')
  })

  it('gives wallets the network base-rate key for non-ETH coins', () => {
    expect(resolveLiveAprKey(provider('wallet'), 'sol', asset())).toBe(DEFAULT_LIVE_APR_KEY.sol)
    expect(resolveLiveAprKey(provider('wallet'), 'atom', asset())).toBe(DEFAULT_LIVE_APR_KEY.atom)
  })

  it('never defaults wallet ETH — one LST rate is not "the" wallet ETH rate', () => {
    expect(resolveLiveAprKey(provider('wallet'), 'eth', asset())).toBeUndefined()
  })

  it('never defaults CeFi or liquid providers — their rates are not the raw network rate', () => {
    expect(resolveLiveAprKey(provider('cefi'), 'sol', asset())).toBeUndefined()
    expect(resolveLiveAprKey(provider('liquid'), 'sol', asset())).toBeUndefined()
  })

  it('returns undefined for an undefined asset row', () => {
    expect(resolveLiveAprKey(provider('cefi'), 'sol', undefined)).toBeUndefined()
  })
})
