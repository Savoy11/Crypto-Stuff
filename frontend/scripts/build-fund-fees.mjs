// Reconcile the fund catalog's expense ratios and sales loads against the SEC's
// Risk/Return Summary data sets — the prospectus fee table, structured.
//
//   node scripts/build-fund-fees.mjs --inspect     discover tables/tags, change nothing
//   node scripts/build-fund-fees.mjs               write a reconciliation report
//
// WHY THIS EXISTS
//
// build-fund-facts.mjs says it plainly: "Expense ratio is deliberately NOT here:
// N-PORT does not carry it (verified — there is no expense tag in the schema).
// That needs prospectus parsing or a paid vendor." This is the missing half.
// The SEC publishes each fund's prospectus fee table as structured XBRL and
// aggregates it quarterly, so the numbers behind FUND_CATALOG's expenseRatioPct
// — and the sales loads that SalesCharge deliberately leaves unverified — are
// free, primary-source, and machine-readable.
//
// It matters because those figures are load-bearing. computeFeeDrag projects a
// 30-year dollar cost from expenseRatioPct; the Portfolio Builder blends it into
// plan fees; reviewPlan checks fee creep against it. Ten of them were found
// wrong on 2026-09-02 and corrected by hand against prospectuses. Hand
// verification does not scale to 126 funds and does not repeat reliably — which
// is the whole argument for a script.
//
// WHAT IT WILL NOT DO
//
// It does not write the catalog. It emits a report: current value, SEC value,
// delta, and the filing the number came from. A human reads it and decides.
// That split is deliberate and matches apply-fee-updates.ts — an automated
// overwrite of a fee figure is exactly how a correct number lands on the wrong
// fund, and share classes make that easy (AGTHX, AGTFX, CGFAX… same fund,
// different fees). Matching is on TICKER, never on a name or a number.
//
// It also never moves FUND_DATA_LAST_VERIFIED. That date asserts the whole
// table was compiled on one day; only a human who reviewed every row can move
// it. Same rule as TRANSFER_FEES_LAST_VERIFIED.
//
// FIRST RUN: USE --inspect
//
// The RR data sets are versioned and this script has never been run against
// them — this environment cannot reach sec.gov, so the table and tag names
// below are CANDIDATES, not verified readings. --inspect prints what the
// archive actually contains so they can be confirmed (or corrected) before any
// number is believed. A tag that does not match is reported as unmatched; it is
// never silently swapped for a similar-looking one.

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_JSON = path.join(ROOT, 'fund-fee-reconcile.json')
const OUT_CSV = path.join(ROOT, 'fund-fee-worksheet.csv')

// SEC index pages for the Risk/Return Summary data sets.
//
// A LIST, not a constant, because the single URL this started with answered 404
// on the first real run (2026-09-03). sec.gov has reorganised its data-research
// section more than once, and hard-coding one path makes the whole script
// useless the next time it moves. Each candidate is tried in order and the one
// that answers is reported, so a future 404 says which paths were tried rather
// than just failing.
//
// Override with RR_INDEX_URL=<url> when none of these work — that is faster
// than editing the script, and the error below tells the reader to do it.
const INDEX_URLS = process.env.RR_INDEX_URL ? [process.env.RR_INDEX_URL] : [
  'https://www.sec.gov/dera/data/mutual-fund-prospectus-risk-return-summary-data-sets',
  'https://www.sec.gov/data-research/mutual-fund-prospectus-risk-return-summary-data-sets',
  'https://www.sec.gov/data-research/sec-markets-data/mutual-fund-prospectus-risk-return-summary-data-sets',
  'https://www.sec.gov/about/dera-mutual-fund-prospectus-risk-return-summary-data-sets',
  'https://www.sec.gov/dera/data/mutual-fund-prospectus-risk-return-summary-data-sets.html',
]
// EDGAR requires a descriptive UA identifying the requester — same string the
// app's edgar.ts sends.
const UA = { 'User-Agent': 'Finance Now research dashboard (marcusowens94@gmail.com)' }

const log = (...a) => console.log(...a)

/** Which index page actually answered — recorded so the report names its source. */
let resolvedIndexUrl = null

/**
 * XBRL element names for the numbers we want, most-specific first.
 *
 * CANDIDATES, NOT CONFIRMED. The RR taxonomy is public but unread from here.
 * Each field reports which candidate matched, and a field whose candidates all
 * miss is reported as unmatched rather than filled from a near-miss — a fee
 * read off the wrong element is worse than no fee.
 */
