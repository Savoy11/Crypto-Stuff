#!/usr/bin/env node
// P2-O1 — options & futures data-source probe.
//
// ⚠ RUN THIS FROM THE OWNER'S MACHINE ONLY. Data-availability verdicts are
// IP-dependent (see .claude/agents/code-auditor.md): datacenter IPs get
// blocked, rate-limited, or geo-fenced differently from residential ones, so
// a container/CI run produces a systematically wrong baseline. The script
// refuses nothing — it just measures — but its output is only meaningful as
// P2-O1 evidence when produced on the machine the app actually runs from.
//
// What it measures (read-only, no keys, no writes):
//   1. CBOE delayed-quotes JSON  — official, keyless, ~15-min delayed chains
//   2. Yahoo Finance options     — unofficial keyless chains (v7 API)
//   3. Yahoo individual futures contract months — the P2-O4 term-structure
//      question: do CLZ26.NYM-style symbols quote through the same chart API
//      the app already uses for continuous front-months?
//
// What it deliberately does NOT do: read terms of use (a human/assistant job —
// quote the clauses in the P2-O1 report), test key-gated tiers (Tradier /
// Finnhub / Polygon — no keys to test with), or render any verdict. The
// verdict belongs in docs/assessments/P2-O1-options-data.md, written from
// this output.
//
//   node scripts/audit-options-data.mjs           # human-readable report
//   node scripts/audit-options-data.mjs --json    # JSON only (paste this back)

const JSON_MODE = process.argv.includes('--json')

const UA = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/json',
}
const TIMEOUT_MS = 15_000

const results = { startedAt: new Date().toISOString(), probes: [] }

function log(line = '') {
  if (!JSON_MODE) console.log(line)
}

async function probe(name, url, inspect) {
  const started = Date.now()
  const entry = { name, url, status: null, ok: false, latencyMs: null, error: null, detail: null }
  try {
    const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'follow' })
    entry.status = res.status
    entry.latencyMs = Date.now() - started
    if (!res.ok) {
      entry.error = `HTTP ${res.status}`
      const text = await res.text().catch(() => '')
      entry.detail = { bodyPreview: text.slice(0, 200) }
    } else {
      const body = await res.json()
      entry.detail = inspect(body)
      entry.ok = true
    }
  } catch (err) {
    entry.latencyMs = Date.now() - started
    entry.error = err?.name === 'TimeoutError' ? `timeout after ${TIMEOUT_MS}ms` : String(err?.message ?? err)
  }
  results.probes.push(entry)

  const flag = entry.ok ? 'OK  ' : 'FAIL'
  log(`  [${flag}] ${name} — ${entry.status ?? '—'} in ${entry.latencyMs}ms${entry.error ? ` (${entry.error})` : ''}`)
  if (entry.ok && entry.detail && !JSON_MODE) {
    for (const [k, v] of Object.entries(entry.detail)) log(`         ${k}: ${JSON.stringify(v)}`)
  }
  return entry
}

/** Which of `keys` are present and non-null on `obj` — the field-coverage question. */
function fieldCoverage(obj, keys) {
  const present = []
  const missing = []
  for (const k of keys) (obj?.[k] != null ? present : missing).push(k)
  return { present, missing }
}

// ─── 1. CBOE delayed quotes ───────────────────────────────────────────────────
// Official, keyless, ~15-min delayed. Equities/ETFs are bare symbols; indices
// take an underscore prefix (_SPX). The delay characteristics and the terms of
// use are the two things the P2-O1 verdict turns on.

async function cboe() {
  log('\nCBOE delayed-quotes JSON (official, keyless, ~15-min delayed)')
  const OPTION_FIELDS = ['bid', 'ask', 'last_trade_price', 'volume', 'open_interest', 'iv', 'delta', 'gamma', 'theta', 'vega']
  const inspect = (body) => {
    const data = body?.data
    const options = data?.options ?? []
    const first = options[0] ?? null
    return {
      symbol: data?.symbol ?? null,
      optionCount: options.length,
      underlyingClose: data?.close ?? null,
      quoteTimestamp: body?.timestamp ?? data?.last_trade_time ?? null,
      firstContract: first?.option ?? null,
      fields: first ? fieldCoverage(first, OPTION_FIELDS) : null,
    }
  }
  await probe('CBOE chain AAPL (equity)', 'https://cdn.cboe.com/api/global/delayed_quotes/options/AAPL.json', inspect)
  await probe('CBOE chain SPY (ETF)', 'https://cdn.cboe.com/api/global/delayed_quotes/options/SPY.json', inspect)
  await probe('CBOE chain _SPX (index)', 'https://cdn.cboe.com/api/global/delayed_quotes/options/_SPX.json', inspect)
}

// ─── 2. Yahoo options ─────────────────────────────────────────────────────────
// Unofficial keyless, same family as the spark/chart/quoteSummary endpoints the
// app already leans on. Yahoo has been tightening cookie/crumb requirements on
// some v-APIs — a 401/403 here is itself the finding, so both hosts are tried.

