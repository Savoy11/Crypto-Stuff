/**
 * Common-structure presets for the Trade Risk Scorer (P2-O2).
 *
 * Presets prefill STRUCTURE — sides, types, and strikes derived from the
 * underlying price — and nothing else. Bid/ask, open interest and delta stay
 * empty because we do not have a chain feed (that is P2-O3, gated on the
 * P2-O1 data audit): prefililng a price we cannot source would be fabrication,
 * and the page tells the user to copy those numbers from their broker's chain.
 *
 * Pure functions, tested. The UI treats the output as a starting point;
 * everything remains editable.
 */

export type PresetId = 'covered-call' | 'cash-secured-put' | 'bull-call-spread' | 'iron-condor'

/** A leg with structure filled in and market data left for the user. */
export interface PresetLeg {
  side: 'long' | 'short'
  type: 'call' | 'put'
  strike: number
}

export interface PresetResult {
  legs: PresetLeg[]
  /**
   * Worst-case loss in USD where the STRUCTURE alone determines it, before
   * premium (which we don't know): a cash-secured put can lose at most
   * strike × 100. Undefined where max loss depends on premium paid or on
   * stock owned alongside — guessing those would understate or overstate.
   */
  maxLossUsd?: number
  /** Shown beside the prefilled trade — what this structure assumes. */
  note: string
}

export interface PresetInfo {
  id: PresetId
  label: string
  description: string
}

export const PRESETS: PresetInfo[] = [
  {
    id: 'covered-call',
    label: 'Covered call',
    description: 'Short a call ~5% above spot against 100 shares you own',
  },
  {
    id: 'cash-secured-put',
    label: 'Cash-secured put',
    description: 'Short a put ~5% below spot, cash reserved to take assignment',
  },
  {
    id: 'bull-call-spread',
    label: 'Bull call spread',
    description: 'Long a call at the money, short one ~5% above — defined risk both ways',
  },
  {
    id: 'iron-condor',
    label: 'Iron condor',
    description: 'Short strangle ~5% out, long wings ~10% out — income if price stays in the range',
  },
]

/**
 * Round a computed strike onto the exchange's typical strike grid. Real
 * chains vary by underlying; these increments match common US listings well
 * enough for a prefill the user will adjust anyway.
 */
export function roundToStrike(price: number): number {
  if (!Number.isFinite(price) || price <= 0) return 0
  const increment = price < 25 ? 0.5 : price < 100 ? 1 : price < 250 ? 5 : 10
  return Math.round(price / increment) * increment
}

/**
 * Build a preset's legs from the underlying price. Throws on a non-positive
 * price — a structure anchored to nothing is not a prefill, it's noise.
 */
export function buildPreset(id: PresetId, underlyingPrice: number): PresetResult {
  if (!Number.isFinite(underlyingPrice) || underlyingPrice <= 0) {
    throw new RangeError('Preset needs a positive underlying price')
  }
  const at = (pct: number) => roundToStrike(underlyingPrice * pct)

  switch (id) {
    case 'covered-call':
      return {
        legs: [{ side: 'short', type: 'call', strike: at(1.05) }],
        // Max loss is the stock's downside, which depends on the shares — not
        // the option structure. Leave it to the user rather than misstate it.
        note: 'Assumes you own 100 shares per contract — the short call alone is naked. '
          + 'Max loss is the stock’s downside, so set it from your share cost basis.',
      }
    case 'cash-secured-put':
      return {
        legs: [{ side: 'short', type: 'put', strike: at(0.95) }],
        maxLossUsd: at(0.95) * 100,
        note: 'Worst case is assignment at the strike with the stock at zero: strike × 100, '
          + 'less the premium collected.',
      }
    case 'bull-call-spread':
      return {
        legs: [
          { side: 'long', type: 'call', strike: at(1.0) },
          { side: 'short', type: 'call', strike: at(1.05) },
        ],
        // Max loss = net debit paid, which needs the prices we don't prefill.
        note: 'Max loss is the net debit paid — fill it in once you’ve entered both legs’ prices.',
      }
    case 'iron-condor': {
      const shortPut = at(0.95)
      const longPut = at(0.9)
      return {
        legs: [
          { side: 'long', type: 'put', strike: longPut },
          { side: 'short', type: 'put', strike: shortPut },
          { side: 'short', type: 'call', strike: at(1.05) },
          { side: 'long', type: 'call', strike: at(1.1) },
        ],
        // Wing width bounds the loss before credit; put and call wings can
        // differ after strike rounding, and the worst case is the wider one.
        maxLossUsd: Math.max(shortPut - longPut, at(1.1) - at(1.05)) * 100,
        note: 'Worst case is one wing’s width × 100, less the credit collected.',
      }
    }
  }
}
