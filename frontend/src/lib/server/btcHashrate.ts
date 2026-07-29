/**
 * Normalise Bitcoin network hashrate to TH/s, whatever unit the upstream sent.
 *
 * Lives here rather than in the route file because a Next route module must
 * export only handlers and route config — exporting a helper from one is what
 * broke production builds in audit finding C1.
 *
 * ── Why this is not a one-line division ──────────────────────────────────────
 *
 * `/live-data/btc-stats` did:
 *
 *     hashrateTHs = s.hash_rate / 1e12        // assumes H/s
 *
 * blockchain.info's `/stats` returns `hash_rate` in **GH/s**, so that divided a
 * gigahash figure as though it were hashes — off by 10⁹. The 2026-07-29 audit
 * caught it twice, a day apart, both times reporting `hashrate=0 EH/s` while
 * block height advanced normally: ~8×10¹¹ GH/s / 1e12 = 0.8 TH/s, which renders
 * as 0.0000008 EH/s, i.e. `0`. Classified REAL, because the response was
 * otherwise healthy — a wrong field inside a live payload, which is the one
 * thing the REAL/FALLBACK split cannot catch on its own.
 *
 * Swapping the constant to /1e3 would fix today and break the day the upstream
 * changes units or we swap providers — and it would break *upward*, printing a
 * hashrate 10⁹ too large, which is worse than a zero because it looks plausible
 * at a glance. So instead of trusting a documented unit, this infers it from
 * magnitude: Bitcoin's hashrate is a known quantity, and the candidate
 * interpretations are ~10⁹ apart, so only one can land in a plausible band.
 *
 * When nothing lands, it returns null — the UI already renders null as "not
 * available", which is honest. A zero is not.
 */

/**
 * Plausible band for the Bitcoin network hashrate, in TH/s.
 *
 * Lower: 1e7 TH/s = 10 EH/s. The network passed that in 2018 and would have to
 * shed ~98% of its hashrate to return — possible in principle, but it would be
 * a headline event, and returning nothing is the right response to a reading
 * that extraordinary. An earlier draft used 1e5 (0.1 EH/s), which happily
 * accepted a raw `0.5` as "0.5 EH/s" — 1600x below reality, and exactly the
 * kind of quietly-wrong number this function exists to refuse.
 * Upper: 1e12 TH/s = 1 YH/s, ~10^3x today's figure — generous headroom, since
 * the band is a plausibility check, not a growth forecast.
 */
const MIN_PLAUSIBLE_THS = 1e7
const MAX_PLAUSIBLE_THS = 1e12

/** Divisor to TH/s for each unit the upstream might plausibly be using. */
const UNIT_DIVISORS: ReadonlyArray<{ unit: string; perTHs: number }> = [
  { unit: 'H/s', perTHs: 1e12 },
  { unit: 'KH/s', perTHs: 1e9 },
  { unit: 'MH/s', perTHs: 1e6 },
  { unit: 'GH/s', perTHs: 1e3 },
  { unit: 'TH/s', perTHs: 1 },
  { unit: 'PH/s', perTHs: 1e-3 },
  { unit: 'EH/s', perTHs: 1e-6 },
]

export interface HashrateReading {
  /** Normalised to TH/s, or null when no interpretation was plausible. */
  hashrateTHs: number | null
  /** Which unit the raw value was taken to be. null when unresolved. */
  assumedUnit: string | null
}

/**
 * @param raw `hash_rate` exactly as the upstream sent it.
 */
export function normaliseHashrate(raw: unknown): HashrateReading {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
    return { hashrateTHs: null, assumedUnit: null }
  }

  const candidates = UNIT_DIVISORS
    .map(({ unit, perTHs }) => ({ unit, ths: raw / perTHs }))
    .filter((c) => c.ths >= MIN_PLAUSIBLE_THS && c.ths <= MAX_PLAUSIBLE_THS)

  if (candidates.length === 0) return { hashrateTHs: null, assumedUnit: null }

  // The band deliberately spans 10⁷ while adjacent units are only 10³ apart, so
  // up to three interpretations can survive it. Narrowing the band to force
  // uniqueness would make this brittle — it would start rejecting real readings
  // the moment the network grew past an arbitrary ceiling.
  //
  // So disambiguate by *order of magnitude* instead: pick whichever candidate
  // sits closest to the known scale of the network, compared in log space
  // because the choices are multiplicative. Units are 1000× apart and the
  // hashrate moves nowhere near that fast, so the nearest one is unambiguous
  // and stays correct as the network grows.
  const REFERENCE_THS = 1e9 // 1000 EH/s — the right order of magnitude for 2026
  const distance = (ths: number) => Math.abs(Math.log10(ths) - Math.log10(REFERENCE_THS))
  const best = candidates.reduce((a, b) => (distance(a.ths) <= distance(b.ths) ? a : b))
  return { hashrateTHs: best.ths, assumedUnit: best.unit }
}