async function yahoo() {
  log('\nYahoo Finance options (unofficial keyless)')
  const CONTRACT_FIELDS = ['bid', 'ask', 'lastPrice', 'volume', 'openInterest', 'impliedVolatility', 'inTheMoney']
  const inspect = (body) => {
    const result = body?.optionChain?.result?.[0]
    const calls = result?.options?.[0]?.calls ?? []
    const first = calls[0] ?? null
    return {
      symbol: result?.underlyingSymbol ?? null,
      expirationCount: result?.expirationDates?.length ?? 0,
      strikeCount: result?.strikes?.length ?? 0,
      callsAtFirstExpiry: calls.length,
      quoteTime: result?.quote?.regularMarketTime ?? null,
      firstContract: first?.contractSymbol ?? null,
      fields: first ? fieldCoverage(first, CONTRACT_FIELDS) : null,
      // Distinguishes "reachable but OI/IV are junk" from "fully populated":
      // Yahoo is known to zero OI outside market hours on some symbols.
      firstOpenInterest: first?.openInterest ?? null,
      firstIv: first?.impliedVolatility ?? null,
    }
  }
  await probe('Yahoo chain AAPL (query2)', 'https://query2.finance.yahoo.com/v7/finance/options/AAPL', inspect)
  await probe('Yahoo chain AAPL (query1)', 'https://query1.finance.yahoo.com/v7/finance/options/AAPL', inspect)
  await probe('Yahoo chain SPY', 'https://query2.finance.yahoo.com/v7/finance/options/SPY', inspect)
}

// ─── 3. Individual futures contract months ────────────────────────────────────
// The P2-O4 gate. The app already charts continuous front-months (CL=F, GC=F,
// ZN=F) through Yahoo's v8 chart API; a term-structure view needs the
// individual months (CLZ26.NYM style). Probe several months across three
// exchanges, plus one continuous control that is KNOWN to work — if the
// control fails, the whole section says "Yahoo unreachable", not "months
// don't quote".
//
// Month codes: F=Jan G=Feb H=Mar J=Apr K=May M=Jun N=Jul Q=Aug U=Sep V=Oct
// X=Nov Z=Dec. Symbols are exchange-suffixed: .NYM (NYMEX), .CMX (COMEX),
// .CBT (CBOT).

function futureMonthSymbols(now = new Date()) {
  const MONTH_CODES = ['F', 'G', 'H', 'J', 'K', 'M', 'N', 'Q', 'U', 'V', 'X', 'Z']
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  const out = []
  // Next 6 calendar months, skipping the current one (its contract may have
  // just expired — near-month listing gaps would read as false negatives).
  for (let i = 1; i <= 6; i++) {
    const m = (month + i) % 12
    const y = year + Math.floor((month + i) / 12)
    out.push({ code: MONTH_CODES[m], yy: String(y % 100).padStart(2, '0') })
  }
  return out
}

async function futuresMonths() {
  log('\nIndividual futures contract months (Yahoo v8 chart — the P2-O4 gate)')
  const inspect = (body) => {
    const result = body?.chart?.result?.[0]
    const closes = result?.indicators?.quote?.[0]?.close?.filter((c) => c != null) ?? []
    return {
      symbol: result?.meta?.symbol ?? null,
      lastPrice: result?.meta?.regularMarketPrice ?? null,
      bars: closes.length,
      firstBar: result?.timestamp?.[0] ? new Date(result.timestamp[0] * 1000).toISOString().slice(0, 10) : null,
      error: body?.chart?.error?.description ?? null,
    }
  }
  const chartUrl = (sym) =>
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=3mo&interval=1d`

  // Control: continuous front-month, known to work in the app today.
  await probe('control CL=F (continuous)', chartUrl('CL=F'), inspect)

  const months = futureMonthSymbols()
  const contracts = [
    { root: 'CL', suffix: '.NYM', label: 'WTI crude' },
    { root: 'GC', suffix: '.CMX', label: 'gold' },
    { root: 'ZC', suffix: '.CBT', label: 'corn' },
    { root: 'ZN', suffix: '.CBT', label: '10Y note' },
  ]
  for (const { root, suffix, label } of contracts) {
    // Two months per root keeps the probe polite; coverage across roots and
    // exchanges matters more than depth on one.
    for (const { code, yy } of [months[0], months[3]]) {
      const sym = `${root}${code}${yy}${suffix}`
      await probe(`${label} ${sym}`, chartUrl(sym), inspect)
    }
  }
}

// ─── Run ──────────────────────────────────────────────────────────────────────

log('P2-O1 options & futures data probe')
log('⚠ Only meaningful when run from the owner\'s machine — datacenter IPs skew every verdict.')

await cboe()
await yahoo()
await futuresMonths()

results.finishedAt = new Date().toISOString()
const okCount = results.probes.filter((p) => p.ok).length
results.summary = { ok: okCount, failed: results.probes.length - okCount, total: results.probes.length }

if (JSON_MODE) {
  console.log(JSON.stringify(results, null, 2))
} else {
  log(`\n${okCount}/${results.probes.length} probes returned data.`)
  log('\nPaste the full JSON back for the P2-O1 assessment:')
  log('  node scripts/audit-options-data.mjs --json > options-probe.json')
  log('\nNot covered here, by design: provider terms of use (quoted by hand in the')
  log('report), and key-gated tiers (Tradier/Finnhub/Polygon — nothing to test keyless).')
}
