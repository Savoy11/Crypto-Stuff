#!/usr/bin/env node
// Probe the keyless exchange withdrawal-fee endpoints behind
// /live-data/withdraw-fees — RUN THIS ON THE OWNER'S MACHINE.
//
// Availability is IP-dependent (exchanges block datacenter ranges, and every
// exchange domain is egress-blocked from the remote dev environment), so this
// script exists to produce the real verdict: does each endpoint answer
// keyless from a residential IP, and does the payload carry per-chain
// withdrawal fees we can parse?
//
// Usage:  npm run fee-probe        (tsx — the script imports the TS adapters)
//
// It prints, per source: HTTP status, row counts through the same parsers the
// route uses, and a couple of sample parsed rows to eyeball against the
// exchange's own withdrawal page.

import {
  WITHDRAW_FEE_SOURCES,
  buildFeeOverrideMap,
} from '../src/lib/server/withdrawFeeAdapters.ts'

// Single source of truth — shared with the overlay and the reconcile tool, so
// an endpoint change lands in one place.
const SOURCES = WITHDRAW_FEE_SOURCES.map(s => ({ id: s.exchangeId, url: s.url, parse: s.parse }))

const allRows = []
for (const s of SOURCES) {
  process.stdout.write(`\n── ${s.id} ─ ${s.url}\n`)
  try {
    const res = await fetch(s.url, { headers: { Accept: 'application/json' } })
    process.stdout.write(`   HTTP ${res.status}\n`)
    if (!res.ok) continue
    const json = await res.json()
    const rows = s.parse(json)
    allRows.push(...rows)
    process.stdout.write(`   parsed rows: ${rows.length}\n`)
    for (const r of rows.slice(0, 4)) {
      process.stdout.write(
        `   sample: ${r.coin.toUpperCase()} on ${r.network} → fee ${r.withdrawFee}` +
        (r.minWithdraw !== undefined ? `, min ${r.minWithdraw}` : '') +
        (r.withdrawEnabled === false ? ' (withdrawals disabled)' : '') + '\n'
      )
    }
    if (rows.length === 0) {
      process.stdout.write('   ⚠ endpoint answered but nothing parsed — payload shape may have changed; save the JSON and report it.\n')
    }
  } catch (err) {
    process.stdout.write(`   FAILED: ${err?.message ?? err}\n`)
  }
}

const { applied, skipped } = buildFeeOverrideMap(allRows)
process.stdout.write(
  `\n── overlay summary ──\n` +
  `   ${allRows.length} live rows parsed; ${applied} match routes in the static table (will overlay), ` +
  `${skipped} have no matching curated route (dropped — overlay never adds routes).\n\n` +
  `Verdict guide: a source is USABLE if HTTP 200 with parsed rows > 0.\n` +
  `Spot-check 2–3 sample fees against the exchange's withdrawal page before trusting the overlay.\n`
)
