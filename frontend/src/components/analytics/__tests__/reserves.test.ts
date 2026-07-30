import { describe, it, expect } from 'vitest'
import { normalisePegMechanism, toReserveRows } from '../reserves'
import type { LiveReserveAsset } from '@/app/live-data/reserves/route'

// The reserve UI existed in three hand-maintained copies until 2026-07-29, and
// the accuracy fixes only ever landed on one of them — the standalone page,
// which was also the one nothing linked to. These tests pin the two pieces of
// logic that were wrong on the surfaces users actually reach, so a future
// re-divergence fails here instead of shipping.

describe('normalisePegMechanism', () => {
  it('accepts the hyphenated form DefiLlama actually emits', () => {
    expect(normalisePegMechanism('fiat-backed')).toBe('fiat-backed')
    expect(normalisePegMechanism('crypto-backed')).toBe('crypto-backed')
  })

  it('accepts the underscored form too — the copy inside /assets keyed on this', () => {
    // The bug: the badge lookup table used underscore keys while the feed sent
    // hyphens, so 8 of the 9 monitored coins fell through to the default style
    // and printed the raw string. 'algorithmic' has no separator, which is why
    // it matched either way and made the badge look like it worked.
    expect(normalisePegMechanism('fiat_backed')).toBe('fiat-backed')
    expect(normalisePegMechanism('crypto_backed')).toBe('crypto-backed')
  })

  it('replaces every separator, not just the first', () => {
    // `.replace('_', '-')` — the coin detail page's old version — is not global.
    expect(normalisePegMechanism('a_b_c')).toBe('a-b-c')
  })

  it('lower-cases so casing cannot split one mechanism into two', () => {
    expect(normalisePegMechanism('Fiat_Backed')).toBe('fiat-backed')
  })

  it('passes through algorithmic unchanged', () => {
    expect(normalisePegMechanism('algorithmic')).toBe('algorithmic')
  })
})

const asset = (over: Partial<LiveReserveAsset> = {}): LiveReserveAsset => ({
  id: 'usdc',
  symbol: 'USDC',
  name: 'USD Coin',
  attester: 'Deloitte',
  lastAttestedDate: '2026-06-30',
  attestationUrl: 'https://example.test/report',
  circulatingUsd: 1_000,
  collateralizationRatio: 1.02,
  chains: ['Ethereum'],
  composition: [],
  pegMechanism: 'fiat-backed',
  ...over,
} as LiveReserveAsset)

describe('toReserveRows', () => {
  it('reports a disclosed ratio as disclosed, not as verified', () => {
    // The field was named `verified` and surfaced as "Verified Attestations …
    // by third-party auditor". Nothing is independently verified — it only
    // means the issuer published a number.
    const [row] = toReserveRows([asset({ collateralizationRatio: 1.02 })])
    expect(row.hasDisclosedRatio).toBe(true)
  })

  it('treats a null ratio as undisclosed rather than as zero', () => {
    const [row] = toReserveRows([asset({ collateralizationRatio: null })])
    expect(row.hasDisclosedRatio).toBe(false)
    // Must stay null: coercing to 0 would render a 0% collateralization bar,
    // which reads as "catastrophically under-collateralized" rather than
    // "the issuer does not publish this".
    expect(row.collateralizationRatio).toBeNull()
  })

  it('substitutes an explicit Undisclosed slice when composition is empty', () => {
    const [row] = toReserveRows([asset({ composition: [], circulatingUsd: 500 })])
    expect(row.composition).toHaveLength(1)
    expect(row.composition[0]).toMatchObject({
      category: 'Undisclosed',
      amount: 500,
      percentage: 100,
    })
  })

  it('preserves a real composition breakdown', () => {
    const [row] = toReserveRows([asset({
      composition: [{ category: 'T-Bills', amount: 800, percentage: 80 }],
    } as Partial<LiveReserveAsset>)])
    expect(row.composition[0].category).toBe('T-Bills')
    expect(row.composition[0].percentage).toBe(80)
  })

  it('returns an empty list rather than throwing when there is no data', () => {
    expect(toReserveRows(undefined)).toEqual([])
  })
})
