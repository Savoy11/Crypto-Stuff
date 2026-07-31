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
