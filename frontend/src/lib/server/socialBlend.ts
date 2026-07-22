// Fair-share blending of feed items across providers.
//
// Pure logic, generic over anything with a timestamp — it lives here rather
// than in the route so it can be unit-tested, and so any other multi-provider
// feed can reuse it. See __tests__/socialBlend.test.ts.

export interface Timestamped {
  publishedAt: string
}

export const byRecency = (a: Timestamped, b: Timestamped) =>
  new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()

/**
 * Allocate a response budget across providers by round-robin, then order the
 * winners by recency for display.
 *
 * **Why not just sort the merged pool by recency and slice?** Because that
 * starves the slower source completely, which is the bug this exists to fix.
 * On `/live-data/stock-social`, StockTwits streams continuously while the
 * Reddit finance subs post a few times an hour — so every one of the newest N
 * items is from StockTwits. At limit=20 Reddit contributed exactly zero
 * visible signals while still being named as a source.
 *
 * Round-robin gives each provider an equal share, and because a provider whose
 * queue runs dry is simply skipped, its unused share flows to the others — so
 * a single active provider still fills the whole limit and no budget is
 * wasted. Items are taken newest-first *within* each provider, so each
 * contributes its freshest, not an arbitrary slice.
 *
 * The picked set is re-sorted by recency before returning, so the feed still
 * reads chronologically; only *which* items survive the cut changes.
 *
 * `contributed` reports the providers that actually placed at least one item
 * in the result, so callers can attribute honestly instead of listing a
 * provider that contributed nothing.
 *
 * Input queues are not mutated.
 */
export function blendByProvider<T extends Timestamped>(
  byProvider: Map<string, T[]>,
  limit: number,
): { items: T[]; contributed: Set<string> } {
  const queues = Array.from(byProvider.entries())
    .map(([id, list]) => ({ id, list: [...list].sort(byRecency) }))
    .filter((q) => q.list.length > 0)

  const picked: T[] = []
  const contributed = new Set<string>()
  let progressed = true
  while (picked.length < limit && progressed) {
    progressed = false
    for (const q of queues) {
      if (picked.length >= limit) break
      const next = q.list.shift()
      if (!next) continue
      picked.push(next)
      contributed.add(q.id)
      progressed = true
    }
  }
  return { items: picked.sort(byRecency), contributed }
}
