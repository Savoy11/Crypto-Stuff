/**
 * Run an async worker over items with bounded concurrency.
 *
 * The scanners exist to sweep a whole universe, which is exactly the shape that
 * fires ~90 simultaneous OHLCV fetches and rate-limits the provider — turning a
 * scan into a page of errors. A small pool drains the queue steadily instead.
 *
 * Shared by the crypto, equities and macro scanners since they moved to their
 * own routes (short-list item 6/7, 2026-08-19).
 */
export async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++
      await worker(items[i])
    }
  })
  await Promise.all(runners)
}
