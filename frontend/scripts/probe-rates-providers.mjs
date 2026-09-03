#!/usr/bin/env node
// Which quote provider carries the CBOE yield indices? (P3 review D3, follow-up)
// — RUN THIS ON THE OWNER'S MACHINE. It reads provider keys from the local
//   .provider-config.json / env and calls each provider DIRECTLY.
//
// Why a second probe. `npm run rates-probe` goes through the app's own quote
// ladder, so it answers "does the CONFIGURED provider carry ^TNX?" — and on
// 2026-09-02 it answered no, with the AAPL control coming back live from FMP.
// That pins the cause (coverage, not configuration) but not the cure: the
// ladder stops at the first provider that answers, so it can never tell you
// which of the OTHER rungs would have carried the symbol.
//
// This script asks every rung the same question independently, so one run
// covers the whole registry instead of an enable-and-re-run cycle per provider.
//
// Already ruled out before writing this, so they are reported not re-litigated:
//   • FMP           — owner's key, no quote for any of the four (rates-probe, 2026-09-02)
//   • Alpha Vantage — GLOBAL_QUOTE returns an empty object for both `^TNX` and
//                     `TNX` (checked 2026-09-03). Its TREASURY_YIELD function
//                     is a different endpoint in a different symbol space and
//                     cannot settle a ^TNX convention question.
//   • Tiingo        — documented equities/ETF coverage only; no index space.
// They are still probed here, because "ruled out from a different key" is
// weaker evidence than the owner's own key saying so.
//
// Ground truth is the same as the first probe: treasury.gov's official daily
// par curve, keyless, already charted on /macro/rates. A provider quote of
// ~4.79 means no scaling; ~47.9 means yield ×10.
//
// Usage:  npm run rates-providers        (no dev server required)
//
// Ground truth is fetched from home.treasury.gov DIRECTLY, not through the
// app's route. The curve is keyless, so requiring `npm run dev` was a coupling
// this probe never needed — and on 2026-09-03 it cost a whole run: the route
// answered 404 on a live dev server and the probe stopped before asking a
// single provider anything. The app route is still tried first, since it
// caches and is the code that actually ships; treasury.gov is the fallback.
//
// Exit 0 = at least one provider answered and a verdict was reached.
// Exit 1 = nobody carries these symbols, or ground truth was unreachable.
//          Exit 1 is a real result here, not just a failure: see the closing note.

import fs from 'node:fs'
import path from 'node:path'
import { RATES_CATALOG } from '../src/lib/data/ratesCatalog.ts'
import { decideRateScale } from '../src/lib/utils/rateScale.ts'

const BASE =
  process.env.BASE_URL ?? process.env.FN_BASE_URL ?? process.env.CAEP_BASE_URL ?? 'http://localhost:3000'

const out = (s) => process.stdout.write(s)

// ─── Key resolution — same order the app uses: saved config first, then env ───
const ENV_KEYS = {
  fmp: 'FMP_API_KEY',
  finnhub: 'FINNHUB_API_KEY',
  'twelve-data': 'TWELVE_DATA_API_KEY',
  tiingo: 'TIINGO_API_KEY',
  'alpha-vantage': 'ALPHA_VANTAGE_API_KEY',
}

function readSavedConfigs() {
  // process.cwd() is frontend/ when run through npm, matching providers.ts.
  const p = path.join(process.cwd(), '.provider-config.json')
  try {
    if (!fs.existsSync(p)) return {}
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'))
    return raw.configs ?? raw
  } catch {
    return {}
  }
}

const saved = readSavedConfigs()
function keyFor(id) {
  const fromFile = saved?.[id]?.apiKey
  if (typeof fromFile === 'string' && fromFile.trim()) return fromFile.trim()
  const fromEnv = process.env[ENV_KEYS[id]]
  return fromEnv && fromEnv.trim() ? fromEnv.trim() : undefined
}

