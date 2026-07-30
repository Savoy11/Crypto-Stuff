'use client'

import { useEffect, useRef } from 'react'

// Two-way sync between a screener's filter state and the URL query string, so
// a filtered view is shareable/bookmarkable (T7 wish list; owner backlog
// "fine-tune all screeners").
//
// Deliberately NOT built on next/navigation's useSearchParams: that hook
// requires a <Suspense> boundary at build time — the exact class of failure
// that once broke `next build` on the TA page — and router.replace() triggers
// a navigation. Reading location.search once on mount and writing with
// history.replaceState gives the same UX with neither hazard, and the
// read-in-effect pattern avoids SSR hydration mismatches (first paint renders
// defaults, params apply one tick later).
//
// Keys not in `defaults` are never touched, so page-owned params like
// /assets?tab=reserves survive untouched.

/**
 * @param state    Current filter values, flattened to strings.
 * @param defaults Default value per key — a value equal to its default (or '')
 *                 is removed from the URL, keeping links minimal.
 * @param apply    Called once on mount with the params present in the URL that
 *                 differ from defaults; the screener applies them to its state.
 */
export function useScreenerUrl(
  state: Record<string, string>,
  defaults: Record<string, string>,
  apply: (params: Record<string, string>) => void,
): void {
  const initialized = useRef(false)

  // Mount: pull any deep-linked filters out of the URL, once.
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    const sp = new URLSearchParams(window.location.search)
    const found: Record<string, string> = {}
    for (const key of Object.keys(defaults)) {
      const v = sp.get(key)
      if (v != null && v !== '' && v !== defaults[key]) found[key] = v
    }
    if (Object.keys(found).length > 0) apply(found)
    // apply/defaults are stable in practice; this must run exactly once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // State change: reflect non-default values into the URL without navigating.
  useEffect(() => {
    if (!initialized.current) return
    const sp = new URLSearchParams(window.location.search)
    for (const [key, value] of Object.entries(state)) {
      if (value === '' || value === defaults[key]) sp.delete(key)
      else sp.set(key, value)
    }
    const qs = sp.toString()
    const next = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`
    if (next !== current) window.history.replaceState(null, '', next)
  })
}
