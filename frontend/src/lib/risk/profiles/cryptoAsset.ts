/**
 * Major crypto-asset risk profile — for non-pegged assets (BTC, ETH, SOL…)
 * where "reserve" and "peg" are meaningless. Scores what IS observable from
 * free batched market data: realized volatility, liquidity depth, market
 * scale, trailing trend, and news sentiment.
 *
 * Wallet-concentration / decentralization metrics need paid indexers, so per
 * Finance Now's data-honesty rule they are NOT approximated here — when that data
 * source lands it becomes a sixth dimension, not a guess today.
 */
import { clamp, piecewise } from '../normalize'
import type { DimensionScore, RiskProfileSpec } from '../types'

export const CRYPTO_ASSET_RISK_PROFILE: RiskProfileSpec = {
  id: 'crypto-asset',
  name: 'Major Asset Composite Risk',
  assetClass: 'crypto',
  version: '1.0.0',
  dimensions: [
    { key: 'volatility', label: 'Volatility', weight: 0.30,
      description: 'Annualized realized volatility from the trailing 7-day hourly price series — the core measure of how violently the asset trades.' },
    { key: 'liquidity', label: 'Liquidity', weight: 0.25,
      description: '24h traded volume relative to market cap — deep markets absorb exits without slippage.' },
    { key: 'scale', label: 'Market Scale', weight: 0.25,
      description: 'Market capitalization as a proxy for battle-testing, integration depth, and survivorship.' },
    { key: 'trend', label: '30d Trend', weight: 0.10,
      description: 'Trailing 30-day price change — steep drawdowns signal active repricing risk.' },
    { key: 'news', label: 'News Sentiment', weight: 0.10,
      description: 'Net sentiment of recent articles tagged to this asset by the Finance Now news pipeline.' },
  ],
}

/** Annualized volatility from an hourly close series (√8760 hours/year). */
export function hourlyAnnualizedVolatility(hourlyCloses: number[]): number | null {
  const valid = hourlyCloses.filter((p) => p > 0)
  if (valid.length < 48) return null
  const returns: number[] = []
  for (let i = 1; i < valid.length; i++) returns.push(Math.log(valid[i] / valid[i - 1]))
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (returns.length - 1)
  return Math.sqrt(variance) * Math.sqrt(24 * 365)
}

export function scoreVolatility(hourlyCloses: number[]): DimensionScore {
  const vol = hourlyAnnualizedVolatility(hourlyCloses)
  if (vol === null) {
    return { key: 'volatility', score: null, confidence: 0, evidence: [{ metric: '7d price history', value: null, note: 'Insufficient sparkline data' }] }
  }
  return {
    key: 'volatility',
    score: piecewise(vol, [[0.3, 90], [0.5, 75], [0.8, 55], [1.2, 35], [2.0, 15]]),
    confidence: 0.75, // one week of realized vol, annualized — a window, not a regime
    evidence: [{ metric: 'annualized volatility (7d window)', value: `${(vol * 100).toFixed(0)}%` }],
  }
}

export function scoreLiquidity(volume24h: number | null, marketCap: number | null): DimensionScore {
  if (volume24h === null || marketCap === null || marketCap <= 0) {
    return { key: 'liquidity', score: null, confidence: 0, evidence: [{ metric: 'volume / market cap', value: null }] }
  }
  // Exit capacity comes from either relative turnover or sheer absolute depth
  // — a mega-cap turning over "only" 3% of its cap daily is still one of the
  // deepest markets anywhere, so score both and take the stronger.
  const ratio = volume24h / marketCap
  const ratioScore = piecewise(ratio, [[0.005, 25], [0.02, 50], [0.05, 70], [0.15, 90]])
  const absScore = piecewise(volume24h, [[1e7, 10], [1e8, 35], [1e9, 60], [1e10, 80], [3e10, 90]])
  let score = Math.max(ratioScore, absScore)
  const evidence: DimensionScore['evidence'] = [
    { metric: 'volume / market cap', value: `${(ratio * 100).toFixed(1)}%` },
    { metric: '24h volume', value: `$${(volume24h / 1e9).toFixed(2)}B` },
  ]
  if (volume24h < 1e7) {
    score = Math.min(score, 30)
    evidence.push({ metric: 'absolute volume floor', value: '<$10M', note: 'Thin absolute volume caps the score at 30' })
  }
  return { key: 'liquidity', score, confidence: 0.9, evidence }
}

export function scoreScale(marketCap: number | null): DimensionScore {
  if (marketCap === null || marketCap <= 0) {
    return { key: 'scale', score: null, confidence: 0, evidence: [{ metric: 'market cap', value: null }] }
  }
  return {
    key: 'scale',
    score: piecewise(marketCap, [[5e8, 25], [2e9, 45], [1e10, 65], [5e10, 80], [2e11, 90], [1e12, 95]]),
    confidence: 0.95,
    evidence: [{ metric: 'market cap', value: `$${(marketCap / 1e9).toFixed(1)}B` }],
  }
}

export function scoreTrend(change30dPct: number | null): DimensionScore {
  if (change30dPct === null) {
    return { key: 'trend', score: null, confidence: 0, evidence: [{ metric: '30d change', value: null }] }
  }
  return {
    key: 'trend',
    score: clamp(piecewise(change30dPct, [[-50, 15], [-20, 40], [0, 70], [20, 85]]), 0, 100),
    confidence: 0.8,
    evidence: [{ metric: '30d change', value: `${change30dPct >= 0 ? '+' : ''}${change30dPct.toFixed(1)}%` }],
  }
}