// ─── The providers, each asked directly ───────────────────────────────────────
// Every host here is already in lib/server/sourceTerms.ts as a quote provider —
// this adds no new source, it just calls the same rungs the ladder calls.
//
// Each entry tries more than one spelling of the symbol, because the caret form
// is not universal: a provider that has the instrument under `TNX` would
// otherwise be recorded as "does not carry it", which is the exact false
// negative this probe exists to avoid.
const PROVIDERS = [
  {
    id: 'fmp',
    name: 'FMP',
    variants: (s) => [s, s.replace(/^\^/, '')],
    url: (sym, key) =>
      `https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(sym)}&apikey=${key}`,
    extract: (j) => (Array.isArray(j) && j.length ? num(j[0].price) : undefined),
  },
  {
    id: 'finnhub',
    name: 'Finnhub',
    variants: (s) => [s, s.replace(/^\^/, '')],
    url: (sym, key) => `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${key}`,
    // Finnhub answers 200 with c:0 for a symbol it does not carry — a zero
    // close is "unknown symbol", never a real yield, so it must not be read
    // as a quote of 0.00%.
    extract: (j) => (num(j?.c) ? num(j.c) : undefined),
  },
  {
    id: 'twelve-data',
    name: 'Twelve Data',
    variants: (s) => [s.replace(/^\^/, ''), s],
    url: (sym, key) => `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(sym)}&apikey=${key}`,
    extract: (j) => (j?.status === 'error' ? undefined : num(j?.close)),
  },
  {
    id: 'alpha-vantage',
    name: 'Alpha Vantage',
    variants: (s) => [s, s.replace(/^\^/, '')],
    url: (sym, key) =>
      `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(sym)}&apikey=${key}`,
    extract: (j) => num(j?.['Global Quote']?.['05. price']),
  },
  {
    id: 'tiingo',
    name: 'Tiingo',
    variants: (s) => [s.replace(/^\^/, ''), s],
    url: (sym, key) =>
      `https://api.tiingo.com/iex/?tickers=${encodeURIComponent(sym)}&token=${key}`,
    extract: (j) => (Array.isArray(j) && j.length ? num(j[0].last ?? j[0].tngoLast) : undefined),
  },
]

function num(v) {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) && n !== 0 ? n : undefined
}

const YIELD_INDICES = RATES_CATALOG.filter((r) => r.quoteBasis === 'pct')

function nearestCurvePoint(points, years) {
  return points.reduce((best, p) => (Math.abs(p.years - years) < Math.abs(best.years - years) ? p : best))
}

