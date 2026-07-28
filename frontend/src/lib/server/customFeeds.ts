// Shared plumbing for user-added custom feeds (Integrations page): auth
// application, SSRF-validated fetching, and tolerant JSON field extraction.
// Used by the equity news / social / OHLCV routes; the quote ladder in
// marketData.ts uses the same conventions.

import { pinnedFetch } from '@/lib/server/pinnedFetch'
import type { CustomProviderDef, ProviderConfig } from '@/lib/api/live/providers'

export type ActiveCustom = CustomProviderDef & { config: ProviderConfig }

/**
 * Fetch a custom provider URL with its configured auth. Throws on failure.
 *
 * Every hop goes through `pinnedFetch`, which validates the URL (string level
 * AND resolved addresses) and then connects to a vetted address rather than
 * re-resolving the name — see pinnedFetch.ts for why the second half matters.
 *
 * Two consequences of pinning, both deliberate:
 *
 * 1. pinnedFetch buffers the body and hands back a standard `Response`, so the
 *    pinned agent closes with the request instead of waiting on a caller.
 *    Callers keep the same interface and read it whenever they like. Feeds are
 *    RSS/JSON documents, so buffering costs nothing that streaming was saving.
 * 2. `next: { revalidate }` no longer applies. Next's fetch cache does not
 *    cover requests carrying a custom dispatcher, so custom feeds now hit
 *    their upstream on every request instead of once per revalidate window.
 *    `revalidate` is kept in the signature — callers pass it, and it should
 *    start working again the day this can drop the dispatcher — but it is
 *    inert today. Custom feeds are opt-in and few; that is the price of not
 *    being rebindable.
 */
export async function fetchCustomUrl(provider: ActiveCustom, url: string, revalidate = 300): Promise<Response> {
  void revalidate // see note 2 above — inert while requests carry a dispatcher

  const headers: Record<string, string> = { Accept: 'application/json, application/rss+xml, application/atom+xml, */*' }
  let finalUrl = url
  const apiKey = provider.config.apiKey
  if (apiKey) {
    if (provider.authMethod === 'header' && provider.authHeaderName) headers[provider.authHeaderName] = apiKey
    else if (provider.authMethod === 'bearer') headers['Authorization'] = `Bearer ${apiKey}`
    else if (provider.authMethod === 'query' && provider.authQueryParam) {
      finalUrl = `${url}${url.includes('?') ? '&' : '?'}${provider.authQueryParam}=${encodeURIComponent(apiKey)}`
    }
  }

  // Redirects are followed MANUALLY so every hop passes the same SSRF
  // validation as the original URL. fetch's default `redirect: 'follow'`
  // validated only hop zero — a feed URL that 3xx'd to 169.254.169.254 or an
  // internal host would be fetched happily (the config-page test fetch always
  // used `redirect: 'manual'` for exactly this reason; the data path didn't).
  // Legitimate feeds do redirect (http→https, feed proxies), so hops are
  // followed rather than rejected — just never blindly.
  const MAX_REDIRECTS = 3
  let currentUrl = finalUrl
  for (let hop = 0; ; hop++) {
    // pinnedFetch validates currentUrl before opening anything, so the hop
    // check that used to live at the bottom of this loop is now implicit —
    // a redirect target that resolves internally throws here, on its own hop.
    const response = await pinnedFetch(currentUrl, {
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    })

    if (response.status < 300 || response.status >= 400) {
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return response
    }

    const location = response.headers.get('location')
    if (!location) throw new Error(`HTTP ${response.status} redirect with no Location header`)
    if (hop >= MAX_REDIRECTS) throw new Error('Too many redirects')
    const nextUrl = new URL(location, currentUrl).toString()
    // Auth must not leak to a different host than the one it was configured for.
    if (new URL(nextUrl).host !== new URL(currentUrl).host) {
      delete headers['Authorization']
      if (provider.authMethod === 'header' && provider.authHeaderName) delete headers[provider.authHeaderName]
    }
    currentUrl = nextUrl
  }
}

/** Walk a dot-path ("data.items") into an object. */
export function dig(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>(
    (o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined),
    obj
  )
}

/** First non-empty string found under the mapped path or any candidate path. */
export function pickString(obj: unknown, mapped: string | undefined, candidates: string[]): string | null {
  for (const path of [mapped, ...candidates]) {
    if (!path) continue
    const v = dig(obj, path)
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}

/** First finite number found under the mapped path or any candidate path. */
export function pickNumber(obj: unknown, mapped: string | undefined, candidates: string[]): number | null {
  for (const path of [mapped, ...candidates]) {
    if (!path) continue
    const v = dig(obj, path)
    const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN
    if (isFinite(n)) return n
  }
  return null
}

/** Parse epoch seconds/millis or a date string into an ISO timestamp. */
export function pickDate(obj: unknown, mapped: string | undefined, candidates: string[]): string | null {
  for (const path of [mapped, ...candidates]) {
    if (!path) continue
    const v = dig(obj, path)
    if (typeof v === 'number' && isFinite(v)) {
      const ms = v > 1e12 ? v : v * 1000 // heuristics: epoch millis vs seconds
      const d = new Date(ms)
      if (!isNaN(d.getTime())) return d.toISOString()
    }
    if (typeof v === 'string' && v) {
      const d = new Date(v)
      if (!isNaN(d.getTime())) return d.toISOString()
    }
  }
  return null
}

/** Locate the entry array in a JSON payload: jsonArrayPath, the root, or a common wrapper key. */
export function findArray(payload: unknown, jsonArrayPath?: string): unknown[] {
  if (jsonArrayPath) {
    const v = dig(payload, jsonArrayPath)
    return Array.isArray(v) ? v : []
  }
  if (Array.isArray(payload)) return payload
  if (payload && typeof payload === 'object') {
    for (const key of ['articles', 'items', 'data', 'results', 'posts', 'messages', 'candles', 'prices', 'history']) {
      const v = (payload as Record<string, unknown>)[key]
      if (Array.isArray(v)) return v
    }
  }
  return []
}
