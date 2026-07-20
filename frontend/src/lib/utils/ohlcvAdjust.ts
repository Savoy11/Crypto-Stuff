import type { OhlcvCandle } from '@/lib/utils/indicators'

/**
 * Rescale raw OHLC by the per-bar split+dividend adjustment factor
 * (adjClose / close), so a split shows a continuous series instead of a
 * catastrophic price cliff that every indicator would read as a crash. Also
 * keeps providers consistent: Yahoo, Tiingo, and FMP must not yield different
 * indicator output for the same symbol just because a different one answered.
 *
 * `adjCloses` is a parallel array (same length/order as `candles`). When an
 * adjusted close is missing / non-finite or the raw close is non-positive, that
 * bar passes through unchanged (factor 1) — never produces NaN. Volume is left
 * as the provider reports it (price is what breaks indicators across a split).
 */
export function adjustCandles(
  candles: OhlcvCandle[],
  adjCloses: Array<number | null | undefined>,
): OhlcvCandle[] {
  return candles.map((c, i) => {
    const adj = adjCloses[i]
    // Passthrough on any degenerate input (review-hardened): a missing/non-finite
    // or non-positive adjClose, or a missing/non-finite/non-positive raw close.
    // A NaN close would otherwise produce NaN OHL (NaN <= 0 is false), and an
    // adjClose of 0 would zero the whole candle and poison every indicator.
    if (adj == null || !Number.isFinite(adj) || adj <= 0) return c
    if (!Number.isFinite(c.close) || c.close <= 0) return c
    const f = adj / c.close
    return { time: c.time, open: c.open * f, high: c.high * f, low: c.low * f, close: adj, volume: c.volume }
  })
}
