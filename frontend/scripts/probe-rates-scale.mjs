#!/usr/bin/env node
// Settle the ×10 question on the CBOE yield indices (P3 review D3)
// — RUN THIS ON THE OWNER'S MACHINE, with a quote provider key configured.
//
// The contradiction: `ratesCatalog.ts`'s formatRateQuote renders a yield-index
// quote as `${value.toFixed(2)}%` — the raw number, straight through — while
// `agents/prompts.ts` and `agents/tools.ts` state in four places that these
// indices quote the yield ×10 ("^TNX 42.5 = 4.25%"). There is no ÷10 anywhere
// in marketData.ts. One of the two is wrong: either every rates KPI in the UI
// is off by a factor of ten, or the agent instructions are.
//
// It cannot be settled by reading. It needs a live quote next to a known-good
// yield, and the build environment's egress proxy blocks both home.treasury.gov
// and every quote provider — the same rule as the gas and exchange-fee probes.
//
// The comparison is possible because the app already carries an authoritative,
// keyless answer: treasury.gov's daily par yield curve, which /macro/rates
// already charts. That is ground truth. This script puts the provider's raw
// quote beside it and reports which interpretation matches.
//
// Usage:  npm run dev      (in another terminal)
//         npm run rates-probe
//
// Goes through the app's own /live-data routes rather than importing the
// fetchers directly, for two reasons: `server-only` is a Next build-time pill
// that is not in node_modules (see the vitest alias note in CLAUDE.md), and the
// routes are what actually ships, provider config included. Same convention as
// scripts/test-live-data.mjs.
//
// Exit code 0 = a verdict was reached; 1 = not enough data to decide.

import { RATES_CATALOG } from '../src/lib/data/ratesCatalog.ts'
import { decideRateScale } from '../src/lib/utils/rateScale.ts'

const BASE =
  process.env.BASE_URL ?? process.env.FN_BASE_URL ?? process.env.CAEP_BASE_URL ?? 'http://localhost:3000'