const TAG_CANDIDATES = {
  netExpenseRatio: [
    'NetExpensesOverAssets',
    'ExpensesOverAssets',
    'NetAnnualFundOperatingExpensesOverAssets',
  ],
  grossExpenseRatio: [
    'GrossExpensesOverAssets',
    'TotalAnnualFundOperatingExpensesOverAssets',
    'OperatingExpensesOverAssets',
  ],
  frontLoad: [
    'MaximumSalesChargeImposedOnPurchasesOverOfferingPrice',
    'MaximumSalesChargeOverOfferingPrice',
  ],
  deferredLoad: [
    'MaximumDeferredSalesChargeOverOfferingPrice',
    'MaximumDeferredSalesChargeOverOther',
  ],
  twelveB1: [
    'DistributionAndService12b1FeesOverAssets',
    'DistributionOrSimilarNon12b1FeesOverAssets',
  ],
}

async function newestDatasetUrl() {
  let html = null
  let usedIndex = null
  const tried = []
  for (const url of INDEX_URLS) {
    try {
      const res = await fetch(url, { headers: UA })
      tried.push(`${url} → HTTP ${res.status}`)
      if (!res.ok) continue
      const body = await res.text()
      // A 200 that carries no archive link is the wrong page, not the right one
      // with no data — keep looking rather than reporting "no datasets found".
      if (!/_rr\.zip/i.test(body)) continue
      html = body
      usedIndex = url
      resolvedIndexUrl = url
      break
    } catch (err) {
      tried.push(`${url} → ${err?.message ?? err}`)
    }
  }
  if (!html) {
    throw new Error(
      'could not find the RR dataset index. Tried:\n' +
      tried.map((t) => `    ${t}`).join('\n') +
      '\n\n  sec.gov reorganises this section periodically. Find the current page' +
      '\n  (search sec.gov for "Mutual Fund Prospectus Risk/Return Summary Data Sets"),' +
      '\n  then re-run with:  RR_INDEX_URL=<url> npm run fund-fees' +
      '\n  and add it to INDEX_URLS so the next person does not repeat this.'
    )
  }
  log(`index: ${usedIndex}`)
  // Archives are named like 2026q2_rr.zip. Sorted descending so the newest wins
  // regardless of the page's own ordering.
  const links = [...html.matchAll(/href="([^"]*(\d{4})q(\d)_rr\.zip)"/gi)]
    .map((m) => ({ href: m[1], key: `${m[2]}q${m[3]}` }))
    .sort((a, b) => b.key.localeCompare(a.key))
  if (links.length === 0) {
    throw new Error(
      `no RR dataset links found on ${usedIndex}\n` +
      '  The page layout or archive naming may have changed. Open it and check ' +
      'the filename pattern before assuming the data is gone.'
    )
  }
  const first = links[0].href
  log(`newest dataset: ${links[0].key}`)
  return first.startsWith('http') ? first : `https://www.sec.gov${first}`
}

