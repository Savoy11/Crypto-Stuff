// Query-param normalization for the crypto price-history route
// (/live-data/chart). Lives in lib/ rather than the route because Next.js App
// Router route files may only export route handlers and config — a value export
// there fails the build's route-type check.

/**
 * Normalize the `days` query param to a value CoinGecko's market_chart accepts.
 *
 * `'max'` (full history) is as valid to CoinGecko as a positive number, and the
 * Compare page's MAX range sends exactly that. A numeric-only guard rejected it —
 * `Number('max')` is NaN — and silently substituted 365, so MAX returned one year
 * of history presented as the whole series, with no error anywhere to notice. The
 * damage compounded downstream: `commonStartTime()` takes the LATEST first
 * timestamp across series, so one truncated crypto leg clipped the shared
 * comparison window for every other symbol too.
 *
 * Tested because this is a client/server vocabulary contract — the same class of
 * mismatch as the macro TA 2Y range (D-2), where one side speaks a value the
 * other silently refuses.
 */
export function normalizeDaysParam(raw: string | null | undefined): string {
  const value = raw ?? '365'
  if (value === 'max') return 'max'
  return Number.isFinite(Number(value)) && Number(value) > 0 ? value : '365'
}
