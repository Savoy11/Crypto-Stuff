import { NextRequest, NextResponse } from 'next/server'
import { CORS, options } from '../../../_cors'
import {
  scoreOptionsTrade, isNetShortPremium,
  type OptionLegInput, type OptionsTradeInputs,
} from '@/lib/risk/profiles/optionsTrade'
import type { CompositeRisk } from '@/lib/risk/types'

// Public agent API — score a described options position (P2-O5).
//
// Unlike every other v1 route, this one COMPUTES rather than fetches: the
// engine is pure (lib/risk/profiles/optionsTrade.ts) and the caller supplies
// the trade. That makes input validation the substance of this handler —
// there is no upstream to reject a nonsensical leg, so it must be rejected
// here rather than scored into a confident-looking number.
//
// It scores a trade the CALLER describes. It does not recommend trades, does
// not fetch a chain (no keyless chain source exists — see
// docs/assessments/P2-O1-options-data.md), and returns nothing that should be
// read as advice.
//
// POST because a multi-leg trade doesn't belong in a query string. GET is
// answered with the schema so the endpoint is discoverable by hand.

export const dynamic = 'force-dynamic'
export { options as OPTIONS }

export interface V1OptionsScoreResponse {
  /** Canonical 0–100, higher = safer, with band and per-dimension detail. */
  risk: CompositeRisk
  /** True when the position collects net premium (a credit trade). */
  netShortPremium: boolean
  disclaimer: string
  source: 'finance-now-risk-engine'
  profileVersion: string
  updatedAt: string
}

const DISCLAIMER =
  'Explains the risk of the position described in the request. Not a recommendation, ' +
  'not investment advice, and not an assessment of whether the trade is likely to profit.'

/** Everything wrong with the payload, not just the first thing. */
function validate(body: unknown): { inputs: OptionsTradeInputs } | { errors: string[] } {
  const errors: string[] = []
  if (!body || typeof body !== 'object') return { errors: ['Body must be a JSON object'] }
  const b = body as Record<string, unknown>

  const num = (v: unknown): number | undefined =>
    typeof v === 'number' && Number.isFinite(v) ? v : undefined

  const underlyingPrice = num(b.underlyingPrice)
  if (underlyingPrice === undefined || underlyingPrice <= 0) {
    errors.push('underlyingPrice must be a number greater than 0')
  }

  const daysToExpiry = num(b.daysToExpiry)
  if (daysToExpiry === undefined || daysToExpiry < 0) {
    errors.push('daysToExpiry must be a number of 0 or more')
  }

  const rawLegs = Array.isArray(b.legs) ? b.legs : null
  if (!rawLegs || rawLegs.length === 0) {
    errors.push('legs must be a non-empty array')
  } else if (rawLegs.length > 8) {
    errors.push('legs may contain at most 8 entries')
  }

  const legs: OptionLegInput[] = []
  rawLegs?.forEach((raw, i) => {
    if (!raw || typeof raw !== 'object') { errors.push(`legs[${i}] must be an object`); return }
    const l = raw as Record<string, unknown>
    const at = `legs[${i}]`

    if (l.side !== 'long' && l.side !== 'short') errors.push(`${at}.side must be "long" or "short"`)
    if (l.type !== 'call' && l.type !== 'put') errors.push(`${at}.type must be "call" or "put"`)

    const strike = num(l.strike)
    const bid = num(l.bid)
    const ask = num(l.ask)
    if (strike === undefined || strike <= 0) errors.push(`${at}.strike must be a number greater than 0`)
    if (bid === undefined || bid < 0) errors.push(`${at}.bid must be a number of 0 or more`)
    if (ask === undefined || ask < 0) errors.push(`${at}.ask must be a number of 0 or more`)
    // A crossed market is a data error, and scoring it would produce a
    // negative spread that reads as excellent liquidity.
    if (bid !== undefined && ask !== undefined && ask < bid) {
      errors.push(`${at}.ask (${ask}) is below ${at}.bid (${bid})`)
    }

    if (strike === undefined || bid === undefined || ask === undefined) return
    if (l.side !== 'long' && l.side !== 'short') return
    if (l.type !== 'call' && l.type !== 'put') return

    legs.push({
      side: l.side, type: l.type, strike, bid, ask,
      openInterest: num(l.openInterest),
      volume: num(l.volume),
      delta: num(l.delta),
    })
  })

  const ivRank = num(b.ivRank)
  if (b.ivRank !== undefined && (ivRank === undefined || ivRank < 0 || ivRank > 100)) {
    errors.push('ivRank, when supplied, must be a number between 0 and 100')
  }

  // 'unbounded' is a meaningful value, not a missing one — naked short
  // exposure is precisely what the defined-risk dimension exists to flag.
  let maxLossUsd: number | 'unbounded' | undefined
  if (b.maxLossUsd === 'unbounded') maxLossUsd = 'unbounded'
  else if (b.maxLossUsd !== undefined) {
    const v = num(b.maxLossUsd)
    if (v === undefined || v < 0) errors.push('maxLossUsd must be a number of 0 or more, or the string "unbounded"')
    else maxLossUsd = v
  }

  if (errors.length > 0) return { errors }

  return {
    inputs: {
      underlyingPrice: underlyingPrice!,
      daysToExpiry: daysToExpiry!,
      legs,
      ivRank,
      earningsInDays: num(b.earningsInDays),
      exDividendInDays: num(b.exDividendInDays),
      maxLossUsd,
      maxProfitUsd: num(b.maxProfitUsd),
    },
  }
}

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400, headers: CORS })
  }

  const result = validate(body)
  if ('errors' in result) {
    return NextResponse.json(
      { error: 'Invalid trade description', details: result.errors },
      { status: 400, headers: CORS },
    )
  }

  try {
    const risk = scoreOptionsTrade(result.inputs)
    return NextResponse.json({
      risk,
      netShortPremium: isNetShortPremium(result.inputs.legs),
      disclaimer: DISCLAIMER,
      source: 'finance-now-risk-engine',
      profileVersion: risk.profileVersion,
      updatedAt: new Date().toISOString(),
    } satisfies V1OptionsScoreResponse, { headers: CORS })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not score this trade' },
      { status: 400, headers: CORS },
    )
  }
}

