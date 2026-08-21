// Live exchange withdrawal fees (S3 Tier-1 overlay).
//
// A few exchanges publish per-chain withdrawal fees on public, KEYLESS
// endpoints — no account, no API key, no credential custody (RP-5 stands:
// keyed exchange endpoints are deliberately not used). This route fetches the
// ones we know of, parses them with the tolerant adapters in
// lib/server/withdrawFeeAdapters.ts, and returns an override map the Transfer
// Fee Calculator overlays on the hand-curated static table.
//
// The three fetches are genuinely independent → Promise.allSettled (one
// exchange being down must not cost the other two). Per-source status is
// reported so the UI can say exactly which exchanges are live.
//
// ⚠ Availability is IP-dependent (exchanges block some datacenter ranges), so
// whether each source works is a verdict for the owner's machine — run
// `node scripts/probe-exchange-fee-apis.mjs` there. The route degrades to an
// empty overlay, which leaves the calculator exactly as it was: static table
// plus staleness banner.

import { NextResponse } from 'next/server'
import {
  parseKucoinCurrencies,
  parseHtxCurrencies,
  buildFeeOverrideMap,
  type ParsedFeeRow,
} from '@/lib/server/withdrawFeeAdapters'
import type { LiveFeeOverrideMap } from '@/lib/data/transferFees'

export const dynamic = 'force-dynamic'

const REVALIDATE = 900 // 15 min — withdrawal fees move with gas, not by the second

interface SourceResult {
  exchangeId: string
  status: 'live' | 'error' | 'empty'
  rows: number
  error?: string
}

export interface WithdrawFeesResponse {
  ok: boolean
  updatedAt: string
  sources: SourceResult[]
  /** exchangeId → coin → network → { withdrawFee, minWithdraw?, withdrawEnabled? } */
  overrides: LiveFeeOverrideMap
  applied: number
  /** Live rows dropped because the static table has no matching route (overlay-only rule). */
  skipped: number
}

// Bybit was probed and removed (2026-08-21): /v5/asset/coin/query-info
// returned 403 from the owner's machine — it is in Bybit's authenticated
// Asset API group, not public. Keyless-only is the rule (RP-5), so no Bybit.
const SOURCES: { exchangeId: string; url: string; parse: (json: any) => ParsedFeeRow[] }[] = [
  {
    exchangeId: 'kucoin',
    url: 'https://api.kucoin.com/api/v3/currencies',
    parse: parseKucoinCurrencies,
  },
  {
    exchangeId: 'htx',
    url: 'https://api.huobi.pro/v2/reference/currencies',
    parse: parseHtxCurrencies,
  },
]

export async function GET() {
  const settled = await Promise.allSettled(
    SOURCES.map(async s => {
      const res = await fetch(s.url, {
        headers: { Accept: 'application/json' },
        next: { revalidate: REVALIDATE },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return s.parse(await res.json())
    })
  )

  const sources: SourceResult[] = []
  const allRows: ParsedFeeRow[] = []
  settled.forEach((r, i) => {
    const { exchangeId } = SOURCES[i]
    if (r.status === 'fulfilled') {
      allRows.push(...r.value)
      sources.push({ exchangeId, status: r.value.length > 0 ? 'live' : 'empty', rows: r.value.length })
    } else {
      sources.push({ exchangeId, status: 'error', rows: 0, error: String(r.reason?.message ?? r.reason) })
    }
  })

  const { overrides, applied, skipped } = buildFeeOverrideMap(allRows)

  const body: WithdrawFeesResponse = {
    ok: sources.some(s => s.status === 'live'),
    updatedAt: new Date().toISOString(),
    sources,
    overrides,
    applied,
    skipped,
  }
  return NextResponse.json(body)
}
