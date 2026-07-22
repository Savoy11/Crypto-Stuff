// Paged CoinGecko fetching that survives the free tier's rate limit.
//
// The failure this exists to prevent: firing every page in parallel
// (`Promise.all([page1, page2, page3])`) makes CoinGecko 429 ALL of them, so a
// route that could have served 250 coins from page 1 serves a 503 instead.
// Verified 2026-07-22 against api.coingecko.com: three parallel page requests
// returned 429/429/429, while the same request issued alone returned 200.
//
// So: fetch sequentially with a small gap, retry a 429 once if the upstream's
// Retry-After is short enough to be worth waiting for, and STOP on a hard
// throttle rather than hammering — continuing to request after a 429 deepens
// the penalty window instead of shortening it. Partial results are returned
// with the errors alongside, so callers can serve what arrived and say what
// didn't.

export interface PagedResult<T> {
  /** One entry per page that returned data, in page order. */
  pages: T[][]
  /** Human-readable per-page failures, e.g. "page 2: HTTP 429". */
  errors: string[]
  /** True when a 429 stopped the walk early — the caller has partial data. */
  throttled: boolean
}

interface Options {
  /** Next.js data-cache lifetime for each page request. */
  revalidate?: number
  /** Pause between page requests. Keeps a burst from tripping the limiter. */
  gapMs?: number
  /** Longest Retry-After worth waiting inside a request. */
  maxRetryWaitMs?: number
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Fetch `count` pages one at a time.
 *
 * Returns whatever arrived: a 429 on page 2 still yields page 1's data with
 * `throttled: true`, which is strictly better than the all-or-nothing failure
 * parallel fetching produced.
 */
export async function fetchCoinGeckoPages<T>(
  count: number,
  buildUrl: (page: number) => string,
  opts: Options = {},
): Promise<PagedResult<T>> {
  const { revalidate = 300, gapMs = 250, maxRetryWaitMs = 2000 } = opts
  const pages: T[][] = []
  const errors: string[] = []
  let throttled = false

  for (let page = 1; page <= count; page++) {
    if (page > 1) await sleep(gapMs)

    let res: Response
    try {
      res = await fetch(buildUrl(page), {
        headers: { Accept: 'application/json' },
        next: { revalidate },
      })
    } catch (err) {
      errors.push(`page ${page}: ${err instanceof Error ? err.message : String(err)}`)
      continue
    }

    // One retry, and only when the upstream tells us the wait is short. A bare
    // 429 with no Retry-After means an unknown penalty window — not worth
    // holding the request open for.
    if (res.status === 429) {
      const retryAfterSec = Number(res.headers.get('retry-after'))
      const waitMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0 ? retryAfterSec * 1000 : 0
      if (waitMs > 0 && waitMs <= maxRetryWaitMs) {
        await sleep(waitMs)
        try {
          res = await fetch(buildUrl(page), { headers: { Accept: 'application/json' }, next: { revalidate } })
        } catch (err) {
          errors.push(`page ${page}: ${err instanceof Error ? err.message : String(err)}`)
          continue
        }
      }
      if (res.status === 429) {
        errors.push(`page ${page}: HTTP 429 (rate limited)`)
        throttled = true
        break // further requests would extend the penalty, not beat it
      }
    }

    if (!res.ok) {
      errors.push(`page ${page}: HTTP ${res.status}`)
      continue
    }

    try {
      pages.push(await res.json() as T[])
    } catch (err) {
      errors.push(`page ${page}: malformed JSON (${err instanceof Error ? err.message : String(err)})`)
    }
  }

  return { pages, errors, throttled }
}
