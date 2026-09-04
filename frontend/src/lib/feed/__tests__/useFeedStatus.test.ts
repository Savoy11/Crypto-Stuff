import { describe, it, expect } from 'vitest'
import { deriveFeedStatus } from '../useFeedStatus'

// The bug this guards against (W4-A1): the previous implementation set
// 'connected' unconditionally, so the indicator was green even when every feed
// on the screen was failing. The direction that matters is that a failure can
// actually reach the UI — assert it explicitly rather than only asserting the
// happy path, which is what the old shim would have passed.
describe('deriveFeedStatus', () => {
  it('reports live when every mounted query has data', () => {
    expect(deriveFeedStatus({ ok: 4, failed: 0, pending: 0 })).toBe('live')
  })

  it('reports degraded when some feeds fail alongside working ones', () => {
    expect(deriveFeedStatus({ ok: 3, failed: 1, pending: 0 })).toBe('degraded')
  })

  it('reports offline when everything mounted is failing', () => {
    expect(deriveFeedStatus({ ok: 0, failed: 2, pending: 0 })).toBe('offline')
  })

  it('never reports live while a failure is present', () => {
    for (const ok of [0, 1, 50]) {
      expect(deriveFeedStatus({ ok, failed: 1, pending: 0 })).not.toBe('live')
    }
  })

  it('reports connecting while the first fetches are in flight', () => {
    expect(deriveFeedStatus({ ok: 0, failed: 0, pending: 3 })).toBe('connecting')
  })

  it('treats an empty cache as connecting, not offline', () => {
    // The shell renders before any page query registers; 'offline' here would
    // flash red on every navigation.
    expect(deriveFeedStatus({ ok: 0, failed: 0, pending: 0 })).toBe('connecting')
  })

  it('prefers a settled failure over in-flight retries', () => {
    expect(deriveFeedStatus({ ok: 0, failed: 1, pending: 5 })).toBe('offline')
    expect(deriveFeedStatus({ ok: 2, failed: 1, pending: 5 })).toBe('degraded')
  })
})

// ─── latestDataAt (the honest "Updated" value) ────────────────────────────────
// The 2026-07-30 findings caught the status bar ticking a setInterval wall
// clock as "Updated:" — a timestamp that advances every second asserts
// freshness the feeds may not have. The replacement is the newest
// dataUpdatedAt across OBSERVED queries, which only moves when data does.
// Tested through a real QueryClient because observer-gating is the part that
// matters: a stale unmounted query must not keep the timestamp fresh.
import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { tally } from '../useFeedStatus'

function seedQuery(client: QueryClient, key: string, updatedAt: number, observe = true) {
  client.setQueryData([key], { some: 'data' }, { updatedAt })
  if (observe) {
    // A live observer marks the query as something a mounted screen depends on.
    const observer = new QueryObserver(client, { queryKey: [key], enabled: false })
    const unsubscribe = observer.subscribe(() => {})
    return unsubscribe
  }
  return () => {}
}

describe('tally latestDataAt', () => {
  it('is null before anything has loaded — the bar renders a dash, not a clock', () => {
    const client = new QueryClient()
    expect(tally(client).latestDataAt).toBeNull()
  })

  it('reports the NEWEST arrival across observed queries', () => {
    const client = new QueryClient()
    seedQuery(client, 'a', 1_000)
    seedQuery(client, 'b', 5_000)
    seedQuery(client, 'c', 3_000)
    expect(tally(client).latestDataAt).toBe(5_000)
  })

  it('ignores queries nothing on screen observes — a page left minutes ago must not keep the timestamp fresh', () => {
    const client = new QueryClient()
    seedQuery(client, 'observed', 2_000)
    seedQuery(client, 'abandoned', 9_000, false)
    expect(tally(client).latestDataAt).toBe(2_000)
  })
})
