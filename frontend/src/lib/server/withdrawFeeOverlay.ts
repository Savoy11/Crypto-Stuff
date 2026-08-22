import 'server-only'

// Shared fetch+build for the live withdrawal-fee overlay (S3 Tier-1).
//
// Lives here rather than in the route handler because TWO surfaces need it and
// they must not disagree: /live-data/withdraw-fees (the UI) and
// /api/v1/transfer/routes (agents + the MCP tool). Before this, v1 served the
// static table only — so an agent could tell a user a route was open on the
// strength of a 2025-06-01 snapshot while the UI, reading the same exchange's
// live API, showed it suspended.
//
// Keyless public endpoints only — RP-5 (no exchange API-key custody) stands.
// Availability is IP-dependent; `npm run fee-probe` is the owner-machine verdict.

import {
  parseKucoinCurrencies,
  parseHtxCurrencies,
  parseBitgetCoins,
  parsePoloniexCurrencies,
  parseLbankWithdrawConfigs,
  parseBitfinexTxFees,
  parseXtSupportCurrency,
  buildFeeOverrideMap,
  WITHDRAW_FEE_SOURCES,
  type ParsedFeeRow,
} from '@/lib/server/withdrawFeeAdapters'
import type { LiveFeeOverrideMap } from '@/lib/data/transferFees'

/** 15 min — withdrawal fees move with gas, not by the second. */
export const WITHDRAW_FEE_REVALIDATE = 900

export interface OverlaySourceResult {
  exchangeId: string
  status: 'live' | 'error' | 'empty'
  rows: number
  error?: string
}

export interface LiveFeeOverlay {
  ok: boolean
  updatedAt: string
  sources: OverlaySourceResult[]
  overrides: LiveFeeOverrideMap
  applied: number
  /** Live rows dropped because the static table has no matching route. */
  skipped: number
  /**
   * Exchanges that reported withdrawal AVAILABILITY, not merely a fee. Strictly
   * narrower than the `live` sources above — Bitfinex's fee map has no status
   * field, so it can be a live fee source while telling us nothing about
   * whether a withdrawal is open. Only these exchanges may be described to a
   * user as availability-checked.
   */
  availabilityExchangeIds: string[]
  /**
   * `exchangeId:coin:network` keys whose STATUS was live-reported. Coverage is
   * per row, not per exchange — a consumer describing a specific route as
   * status-checked must key off this, not the exchange list.
   */
  availabilityRows: string[]
}

/** Exchange ids the overlay can ever cover — used to describe coverage honestly. */
export const OVERLAY_EXCHANGE_IDS = WITHDRAW_FEE_SOURCES.map(s => s.exchangeId)

export async function fetchLiveFeeOverlay(): Promise<LiveFeeOverlay> {
  const settled = await Promise.allSettled(
    WITHDRAW_FEE_SOURCES.map(async s => {
      const res = await fetch(s.url, {
        headers: { Accept: 'application/json' },
        next: { revalidate: WITHDRAW_FEE_REVALIDATE },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return s.parse(await res.json())
    })
  )

  const sources: OverlaySourceResult[] = []
  const allRows: ParsedFeeRow[] = []
  settled.forEach((r, i) => {
    const { exchangeId } = WITHDRAW_FEE_SOURCES[i]
    if (r.status === 'fulfilled') {
      allRows.push(...r.value)
      sources.push({ exchangeId, status: r.value.length > 0 ? 'live' : 'empty', rows: r.value.length })
    } else {
      sources.push({ exchangeId, status: 'error', rows: 0, error: String(r.reason?.message ?? r.reason) })
    }
  })

  const { overrides, applied, skipped, availabilityExchangeIds, availabilityRows } = buildFeeOverrideMap(allRows)

  return {
    ok: sources.some(s => s.status === 'live'),
    updatedAt: new Date().toISOString(),
    sources,
    overrides,
    applied,
    skipped,
    availabilityExchangeIds,
    availabilityRows,
  }
}
