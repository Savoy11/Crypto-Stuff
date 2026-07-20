import { describe, expect, it } from 'vitest'
import { bandForScore } from '../engine'
import { RISK_BAND_CONFIG, getScoreColor, getRiskColor } from '../presentation'
import type { RiskBand } from '../types'

const BANDS: RiskBand[] = ['low', 'moderate', 'elevated', 'high', 'critical']

describe('band presentation ↔ engine agreement (drift guard)', () => {
  it('bandForScore lands in the band whose config range contains the score', () => {
    for (const band of BANDS) {
      const { min } = RISK_BAND_CONFIG[band]
      // The band's own floor resolves to that band.
      expect(bandForScore(min)).toBe(band)
      // Just below the floor resolves to a strictly riskier band (except critical, floor 0).
      if (band !== 'critical') {
        expect(bandForScore(min - 0.1)).not.toBe(band)
      }
    }
  })

  it('config floors are the canonical 80/60/40/20/0 thresholds in order', () => {
    expect(BANDS.map((b) => RISK_BAND_CONFIG[b].min)).toEqual([80, 60, 40, 20, 0])
  })

  it('getScoreColor routes a raw score through bandForScore to the band colour', () => {
    for (const band of BANDS) {
      const score = RISK_BAND_CONFIG[band].min
      expect(getScoreColor(score)).toBe(getRiskColor(band))
    }
  })
})
