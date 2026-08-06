import { describe, it, expect } from 'vitest'
import {
  describeSource, getSource, DATA_SOURCES, SOURCE_STATUS_META,
  type DataSourceEntry,
} from '../dataSources'

// The house policy (docs/ROADMAP.md, "Label every data source on screen")
// requires derived values be marked as Finance Now's own computation, never as
// a provider's figure. The WORDING is the feature, so it is pinned here rather
// than left to a component that nobody tests.

const entry = (over: Partial<DataSourceEntry>): DataSourceEntry => ({
  id: 'x', surface: 'X', module: 'shared', status: 'live',
  providers: [{ name: 'CoinGecko', role: 'primary', auth: 'none' }],
  ...over,
})

describe('describeSource', () => {
  it('credits the provider for provider data', () => {
    const d = describeSource(entry({ status: 'live' }))
    expect(d.lead).toBe('Source:')
    expect(d.names).toEqual(['CoinGecko'])
    expect(d.isDerived).toBe(false)
  })

  // The defect this fixes: a risk score rendering as "Source: DefiLlama"
  // credits DefiLlama with a number they never published.
  it('claims a derived value as our own computation, naming its inputs', () => {
    const d = describeSource(entry({
      status: 'derived',
      providers: [
        { name: 'DefiLlama', role: 'primary', auth: 'none' },
        { name: 'CoinGecko', role: 'primary', auth: 'none' },
      ],
    }))
    expect(d.lead).toBe('Computed by Finance Now from')
    expect(d.names).toEqual(['DefiLlama', 'CoinGecko'])
    expect(d.isDerived).toBe(true)
  })

  it('never says "Source:" for a derived surface', () => {
    for (const e of DATA_SOURCES.filter((x) => x.status === 'derived')) {
      expect(describeSource(e).lead).not.toContain('Source:')
    }
  })

  it('drops our own engine from the input list — the lead already said it', () => {
    // Otherwise: "Computed by Finance Now from Finance Now engine (…)".
    const d = describeSource(entry({
      status: 'derived',
      providers: [
        { name: 'Finance Now engine (lib/data/portfolioBuilder.ts)', role: 'derived', auth: 'none' },
        { name: 'CoinGecko', role: 'primary', auth: 'none' },
      ],
    }))
    expect(d.names).toEqual(['CoinGecko'])
    expect(d.names.join(' ')).not.toMatch(/Finance Now/)
  })

  it('stands alone when a derived surface has no external inputs', () => {
    const d = describeSource(entry({
      status: 'derived',
      providers: [{ name: 'Finance Now engine', role: 'derived', auth: 'none' }],
    }))
    expect(d.lead).toBe('Computed by Finance Now')
    expect(d.names).toEqual([])
  })

  it('treats partial and key-gated as provider data, not computation', () => {
    for (const status of ['partial', 'key-gated', 'unavailable'] as const) {
      expect(describeSource(entry({ status })).isDerived).toBe(false)
    }
  })
})

describe('the registry itself', () => {
  it('has no duplicate ids — getSource would silently shadow one', () => {
    const ids = DATA_SOURCES.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every entry at least one provider to name', () => {
    for (const e of DATA_SOURCES) {
      expect(e.providers.length, `${e.id} has no providers`).toBeGreaterThan(0)
    }
  })

  it('has a status meta entry for every status in use', () => {
    for (const e of DATA_SOURCES) {
      expect(SOURCE_STATUS_META[e.status], `${e.id} status ${e.status}`).toBeDefined()
    }
  })

  // SourceLine renders nothing in production for an unknown id, so a typo'd id
  // silently removes attribution from a page. These pin the ids that surfaces
  // actually pass, which is where such a typo would land.
  it('resolves the ids the UI passes to SourceLine', () => {
    const usedByPages = [
      'macro-quotes', 'options-score', 'futures-curve', 'risk-scores',
      'compare', 'portfolio-builder', 'brief', 'security-quotes',
    ]
    for (const id of usedByPages) {
      expect(getSource(id), `${id} is passed by a page but missing from the registry`).toBeDefined()
    }
  })

  it('marks the scores users act on as derived, not as provider figures', () => {
    for (const id of ['risk-scores', 'compare', 'portfolio-builder', 'options-score']) {
      expect(getSource(id)!.status, `${id} should be derived`).toBe('derived')
    }
  })
})
