import { describe, it, expect } from 'vitest'
import { hasUsableAnalyzer } from '../VideoAskDialog'

// NT4: this predicate decides whether the "Ask about this video" control shows
// at all. A button that can only ever return "no provider configured" is worse
// than no button, so both conditions are required and both are tested.

const analyzer = (over: Partial<{ configured: boolean; supported: boolean }> = {}) => ({
  id: 'anthropic', label: 'Claude', configured: true, supported: true, ...over,
})

describe('hasUsableAnalyzer', () => {
  it('is false when nothing is registered', () => {
    expect(hasUsableAnalyzer([])).toBe(false)
    expect(hasUsableAnalyzer(undefined)).toBe(false)
  })

  it('is false when an analyzer exists but has no key', () => {
    expect(hasUsableAnalyzer([analyzer({ configured: false })])).toBe(false)
  })

  it('is false when a configured analyzer needs an unsupported ingestion mode', () => {
    // Configured is not sufficient: an adapter whose ingestion the app cannot
    // supply would fail at call time, after the user had already asked.
    expect(hasUsableAnalyzer([analyzer({ supported: false })])).toBe(false)
  })

  it('is true when at least one analyzer is both configured and supported', () => {
    expect(hasUsableAnalyzer([analyzer({ configured: false }), analyzer()])).toBe(true)
  })
})
