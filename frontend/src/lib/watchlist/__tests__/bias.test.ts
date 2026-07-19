import { describe, it, expect } from 'vitest'
import {
  matchesWatchlist, applyBias, shouldAugmentFetch, fetchTerms,
  EMPTY_BIAS, type WatchlistBias,
} from '../bias'

const bias: WatchlistBias = {
  assetIds: ['btc', 'eth', 'ada'],
  symbols: ['AAPL', 'MSFT'],
  terms: ['btc', 'bitcoin', 'eth', 'ethereum', 'ada', 'cardano', 'aapl', 'apple'],
  isEmpty: false,
}

describe('matchesWatchlist', () => {
  it('matches on tagged crypto asset ids', () => {
    expect(matchesWatchlist({ assetIds: ['btc'] }, bias)).toBe(true)
    expect(matchesWatchlist({ assetIds: ['sol'] }, bias)).toBe(false)
  })

  it('matches on tagged tickers, case-insensitively', () => {
    expect(matchesWatchlist({ symbols: ['AAPL'] }, bias)).toBe(true)
    expect(matchesWatchlist({ symbols: ['aapl'] }, bias)).toBe(true)
    expect(matchesWatchlist({ symbols: ['TSLA'] }, bias)).toBe(false)
  })

  it('falls back to text for untagged feeds', () => {
    expect(matchesWatchlist({ text: 'Bitcoin rallies past resistance' }, bias)).toBe(true)
    expect(matchesWatchlist({ text: 'Solana ecosystem update' }, bias)).toBe(false)
  })

  it('requires word boundaries — the bug a substring check would cause', () => {
    // 'ada' inside 'Canada', 'eth' inside 'whether'
    expect(matchesWatchlist({ text: 'Canada announces new policy' }, bias)).toBe(false)
    expect(matchesWatchlist({ text: 'Unclear whether rates move' }, bias)).toBe(false)
    // but the real words still match
    expect(matchesWatchlist({ text: 'ADA staking yields rise' }, bias)).toBe(true)
  })

  it('never matches an empty watchlist', () => {
    expect(matchesWatchlist({ assetIds: ['btc'], text: 'bitcoin' }, EMPTY_BIAS)).toBe(false)
  })
})

describe('applyBias', () => {
  const items = [
    { id: 1, assetIds: ['sol'] },
    { id: 2, assetIds: ['btc'] },
    { id: 3, assetIds: ['doge'] },
    { id: 4, assetIds: ['eth'] },
  ]
  const toBiasable = (i: typeof items[number]) => ({ assetIds: i.assetIds })

  it('off is a no-op', () => {
    expect(applyBias(items, bias, 'off', toBiasable).map((i) => i.id)).toEqual([1, 2, 3, 4])
  })

  it('light lifts matches while preserving order within each group', () => {
    expect(applyBias(items, bias, 'light', toBiasable).map((i) => i.id)).toEqual([2, 4, 1, 3])
  })

  it('strong orders the same as light — the difference is fetching, not sorting', () => {
    expect(applyBias(items, bias, 'strong', toBiasable).map((i) => i.id))
      .toEqual(applyBias(items, bias, 'light', toBiasable).map((i) => i.id))
  })

  it('only drops non-matches', () => {
    expect(applyBias(items, bias, 'only', toBiasable).map((i) => i.id)).toEqual([2, 4])
  })

  it('an empty watchlist is a no-op even on "only" — never silently empties a feed', () => {
    expect(applyBias(items, EMPTY_BIAS, 'only', toBiasable).map((i) => i.id)).toEqual([1, 2, 3, 4])
  })

  it('handles an empty list', () => {
    expect(applyBias([], bias, 'only', toBiasable)).toEqual([])
  })
})

describe('shouldAugmentFetch', () => {
  it('only widens the fetch for strong and only', () => {
    expect(shouldAugmentFetch('off')).toBe(false)
    expect(shouldAugmentFetch('light')).toBe(false)
    expect(shouldAugmentFetch('strong')).toBe(true)
    expect(shouldAugmentFetch('only')).toBe(true)
  })
})

describe('fetchTerms', () => {
  it('caps term count to keep URLs sane', () => {
    expect(fetchTerms(bias, 3)).toEqual(['btc', 'bitcoin', 'eth'])
  })

  it('returns nothing for an empty watchlist', () => {
    expect(fetchTerms(EMPTY_BIAS)).toEqual([])
  })
})
