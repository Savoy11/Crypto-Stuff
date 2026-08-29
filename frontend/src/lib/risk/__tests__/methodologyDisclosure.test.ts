import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { composeRisk } from '../engine'
import type { DimensionScore, RiskProfileSpec } from '../types'
import { CRYPTO_ASSET_RISK_PROFILE } from '../profiles/cryptoAsset'
import { STABLECOIN_RISK_PROFILE } from '../profiles/stablecoin'

/**
 * Owner decision, 2026-08-29: a per-coin risk score may be published only
 * where its derivation is on screen. The bare score gauge, the band pill and
 * the search-result score were removed; the Composite Risk panel was kept
 * BECAUSE it shows pillars, weights, coverage, confidence and evidence.
 *
 * These tests defend the thing that makes the difference. Without them, a
 * refactor that drops `description` (which is exactly what the engine did
 * before this change) turns the surviving panel back into a rating.
 */

const PROFILES: RiskProfileSpec[] = [CRYPTO_ASSET_RISK_PROFILE, STABLECOIN_RISK_PROFILE]

describe('every scored pillar can explain itself', () => {
  it('profiles author a real description for every dimension', () => {
    for (const p of PROFILES) {
      for (const dim of p.dimensions) {
        expect(dim.description.length, `${p.id}.${dim.key} has no description`).toBeGreaterThan(30)
      }
    }
  })

  it('the engine carries descriptions into its output, scored AND unscored', () => {
    // The regression this pins: descriptions existed in the specs all along
    // and the engine dropped them, so the panel could name a pillar but never
    // say what it measured.
    const spec: RiskProfileSpec = {
      id: 'test', name: 'Test', assetClass: 'crypto', version: '1.0.0',
      dimensions: [
        { key: 'a', label: 'A', description: 'What A measures, at length.', weight: 0.6 },
        { key: 'b', label: 'B', description: 'What B measures, at length.', weight: 0.4 },
      ],
    }
    const scores: DimensionScore[] = [
      { key: 'a', score: 70, confidence: 1, evidence: [] },
      { key: 'b', score: null, confidence: 0, evidence: [] }, // no data
    ]
    const result = composeRisk(spec, scores)
    const byKey = Object.fromEntries(result.dimensions.map((d) => [d.key, d]))
    expect(byKey.a.description).toBe('What A measures, at length.')
    // The unscored pillar must explain itself too — "N/A" with no explanation
    // is the least informative cell on the panel.
    expect(byKey.b.description).toBe('What B measures, at length.')
    expect(byKey.b.score).toBeNull()
  })
})

describe('the removed bare-score surfaces stay removed', () => {
  /**
   * Source with comments stripped. The removal notes in these files necessarily
   * NAME the things they removed ("the Safety Score gauge was removed here"),
   * so a naive scan matches the documentation and reports the feature as still
   * present — it did on the first run of this test. Scan what renders.
   */
  const read = (rel: string) =>
    fs.readFileSync(path.join(process.cwd(), rel), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')

  it('the coin detail header renders no score gauge or band pill', () => {
    const src = read('src/app/(dashboard)/assets/[id]/page.tsx')
    expect(src, 'Safety Score gauge is back in the header').not.toContain('Safety Score')
    expect(src, 'RiskScoreBadge is back').not.toContain('RiskScoreBadge')
    expect(src, 'RiskBandPill is back').not.toContain('RiskBandPill')
  })

  it('the comment-stripping in this test actually works (guards the guard)', () => {
    // If the stripper silently stopped working, every assertion above would
    // match documentation instead of code and could pass or fail for the
    // wrong reason. Prove it removes both comment forms.
    const src = read('src/app/(dashboard)/assets/[id]/page.tsx')
    expect(src).not.toContain('TO RESTORE')
    expect(src).toContain('Pillar Breakdown')
  })

  it('search results carry no risk score', () => {
    const src = read('src/components/ui/SearchInput.tsx')
    expect(src).not.toContain('riskScore')
  })

  it('the coin detail page still shows the methodology and the pillars', () => {
    // Guards the guard: the two assertions above would also pass if someone
    // deleted the whole risk panel, which is a different decision from the one
    // the owner made. The explanatory surface must survive.
    const src = read('src/app/(dashboard)/assets/[id]/page.tsx')
    expect(src).toContain('How this number is calculated')
    expect(src).toContain('dim.description')
    expect(src).toContain('Pillar Breakdown')
  })
})
