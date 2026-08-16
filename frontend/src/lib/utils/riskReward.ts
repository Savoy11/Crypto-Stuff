/**
 * Risk/reward derived from the entry/target/invalidation text when all three parse
 * as numbers. Returns null when they don't — we never fabricate a ratio.
 */
export function computeRiskReward(entry: string, target: string, invalidation: string): number | null {
  const e = parseFloat(entry.replace(/[^0-9.]/g, ''))
  const t = parseFloat(target.replace(/[^0-9.]/g, ''))
  const i = parseFloat(invalidation.replace(/[^0-9.]/g, ''))
  if (!isFinite(e) || !isFinite(t) || !isFinite(i)) return null
  const reward = Math.abs(t - e)
  const risk = Math.abs(e - i)
  if (risk === 0) return null
  return reward / risk
}
