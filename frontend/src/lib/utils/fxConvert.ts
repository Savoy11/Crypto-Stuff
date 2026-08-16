// Cross-rate arithmetic for the Macro currency converter. Both fx-rates
// feeds (ECB official + community extended) quote every currency against
// the same base, so any pair converts as rate(to) / rate(from). Pure so
// the dollar figures users act on are testable.

export interface FxConversion {
  /** 1 unit of `from` in `to`. */
  rate: number
  /** 1 unit of `to` in `from`. */
  inverse: number
  /** `amount` converted into `to`. */
  result: number
}

/**
 * Returns null for anything unconvertible — negative or non-finite amounts,
 * and missing OR zero rates (a zero rate would otherwise yield Infinity on
 * the from-leg), so callers render an "unavailable" state instead of a number.
 */
export function convertFx(
  amount: number,
  from: string,
  to: string,
  rates: Record<string, number>,
): FxConversion | null {
  if (!isFinite(amount) || amount < 0) return null
  const rateFrom = rates[from]
  const rateTo = rates[to]
  if (!rateFrom || !rateTo) return null
  const rate = rateTo / rateFrom
  return { rate, inverse: 1 / rate, result: amount * rate }
}
