// Shared plumbing for user-added custom feeds (Integrations page): auth
// application, SSRF-validated fetching, and tolerant JSON field extraction.
// Used by the equity news / social / OHLCV routes; the quote ladder in
// marketData.ts uses the same conventions.

import { validatePublicHttpUrlResolved } from '@/lib/server/urlSafety'
import type { CustomProviderDef, ProviderConfig } from '@/lib/api/live/providers'

export type ActiveCustom = CustomProviderDef & { config: ProviderConfig }

/** Fetch a custom provider URL with its configured auth. Throws on failure. */
export async function fetchCustomUrl(provider: ActiveCustom, url: string, revalidate = 300): Promise<Response> {
  const urlError = await validatePublicHttpUrlResolved(url)
  if (urlError) throw new Error(urlError)

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
    const res = await fetch(currentUrl, { headers, redirect: 'manual', signal: AbortSignal.timeout(10_000), next: { revalidate } })
    if (res.status < 300 || res.status >= 400) {
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res
    }
    const location = res.headers.get('location')
    if (!location) throw new Error(`HTTP ${res.status} redirect with no Location header`)
    if (hop >= MAX_REDIRECTS) throw new Error('Too many redirects')
    const nextUrl = new URL(location, currentUrl).toString()
    const hopError = await validatePublicHttpUrlResolved(nextUrl)
    if (hopError) throw new Error(`Redirect target rejected: ${hopError}`)
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