/** Discoverability: the schema, so the endpoint explains itself by hand. */
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/v1/options/score',
    method: 'POST',
    description:
      'Score a described options position on the canonical 0–100 safety scale (higher = safer) ' +
      'across liquidity, IV environment, assignment, time decay and defined risk.',
    disclaimer: DISCLAIMER,
    note:
      'This endpoint scores a trade you describe. It does not fetch an options chain — no ' +
      'keyless chain source exists (see docs/assessments/P2-O1-options-data.md) — so every ' +
      'option-level figure must be supplied by the caller, typically copied from a broker chain.',
    body: {
      underlyingPrice: 'number > 0 (required)',
      daysToExpiry: 'number >= 0 (required)',
      legs: [{
        side: '"long" | "short" (required)',
        type: '"call" | "put" (required)',
        strike: 'number > 0 (required)',
        bid: 'number >= 0 (required)',
        ask: 'number >= bid (required)',
        openInterest: 'number (optional)',
        volume: 'number (optional)',
        delta: 'number, signed per contract e.g. -0.30 (optional)',
      }],
      ivRank: 'number 0–100 (optional) — where current IV sits in its 52-week range',
      earningsInDays: 'number (optional)',
      exDividendInDays: 'number (optional)',
      maxLossUsd: 'number >= 0, or "unbounded" for naked short exposure (optional)',
      maxProfitUsd: 'number (optional)',
    },
    example: {
      underlyingPrice: 200,
      daysToExpiry: 30,
      legs: [{ side: 'short', type: 'put', strike: 190, bid: 3.1, ask: 3.25, openInterest: 1450, delta: -0.28 }],
      ivRank: 45,
      maxLossUsd: 19000,
    },
  }, { headers: CORS })
}