async function getJson(path) {
  const res = await fetch(BASE + path, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${path}`)
  return res.json()
}

/** Yield indices only — the futures quote points of par and are not in question. */
const YIELD_INDICES = RATES_CATALOG.filter((r) => r.quoteBasis === 'pct')

/** Pick the curve point closest in maturity to the index. */
function nearestCurvePoint(points, years) {
  return points.reduce((best, p) =>
    Math.abs(p.years - years) < Math.abs(best.years - years) ? p : best
  )
}

const out = (s) => process.stdout.write(s)

async function main() {
  out('\n══ ×10 probe — CBOE yield indices vs the official Treasury curve ══\n')

  // ── 1. Ground truth ────────────────────────────────────────────────────────
  let curve
  try {
    const body = await getJson('/live-data/treasury-yield-curve')
    if (body?.ok === false) throw new Error(body.error ?? 'route reported not-ok')
    curve = body
  } catch (err) {
    out(`\n✗ Could not fetch the Treasury curve: ${err?.message ?? err}\n`)
    out('  Base URL: ' + BASE + " - is 'npm run dev' running?\n")
    out('  Without ground truth there is nothing to compare against. This half\n')
    out('  needs no API key, so a failure here is the server or the network, not\n')
    out('  a missing provider key.\n\n')
    process.exitCode = 1
    return
  }
  const truth = curve.latest
  out(`\nTreasury par curve (home.treasury.gov), ${truth.date} — authoritative:\n`)
  for (const p of truth.points) out(`   ${p.label.padEnd(4)} ${p.yieldPct.toFixed(2)}%\n`)

  // ── 2. What the app's own quote ladder returns ─────────────────────────────
  const symbols = YIELD_INDICES.map((r) => r.symbol)
  let quotes = {}
  let source = 'none'
  try {
    const res = await getJson(`/live-data/security-quotes?symbols=${symbols.join(',')}`)
    quotes = res.quotes ?? {}
    source = res.source ?? 'unknown'
  } catch (err) {
    out(`\n✗ Quote fetch threw: ${err?.message ?? err}\n`)
    process.exitCode = 1
    return
  }
  out(`\nLive quotes via the app's own ladder (source: ${source}):\n`)

  // A macro symbol has no catalog reference price (ratesCatalog carries none by
  // design), so "no quote" is ambiguous on its own: it means either the ladder
  // had no configured rung to try, or every rung was tried and none carries
  // these indices. Those need opposite fixes, so settle it with a control.
  // AAPL is in the curated equity catalog, so it always answers — the question
  // is whether it answers LIVE.
  let control = null
  try {
    const res = await getJson('/live-data/security-quotes?symbols=AAPL')
    const q = res.quotes?.AAPL
    control = { source: res.source ?? 'unknown', live: !!q && !q.reference }
  } catch {
    /* control is best-effort; the main verdict does not depend on it */
  }

  // ── 3. Compare both interpretations against ground truth ───────────────────
  const verdicts = []
  for (const inst of YIELD_INDICES) {
    const q = quotes[inst.symbol.toUpperCase()]
    const near = nearestCurvePoint(truth.points, inst.maturityYears)

    if (!q || typeof q.price !== 'number') {
      out(`\n   ${inst.symbol.padEnd(6)} no quote returned — provider does not carry it\n`)
      continue
    }
    if (q.reference) {
      out(`\n   ${inst.symbol.padEnd(6)} REFERENCE price, not live — cannot judge from this\n`)
      continue
    }

    const raw = q.price
    const v = decideRateScale(raw, near.yieldPct)

    out(`\n   ${inst.symbol.padEnd(6)} raw quote ${raw}\n`)
    out(`          vs Treasury ${near.label} = ${near.yieldPct.toFixed(2)}%\n`)
    out(`          rendered as-is : ${raw.toFixed(2)}%   (off by ${v.errorAsIs.toFixed(2)} pts)\n`)
    out(`          divided by 10  : ${(raw / 10).toFixed(2)}%   (off by ${v.errorDivideByTen.toFixed(2)} pts)\n`)

    if (v.inconclusive) {
      // Neither reading lands near the curve. That is not a scaling answer — it
      // is a wrong symbol, a stale print, or a provider returning a price. Not
      // counted, so it cannot be laundered into a verdict.
      out('          -> INCONCLUSIVE: neither reading is near the curve.\n')
      out('             Check the symbol and the provider before concluding.\n')
      continue
    }
    verdicts.push(v.scale)
    out(`          -> ${v.scale === 'divide-by-ten' ? 'DIVIDE BY 10 matches' : 'AS-IS matches'}\n`)
  }

  // ── 4. Verdict ─────────────────────────────────────────────────────────────
  out('\n── Verdict ──\n')
  if (verdicts.length === 0) {
    out('  No live yield-index quote was available, so nothing is settled.\n\n')
    if (control && control.live) {
      out(`  Your provider keys ARE working — the control symbol AAPL came back\n`)
      out(`  live from '${control.source}'. So the ladder is configured and\n`)
      out('  reachable; the configured provider simply does not carry the CBOE\n')
      out('  yield indices. Enable one that does on Integrations and re-run.\n')
      out('  Tiingo definitively does not carry them.\n')
    } else if (control) {
      out(`  The control symbol AAPL also came back non-live (source: '${control.source}'),\n`)
      out('  so this is NOT about ^TNX coverage — no quote provider is answering\n')
      out('  at all. Add a key on Integrations, confirm it saves, and re-run.\n')
    } else {
      out('  The control check could not run, so the cause is undetermined:\n')
      out('  either no provider key is configured, or none carries these indices.\n')
    }
    out('\n')
    process.exitCode = 1
    return
  }
  const divTenWins = verdicts.filter((v) => v === 'divide-by-ten').length
  const asIsWins = verdicts.length - divTenWins

  if (divTenWins === verdicts.length) {
    out(`  All ${verdicts.length} indices match on DIVIDE BY 10.\n`)
    out('  => The agent prompts are right and THE UI IS WRONG: every rates KPI\n')
    out('     currently reads 10x too high.\n')
    out('  Fix: normalise in the quote path, not at each render site, so the API,\n')
    out('  the agent tools and the UI cannot drift again. Then assert it in a test.\n')
  } else if (asIsWins === verdicts.length) {
    out(`  All ${verdicts.length} indices match AS-IS.\n`)
    out('  => The UI is right and THE AGENT INSTRUCTIONS ARE WRONG.\n')
    out('  Fix: delete the "yield x10" claim from agents/prompts.ts and the two\n')
    out('  sites in agents/tools.ts. No code path changes.\n')
  } else {
    out(`  SPLIT: ${divTenWins} say divide-by-10, ${asIsWins} say as-is.\n`)
    out('  Do not apply a blanket fix. A split means the scaling is per-symbol or\n')
    out('  per-provider — record which provider answered and re-run against a\n')
    out('  second one before changing anything.\n')
  }
  out('\n')
  process.exitCode = 0

}

await main()
