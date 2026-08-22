/**
 * The shared per-coin OHLCV sweep (option B).
 *
 * ONE sweep, TWO readers. /scanner already fetched candles per coin under a
 * concurrency cap and computed RSI-14 and price-vs-SMA50 inline; the Coins
 * screener needs the same two numbers. Rather than a second implementation —
 * which would double the request pressure on a rate-limited free tier AND let
 * the two pages disagree about what "RSI 30" means — the fetch and the maths
 * live here, and both surfaces read the same React Query cache.
 *
 * WHAT THIS COSTS, stated because it is the reason the sweep is opt-in:
 * one request per coin. The whole tracked universe is ~80 coins at a
 * concurrency of 5, so a cold sweep is ~16 sequential waves. It runs only when
 * a technical rule is actually active — a screener nobody opened must not cost
 * a single upstream call.
 *
 * THE LIMIT THIS DESIGN HAS. Sweeping client-side is only correct while the
 * whole universe fits in one sweep, because the screener's invariant is that
 * filters run over the dataset and not the visible page. Past roughly 250
 * coins that stops being interactive, and the answer is a server-side
 * precomputed snapshot on a paid data tier — NOT sweeping just the page on
 * screen, which would filter as though it had seen everything.
 */

import { rsi, sma, type OhlcvCandle } from '@/lib/utils/indicators'
import { runPool } from '@/lib/utils/runPool'

/** Matches /scanner's cap. Raising it rate-limits the provider, not speeds it up. */
export const SWEEP_CONCURRENCY = 5

/** Daily candles over a year — enough history for a 200-period average. */
export const SWEEP_RANGE = '1Y'

export interface TechnicalRow {
  /** Relative Strength Index, 14 periods. Null when history is too short. */
  rsi14: number | null
  /** Last close vs its 50-period simple moving average, in percent. */
  vsSma50Pct: number | null
  /** Last close vs its 200-period simple moving average, in percent. */
  vsSma200Pct: number | null
}

const EMPTY: TechnicalRow = { rsi14: null, vsSma50Pct: null, vsSma200Pct: null }

/**
 * The maths, split out from the fetching so it is testable without a network
 * and so /scanner and the Coins screener cannot drift apart on it.
 *
 * Every field is null rather than 0 when the series is too short to support it.
 * A 60-candle coin has no 200-day average, and reporting one as "0% from its
 * SMA200" would put a coin with no such average in the middle of the pack.
 */
export function computeTechnicals(candles: OhlcvCandle[]): TechnicalRow {
  if (candles.length === 0) return EMPTY
  const closes = candles.map(c => c.close)
  const last = closes[closes.length - 1]
  if (!Number.isFinite(last)) return EMPTY

  const vsSma = (period: number): number | null => {
    // An SMA needs `period` closes. The indicator helpers pad their output, so
    // the length check is on the INPUT — a padded tail value is not an average.
    if (closes.length < period) return null
    const series = sma(closes, period)
    const value = series[series.length - 1]
    return value && Number.isFinite(value) ? ((last - value) / value) * 100 : null
  }

  const rsiSeries = closes.length >= 15 ? rsi(closes, 14) : []
  const rsiLast = rsiSeries[rsiSeries.length - 1]

  return {
    rsi14: Number.isFinite(rsiLast) ? rsiLast : null,
    vsSma50Pct: vsSma(50),
    vsSma200Pct: vsSma(200),
  }
}

export interface SweepOptions {
  range?: string
  concurrency?: number
  /** Called after each coin resolves, for a progress indicator. */
  onProgress?: (done: number, total: number) => void
  fetchImpl?: typeof fetch
}

/**
 * Sweep the given coin ids and return what each one's candles say.
 *
 * A coin that fails — rate-limited, unlisted, no candles — is simply ABSENT
 * from the returned map. It is never given a zero or a neutral 50 RSI: the
 * screener reads a missing entry as "not tested", which is the truth, and
 * filling it in would silently pass or fail a coin nobody measured. On a
 * rate-limited free tier partial sweeps are the normal case, not the edge one.
 */
export async function sweepTechnicals(
  ids: string[],
  opts: SweepOptions = {},
): Promise<Map<string, TechnicalRow>> {
  const {
    range = SWEEP_RANGE,
    concurrency = SWEEP_CONCURRENCY,
    onProgress,
    fetchImpl = fetch,
  } = opts

  const out = new Map<string, TechnicalRow>()
  let done = 0

  await runPool(ids, concurrency, async (id) => {
    try {
      const res = await fetchImpl(`/live-data/ohlcv?id=${encodeURIComponent(id)}&range=${range}`)
      const json = await res.json()
      const candles: OhlcvCandle[] = json?.candles ?? []
      if (json?.ok && candles.length > 0) out.set(id, computeTechnicals(candles))
    } catch {
      // Left out of the map on purpose — see the doc comment above.
    }
    done += 1
    onProgress?.(done, ids.length)
  })

  return out
}