async function tryFetch(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 120)}`)
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`non-JSON response: ${text.slice(0, 120)}`)
  }
}

// ─── Ground truth, straight from the source ───────────────────────────────────
// Same XML feed and the same regex parse as lib/server/treasuryCurve.ts. It is
// duplicated rather than imported because that module carries the `server-only`
// build-time pill, which is not in node_modules and so cannot be resolved by
// tsx (see the vitest alias note in CLAUDE.md). Kept to the one field set the
// probe actually needs, so the duplication stays small and obvious.
const CURVE_XML =
  'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve'

const CURVE_FIELDS = [
  { tag: 'BC_3MONTH', label: '3M', years: 3 / 12 },
  { tag: 'BC_6MONTH', label: '6M', years: 6 / 12 },
  { tag: 'BC_1YEAR', label: '1Y', years: 1 },
  { tag: 'BC_2YEAR', label: '2Y', years: 2 },
  { tag: 'BC_5YEAR', label: '5Y', years: 5 },
  { tag: 'BC_7YEAR', label: '7Y', years: 7 },
  { tag: 'BC_10YEAR', label: '10Y', years: 10 },
  { tag: 'BC_20YEAR', label: '20Y', years: 20 },
  { tag: 'BC_30YEAR', label: '30Y', years: 30 },
]

async function fetchCurveDirect() {
  const year = new Date().getUTCFullYear()
  const res = await fetch(`${CURVE_XML}&field_tdr_date_value=${year}`, {
    headers: { Accept: 'application/xml' },
  })
  if (!res.ok) throw new Error(`treasury.gov ${res.status}`)
  const xml = await res.text()

  // Entries are oldest-first; the last parseable one is the newest reading.
  const snapshots = xml
    .split('<entry>')
    .slice(1)
    .map((entry) => {
      const date = entry.match(/<d:NEW_DATE[^>]*>(\d{4}-\d{2}-\d{2})/)?.[1]
      if (!date) return null
      const points = []
      for (const f of CURVE_FIELDS) {
        const m = entry.match(new RegExp(`<d:${f.tag}[^>]*>([\\d.]+)</d:${f.tag}>`))
        if (m) points.push({ label: f.label, years: f.years, yieldPct: Number(m[1]) })
      }
      // A partial row would place a comparison against the wrong maturity.
      return points.length >= 8 ? { date, points } : null
    })
    .filter(Boolean)

  if (!snapshots.length) throw new Error('treasury.gov returned no parseable curve rows')
  return snapshots[snapshots.length - 1]
}

async function main() {
  out('\n══ Which provider carries the CBOE yield indices? ══\n')

  // ── Ground truth ───────────────────────────────────────────────────────────
  let truth, viaApp
  try {
    const res = await fetch(BASE + '/live-data/treasury-yield-curve', { headers: { Accept: 'application/json' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = await res.json()
    if (body?.ok === false) throw new Error(body.error ?? 'route reported not-ok')
    truth = body.latest
    viaApp = true
  } catch (err) {
    out(`\n  (app route unavailable — ${err?.message ?? err}; going to treasury.gov directly)\n`)
    try {
      truth = await fetchCurveDirect()
    } catch (err2) {
      out(`\n✗ Could not fetch the Treasury curve from either source: ${err2?.message ?? err2}\n`)
      out('  This half needs no API key, so a failure here is the network, not a\n')
      out('  missing provider key. Without ground truth a returned quote could not\n')
      out('  be judged either way, so this stops rather than printing numbers\n')
      out('  nobody can interpret.\n\n')
      process.exitCode = 1
      return
    }
  }
  out(`\nTreasury par curve (home.treasury.gov${viaApp ? ', via the app route' : ', direct'}), ${truth.date} — authoritative:\n`)
  for (const p of truth.points) out(`   ${p.label.padEnd(4)} ${p.yieldPct.toFixed(2)}%\n`)

  // ── Every provider, every index ────────────────────────────────────────────
  const verdicts = []
  let anyKeyed = false

  for (const prov of PROVIDERS) {
    const key = keyFor(prov.id)
    out(`\n── ${prov.name} ${'─'.repeat(Math.max(0, 56 - prov.name.length))}\n`)
    if (!key) {
      out('   no key configured — skipped. Not evidence either way: an unkeyed\n')
      out('   provider is untested, not ruled out.\n')
      continue
    }
    anyKeyed = true

    for (const idx of YIELD_INDICES) {
      const ref = nearestCurvePoint(truth.points, idx.maturityYears ?? 10)
      let got, usedSymbol, lastErr
      for (const sym of prov.variants(idx.symbol)) {
        try {
          const value = prov.extract(await tryFetch(prov.url(sym, key)))
          if (value !== undefined) {
            got = value
            usedSymbol = sym
            break
          }
        } catch (err) {
          lastErr = err?.message ?? String(err)
        }
      }

      if (got === undefined) {
        const why = lastErr ? `error: ${lastErr}` : 'no quote (symbol not carried)'
        out(`   ${idx.symbol.padEnd(6)} — ${why}\n`)
        continue
      }

      const v = decideRateScale(got, ref.yieldPct)
      const asSym = usedSymbol === idx.symbol ? '' : ` (as "${usedSymbol}")`
      out(
        `   ${idx.symbol.padEnd(6)} raw ${String(Number(got.toFixed(4))).padEnd(9)}${asSym} vs ${ref.label} ${ref.yieldPct.toFixed(2)}%  →  ${v.scale}${v.inconclusive ? ' (INCONCLUSIVE)' : ''}\n`
      )
      verdicts.push({ provider: prov.name, symbol: idx.symbol, ...v })
    }
  }

  // ── Conclusion ─────────────────────────────────────────────────────────────
  out('\n══ Conclusion ══\n')

  if (!anyKeyed) {
    out('No provider key was found in .provider-config.json or the environment,\n')
    out('so nothing was actually probed. Add a key on Integrations and re-run.\n\n')
    process.exitCode = 1
    return
  }

  const decided = verdicts.filter((v) => !v.inconclusive)
  if (decided.length === 0) {
    out('No provider carries the CBOE yield indices with a usable quote.\n\n')
    out('That is a finding, not a dead end. If nothing reachable quotes ^IRX/\n')
    out('^FVX/^TNX/^TYX, then `quoteBasis: \'pct\'` on those four catalog entries\n')
    out('is unreachable code, the UI\'s formatRateQuote can never mis-render them,\n')
    out('and the ×10 language in agents/prompts.ts and agents/tools.ts instructs a\n')
    out('division on data that never arrives. The honest resolution is then to\n')
    out('drop that language and let the official Treasury curve be the sole rates\n')
    out('source — which prompts.ts:576 and tools.ts:387 already tell agents to\n')
    out('prefer. Do NOT "fix" the UI by dividing by ten on a hypothesis.\n\n')
    process.exitCode = 1
    return
  }

  const scales = new Set(decided.map((v) => v.scale))
  if (scales.size > 1) {
    out('⚠ Providers DISAGREE about the scale:\n')
    for (const v of decided) out(`   ${v.provider} ${v.symbol}: ${v.scale}\n`)
    out('\nDo not pick a winner by majority. A per-provider normalization belongs\n')
    out('in marketData.ts next to that provider, not in the shared formatter.\n\n')
    process.exitCode = 0
    return
  }

  const scale = [...scales][0]
  out(`Settled on ${decided.length} live quote(s): scale = ${scale}\n\n`)
  if (scale === 'divide-by-ten') {
    out('The indices quote yield ×10 — the AGENT PROMPTS ARE RIGHT and the UI is\n')
    out('wrong: ratesCatalog.ts formatRateQuote renders the raw value as a percent,\n')
    out('so a ^TNX of 47.9 prints as "47.90%". Fix by scaling at the fetch boundary\n')
    out('(applyRateScale in marketData.ts) rather than in the formatter, so charts,\n')
    out('the scanner and Compare inherit the correction too.\n\n')
  } else {
    out('The indices quote the yield as-is — the UI IS RIGHT and the four ×10\n')
    out('statements in agents/prompts.ts and agents/tools.ts are wrong. An agent\n')
    out('following them would report a 4.79% ten-year as 0.479%. Fix the prompts.\n\n')
  }
}

main().catch((err) => {
  out(`\n✗ Unexpected failure: ${err?.stack ?? err}\n\n`)
  process.exitCode = 1
})