async function download(url, dest) {
  log(`downloading ${url.split('/').pop()} …`)
  const res = await fetch(url, { headers: UA })
  if (!res.ok) throw new Error(`download: HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  fs.writeFileSync(dest, buf)
  log(`  ${(buf.length / 1048576).toFixed(1)} MB written`)
}

/** Extract with whatever the platform provides — avoids a zip dependency. */
function extract(zipPath, dir) {
  log('extracting …')
  if (process.platform === 'win32') {
    execFileSync('powershell', [
      '-NoProfile', '-Command',
      `Expand-Archive -Path '${zipPath}' -DestinationPath '${dir}' -Force`,
    ], { stdio: 'inherit' })
  } else {
    execFileSync('unzip', ['-o', '-q', zipPath, '-d', dir], { stdio: 'inherit' })
  }
}

/** Minimal delimited-file reader; SEC data sets are tab-separated with a header row. */
function readTable(file) {
  const text = fs.readFileSync(file, 'utf8')
  const lines = text.split(/\r?\n/).filter(Boolean)
  const delim = lines[0].includes('\t') ? '\t' : ','
  const split = (l) => l.split(delim).map((c) => c.trim().replace(/^"|"$/g, ''))
  const header = split(lines[0])
  return { header, rows: lines.slice(1).map(split) }
}

/** Case-insensitive column lookup — SEC headers vary in case across data sets. */
function col(header, ...names) {
  for (const n of names) {
    const i = header.findIndex((h) => h.toUpperCase() === n.toUpperCase())
    if (i >= 0) return i
  }
  return -1
}

function requireCol(header, file, ...names) {
  const i = col(header, ...names)
  if (i < 0) {
    throw new Error(
      `${file}: none of [${names.join(', ')}] found. Columns present:\n  ${header.join(' | ')}\n` +
      '  Run with --inspect and update the column names rather than guessing.'
    )
  }
  return i
}


/**
 * Decide, ONCE for the whole dataset, whether rates are decimals or percents.
 *
 * WHY THIS IS NOT A PER-VALUE HEURISTIC. XBRL rates may be filed as decimals
 * (0.0003) or as whole percents (0.03), and for expense ratios the two ranges
 * OVERLAP: a real ratio spans roughly 0.01%–3%, which is 0.0001–0.03 as a
 * decimal and 0.01–3 as a percent. So the single value 0.03 is either 3% or
 * 0.03% and nothing about the number itself can say which — and 0.03% is VOO,
 * one of the most common ratios in this catalog. A per-value rule would produce
 * a silent 100x error on exactly the cheap index funds that dominate here,
 * which is the class of error this script exists to catch, not create.
 *
 * Instead it calibrates against values already known to be right: the catalog's
 * own ratios, ten of which were hand-verified against prospectuses on
 * 2026-09-02. Whichever interpretation lands closer, across every matched fund,
 * is the dataset's basis. If neither wins decisively the run ABORTS — an
 * undecidable basis means the numbers cannot be read at all, and reporting them
 * under a coin-flip would be worse than reporting nothing.
 */
function calibrateBasis(samples) {
  if (samples.length < MIN_CALIBRATION_SAMPLES) {
    throw new Error(
      `only ${samples.length} funds matched with an expense value; need at least ` +
      `${MIN_CALIBRATION_SAMPLES} to decide whether the dataset reports decimals or percents.\n` +
      '  Too few to calibrate means the unit is unknown, and a wrong unit is a ' +
      '100x error on every row. Widen the match (check the ticker column) rather ' +
      'than lowering this floor.'
    )
  }
  const medianErr = (mult) => {
    const errs = samples.map((s) => Math.abs(s.raw * mult - s.catalogPct)).sort((a, b) => a - b)
    return errs[Math.floor(errs.length / 2)]
  }
  const asDecimal = medianErr(100)
  const asPercent = medianErr(1)
  const winner = asDecimal < asPercent
    ? { basis: 'decimal', mult: 100, err: asDecimal, other: asPercent }
    : { basis: 'whole-percent', mult: 1, err: asPercent, other: asDecimal }

  // Decisive means both "close enough to be right" and "clearly better than the
  // alternative". Either test alone can pass on noise.
  const closeEnough = winner.err <= MAX_CALIBRATION_MEDIAN_ERR_PCT
  const clearlyBetter = winner.other >= winner.err * CALIBRATION_MARGIN
  if (!closeEnough || !clearlyBetter) {
    throw new Error(
      'cannot determine the dataset unit.\n' +
      `  as decimals:  median error ${asDecimal.toFixed(4)}pp\n` +
      `  as percents:  median error ${asPercent.toFixed(4)}pp\n` +
      `  (need the winner <= ${MAX_CALIBRATION_MEDIAN_ERR_PCT}pp and at least ` +
      `${CALIBRATION_MARGIN}x better than the alternative)\n` +
      '  Both readings differ from the catalog by too much to be a unit question, ' +
      'which means either the catalog is badly wrong or the wrong tag matched. ' +
      'Run --inspect and look at the tag list before trusting any number here.'
    )
  }
  return winner
}

/** Funds needed before the decimal-vs-percent decision is trustworthy. */
const MIN_CALIBRATION_SAMPLES = 5
/** How close the winning interpretation must sit to the catalog, in points. */
const MAX_CALIBRATION_MEDIAN_ERR_PCT = 0.05
/** How much better than the alternative the winner must be. */
const CALIBRATION_MARGIN = 5

/** A raw XBRL value as a number, or null when it is not a usable rate. */
function rawRate(raw) {
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

async function main() {
  const inspect = process.argv.includes('--inspect')

  // Cached in a stable location: the archive is large and re-downloading it to
  // re-check a column name is wasteful. Delete the folder to force a fresh pull.
  const work = path.join(os.tmpdir(), 'fn-rr-cache')
  fs.mkdirSync(work, { recursive: true })
  const zip = path.join(work, 'rr.zip')

  if (!fs.existsSync(zip)) {
    await download(await newestDatasetUrl(), zip)
  } else {
    log(`using cached archive (${(fs.statSync(zip).size / 1048576).toFixed(1)} MB)`)
  }

  const already = fs.readdirSync(work).some((f) => /^num\.(tsv|txt)$/i.test(f))
  if (!already) extract(zip, work)

  const files = fs.readdirSync(work).filter((f) => /\.(tsv|txt|csv)$/i.test(f))

  if (inspect) {
    log('\n══ RR dataset contents ══')
    for (const f of files) {
      const { header, rows } = readTable(path.join(work, f))
      log(`\n── ${f}  (${rows.length} rows)`)
      log('   ' + header.join(' | '))
      if (rows[0]) log('   e.g. ' + rows[0].join(' | ').slice(0, 260))
    }
    // The tags actually present, so the candidate lists above can be confirmed.
    const numFile = files.find((f) => /^num\./i.test(f))
    if (numFile) {
      const { header, rows } = readTable(path.join(work, numFile))
      const t = col(header, 'tag')
      if (t >= 0) {
        const counts = new Map()
        for (const r of rows) counts.set(r[t], (counts.get(r[t]) ?? 0) + 1)
        log('\n── tags in num, by frequency (fee-related first)')
        const interesting = [...counts.entries()]
          .filter(([tag]) => /expens|salescharge|12b1|fee|redemption/i.test(tag))
          .sort((a, b) => b[1] - a[1])
        for (const [tag, n] of interesting.slice(0, 60)) log(`   ${String(n).padStart(7)}  ${tag}`)
        log('\n   Compare these against TAG_CANDIDATES at the top of this file.')
      }
    }
    return
  }

  // ── Load the catalog we are checking against ──────────────────────────────
  // Parsed from source rather than imported: this is a plain .mjs script and
  // fundCatalog.ts is TypeScript. Only the three fields needed are read, and a
  // parse that finds no funds aborts rather than reporting "0 differences",
  // which would read as "everything matches".
  const catalogSrc = fs.readFileSync(path.join(ROOT, 'src/lib/data/fundCatalog.ts'), 'utf8')
  const catalog = [...catalogSrc.matchAll(
    /\{\s*symbol:\s*'([A-Z0-9.\-]+)'[^}]*?type:\s*'(etf|mutual)'[^}]*?expenseRatioPct:\s*([\d.]+)/g
  )].map((m) => ({ symbol: m[1], type: m[2], expenseRatioPct: Number(m[3]) }))
  if (catalog.length === 0) {
    throw new Error('parsed 0 funds from fundCatalog.ts — the entry shape changed; fix the parse rather than trusting an empty diff')
  }
  log(`catalog: ${catalog.length} funds`)

  // ── SEC side ──────────────────────────────────────────────────────────────
  const subFile = files.find((f) => /^sub\./i.test(f))
  const numFile = files.find((f) => /^num\./i.test(f))
  if (!subFile || !numFile) {
    throw new Error(`expected sub.* and num.* in the archive; found: ${files.join(', ')}`)
  }

  const sub = readTable(path.join(work, subFile))
  const sAdsh = requireCol(sub.header, 'sub', 'adsh')
  const sName = requireCol(sub.header, 'sub', 'name')
  const sFiled = requireCol(sub.header, 'sub', 'filed', 'period')
  const filingByAdsh = new Map(sub.rows.map((r) => [r[sAdsh], { name: r[sName], filed: r[sFiled] }]))
  log(`filings: ${filingByAdsh.size}`)

  const num = readTable(path.join(work, numFile))
  const nAdsh = requireCol(num.header, 'num', 'adsh')
  const nTag = requireCol(num.header, 'num', 'tag')
  const nValue = requireCol(num.header, 'num', 'value')
  // The class ticker is what ties a fee row to a catalog symbol. Its column name
  // is the least certain part of this script — hence requireCol's error, which
  // prints the real columns instead of failing obscurely.
  const nTicker = requireCol(num.header, 'num', 'ticker', 'class_ticker', 'series_ticker')

  // Which candidate matched each field, so the report can say where a number
  // came from rather than presenting it as anonymous truth.
  const tagsPresent = new Set(num.rows.map((r) => r[nTag]))
  const resolvedTag = {}
  for (const [field, candidates] of Object.entries(TAG_CANDIDATES)) {
    resolvedTag[field] = candidates.find((c) => tagsPresent.has(c)) ?? null
  }
  log('\ntag resolution:')
  for (const [field, tag] of Object.entries(resolvedTag)) {
    log(`   ${field.padEnd(18)} ${tag ?? 'UNMATCHED — reported as unavailable, never substituted'}`)
  }
  if (!resolvedTag.netExpenseRatio && !resolvedTag.grossExpenseRatio) {
    throw new Error(
      'no expense-ratio tag matched. Run --inspect, read the tag list, and update ' +
      'TAG_CANDIDATES. Reporting every fund as "no SEC value" would look like a ' +
      'clean run when nothing was actually checked.'
    )
  }

  const wanted = new Set(catalog.map((f) => f.symbol))
  const catalogEr = new Map(catalog.map((f) => [f.symbol, f.expenseRatioPct]))

  // Pass 1 — collect RAW values. Nothing is scaled yet: the unit is a property
  // of the dataset and is decided once, below, from all of them together.
  const byTicker = new Map()
  for (const r of num.rows) {
    const ticker = r[nTicker]
    if (!ticker || !wanted.has(ticker)) continue
    const entry = byTicker.get(ticker) ?? { adsh: r[nAdsh], raw: {} }
    for (const [field, tag] of Object.entries(resolvedTag)) {
      if (tag && r[nTag] === tag && entry.raw[field] === undefined) {
        const v = rawRate(r[nValue])
        if (v != null) entry.raw[field] = v
      }
    }
    byTicker.set(ticker, entry)
  }
  log(`\nmatched ${byTicker.size} of ${catalog.length} catalog funds in the dataset`)

  // Pass 2 — calibrate the unit against the catalog's own verified ratios.
  const samples = []
  for (const [ticker, entry] of byTicker) {
    const raw = entry.raw.netExpenseRatio ?? entry.raw.grossExpenseRatio
    const known = catalogEr.get(ticker)
    if (raw != null && known != null) samples.push({ raw, catalogPct: known })
  }
  const unit = calibrateBasis(samples)
  log(`unit: ${unit.basis} (median error ${unit.err.toFixed(4)}pp; the alternative reads ${unit.other.toFixed(4)}pp off)`)

  // Pass 3 — apply the one decided scale everywhere.
  for (const entry of byTicker.values()) {
    entry.values = {}
    for (const [field, v] of Object.entries(entry.raw)) {
      entry.values[field] = { pct: v * unit.mult, basis: unit.basis }
    }
  }

  // ── Reconcile ─────────────────────────────────────────────────────────────
  const rows = []
  for (const f of catalog) {
    const hit = byTicker.get(f.symbol)
    const filing = hit ? filingByAdsh.get(hit.adsh) : undefined
    const sec = hit?.values ?? {}
    const secEr = sec.netExpenseRatio ?? sec.grossExpenseRatio
    rows.push({
      symbol: f.symbol,
      type: f.type,
      catalogExpenseRatioPct: f.expenseRatioPct,
      secExpenseRatioPct: secEr ? Number(secEr.pct.toFixed(4)) : null,
      secExpenseBasis: secEr?.basis ?? null,
      expenseDeltaPct: secEr ? Number((secEr.pct - f.expenseRatioPct).toFixed(4)) : null,
      secFrontLoadPct: sec.frontLoad ? Number(sec.frontLoad.pct.toFixed(4)) : null,
      secDeferredLoadPct: sec.deferredLoad ? Number(sec.deferredLoad.pct.toFixed(4)) : null,
      sec12b1Pct: sec.twelveB1 ? Number(sec.twelveB1.pct.toFixed(4)) : null,
      filedBy: filing?.name ?? null,
      filedOn: filing?.filed ?? null,
      accession: hit?.adsh ?? null,
      status: !hit ? 'not-found-in-dataset' : secEr == null ? 'no-expense-value' : 'ok',
    })
  }

  const matched = rows.filter((r) => r.status === 'ok')
  // A "material" difference is one that changes a rendered figure: the UI shows
  // two decimals, so anything at or above half a basis point can move it.
  const MATERIAL_PCT = 0.005
  const differing = matched.filter((r) => Math.abs(r.expenseDeltaPct) >= MATERIAL_PCT)
  const loads = rows.filter((r) => r.secFrontLoadPct || r.secDeferredLoadPct)

  fs.writeFileSync(OUT_JSON, JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: resolvedIndexUrl,
    resolvedTags: resolvedTag,
    unit: { basis: unit.basis, medianErrorPct: Number(unit.err.toFixed(4)), alternativeErrorPct: Number(unit.other.toFixed(4)) },
    counts: {
      catalog: catalog.length,
      matched: matched.length,
      notFound: rows.filter((r) => r.status === 'not-found-in-dataset').length,
      noExpenseValue: rows.filter((r) => r.status === 'no-expense-value').length,
      differing: differing.length,
      withLoads: loads.length,
    },
    rows,
  }, null, 2))

  const csv = [
    'symbol,type,catalog_er,sec_er,delta,front_load,deferred_load,12b1,filed_on,accession,status',
    ...rows.map((r) => [
      r.symbol, r.type, r.catalogExpenseRatioPct, r.secExpenseRatioPct ?? '', r.expenseDeltaPct ?? '',
      r.secFrontLoadPct ?? '', r.secDeferredLoadPct ?? '', r.sec12b1Pct ?? '',
      r.filedOn ?? '', r.accession ?? '', r.status,
    ].join(',')),
  ].join('\n')
  fs.writeFileSync(OUT_CSV, csv)

  // ── Report ────────────────────────────────────────────────────────────────
  log('\n══ Expense ratios differing from the catalog ══')
  if (differing.length === 0) {
    log('   none at or above 0.005pp')
  } else {
    for (const r of differing.sort((a, b) => Math.abs(b.expenseDeltaPct) - Math.abs(a.expenseDeltaPct))) {
      const sign = r.expenseDeltaPct > 0 ? '+' : ''
      log(`   ${r.symbol.padEnd(6)} catalog ${String(r.catalogExpenseRatioPct).padEnd(7)} SEC ${String(r.secExpenseRatioPct).padEnd(7)} (${sign}${r.expenseDeltaPct})  filed ${r.filedOn ?? '?'}`)
    }
  }

  log('\n══ Sales charges found ══')
  if (loads.length === 0) {
    log('   none — every matched fund reports zero load')
  } else {
    for (const r of loads) {
      const parts = []
      if (r.secFrontLoadPct) parts.push(`front ${r.secFrontLoadPct}%`)
      if (r.secDeferredLoadPct) parts.push(`deferred ${r.secDeferredLoadPct}%`)
      if (r.sec12b1Pct) parts.push(`12b-1 ${r.sec12b1Pct}%`)
      log(`   ${r.symbol.padEnd(6)} ${parts.join(', ').padEnd(40)} filed ${r.filedOn ?? '?'}`)
    }
    log('\n   These are the rates SalesCharge.maxPct is waiting for. Copy one in')
    log('   ONLY with its source and verifiedAt — a rate with no provenance is')
    log('   indistinguishable from a guess, and a test enforces that.')
  }

  const missing = rows.filter((r) => r.status !== 'ok')
  if (missing.length) {
    log(`\n══ ${missing.length} funds with no usable SEC value ══`)
    log('   Not evidence of anything: ETFs whose fees sit in a different filing,')
    log('   share classes filed under another ticker, or funds outside this')
    log('   quarter. Absence here never means "no fee".')
    for (const r of missing.slice(0, 20)) log(`   ${r.symbol.padEnd(6)} ${r.status}`)
    if (missing.length > 20) log(`   … and ${missing.length - 20} more (full list in the JSON)`)
  }

  log(`\nwrote ${path.relative(ROOT, OUT_JSON)} and ${path.relative(ROOT, OUT_CSV)}`)
  log('\nNothing was changed. Read the report, verify anything you intend to use')
  log('against the filing it names, then edit fundCatalog.ts by hand.')
  log('FUND_DATA_LAST_VERIFIED is NOT moved by this script — that date asserts the')
  log('whole table was compiled on one day, and only a human who reviewed every')
  log('row can move it.')
}

main().catch((err) => {
  console.error(`\n✗ ${err?.message ?? err}\n`)
  process.exitCode = 1
})
