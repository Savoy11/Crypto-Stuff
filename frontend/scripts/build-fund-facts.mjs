// Build fund AUM + issuer for the whole universe from the SEC's quarterly
// N-PORT bulk dataset.
//
//   node scripts/build-fund-facts.mjs [--inspect]
//
// Why bulk rather than the EDGAR API: filling ~29,000 funds one at a time would
// be ~29,000 requests per refresh. The SEC publishes the same data as one
// quarterly archive, so this is a single download and an offline parse whose
// output ships as a static JSON map.
//
// Emits src/lib/data/fundFacts.generated.json — { TICKER: { netAssetsB, issuer, asOf } }.
// Re-run quarterly when a new dataset is published; the file is committed so the
// app never depends on this script at runtime.
//
// Expense ratio is deliberately NOT here: N-PORT does not carry it (verified —
// there is no expense tag in the schema). That needs prospectus parsing or a
// paid vendor.
//
// IMPORTANT — what netAssetsB actually means.
// N-PORT reports at the SERIES level, and a series can have many share classes.
// Where a firm files one series per ETF (iShares, Invesco) the figure equals the
// ETF: QQQ and IWM land within 4% of their published AUM. Where the ETF is a
// share class OF a mutual fund — Vanguard's structure — the figure is the whole
// fund across every class, so VTI reads ~2.0T against roughly 0.5T for the ETF
// alone. That is not bad data; it is a different quantity.
//
// Hence the field is named netAssetsB, not aumB, and must be labelled
// "fund net assets, all share classes" in any UI. Calling it AUM would misstate
// the largest funds in the universe by 2-3x.

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'src/lib/data/fundFacts.generated.json')
const INDEX_URL = 'https://www.sec.gov/data-research/sec-markets-data/form-n-port-data-sets'
// EDGAR requires a descriptive UA identifying the requester.
const UA = { 'User-Agent': 'Finance Now research dashboard (marcusowens94@gmail.com)' }

const log = (...a) => console.log(...a)

/** Newest quarterly dataset link from the SEC's index page. */
async function newestDatasetUrl() {
  const res = await fetch(INDEX_URL, { headers: UA })
  if (!res.ok) throw new Error(`dataset index: HTTP ${res.status}`)
  const html = await res.text()
  const links = [...html.matchAll(/href="([^"]*\d{4}q\d_nport\.zip)"/gi)].map((m) => m[1])
  if (links.length === 0) throw new Error('no dataset links found on the SEC index page')
  const first = links[0]
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
  const header = lines[0].split(delim).map((h) => h.trim().replace(/^"|"$/g, ''))
  return {
    header,
    rows: lines.slice(1).map((l) => l.split(delim).map((c) => c.trim().replace(/^"|"$/g, ''))),
  }
}

/** Only these tables are read — the archive also holds multi-GB holdings tables. */
const NEEDED = ['FUND_REPORTED_INFO', 'REGISTRANT']

async function main() {
  const inspect = process.argv.includes('--inspect')
  // Cached in a stable location rather than a temp dir: the archive is 420 MB
  // and re-downloading it to re-check a column name is wasteful. Delete the
  // folder to force a fresh pull.
  const work = path.join(os.tmpdir(), 'fn-nport-cache')
  fs.mkdirSync(work, { recursive: true })
  const zip = path.join(work, 'nport.zip')

  {
    if (!fs.existsSync(zip)) {
      await download(await newestDatasetUrl(), zip)
    } else {
      log(`using cached archive (${(fs.statSync(zip).size / 1048576).toFixed(1)} MB)`)
    }
    if (!fs.existsSync(path.join(work, 'FUND_REPORTED_INFO.tsv'))) extract(zip, work)

    const files = fs.readdirSync(work).filter((f) => /\.(tsv|txt|csv)$/i.test(f))

    if (inspect) {
      // Discovery mode, scoped to the tables this build actually uses — reading
      // every table means parsing millions of holdings rows for nothing.
      for (const f of files.filter((f) => NEEDED.some((n) => f.toUpperCase().startsWith(n)))) {
        const { header, rows } = readTable(path.join(work, f))
        log(`\n── ${f}  (${rows.length} rows)`)
        log('   ' + header.join(' | '))
        if (rows[0]) log('   e.g. ' + rows[0].slice(0, 10).join(' | ').slice(0, 260))
      }
      return
    }

    // Issuer lives in REGISTRANT, not FUND_REPORTED_INFO — join on accession.
    const regTable = readTable(path.join(work, 'REGISTRANT.tsv'))
    const rAcc = regTable.header.indexOf('ACCESSION_NUMBER')
    const rName = regTable.header.indexOf('REGISTRANT_NAME')
    const issuerByAccession = new Map(regTable.rows.map((r) => [r[rAcc], r[rName]]))
    log(`registrants: ${issuerByAccession.size}`)

    // FUND_REPORTED_INFO is one row per series per filing.
    const { header, rows } = readTable(path.join(work, 'FUND_REPORTED_INFO.tsv'))
    const col = (name) => header.indexOf(name)
    const iAcc = col('ACCESSION_NUMBER')
    const iSeries = col('SERIES_ID')
    const iNet = col('NET_ASSETS')
    if (iSeries < 0 || iNet < 0) throw new Error(`unexpected columns: ${header.join(', ')}`)

    // The table carries no report date, so the dataset's own quarter is the
    // as-of. Later rows win on duplicates — a series can appear more than once
    // within a quarter when an amended filing is included.
    const quarter = (fs.readdirSync(work).find((f) => /\d{4}q\d/.test(f)) ?? '')
      .match(/(\d{4}q\d)/i)?.[1] ?? new Date().toISOString().slice(0, 7)

    const bySeries = new Map()
    for (const r of rows) {
      const sid = r[iSeries]
      const net = parseFloat(r[iNet])
      if (!sid || !Number.isFinite(net) || net <= 0) continue
      bySeries.set(sid, { net, issuer: issuerByAccession.get(r[iAcc]) ?? '' })
    }
    log(`series with reported net assets: ${bySeries.size}`)

    // Map series → ticker. A registrant files many series, so matching by series
    // id is required — taking a registrant's newest filing returns the wrong fund.
    const mf = await (await fetch('https://www.sec.gov/files/company_tickers_mf.json', { headers: UA })).json()
    const f = mf.fields
    const iSid = f.indexOf('seriesId')
    const iSym = f.indexOf('symbol')

    const out = {}
    for (const row of mf.data) {
      const rec = bySeries.get(row[iSid])
      const sym = row[iSym]
      if (!rec || !sym) continue
      out[sym.toUpperCase()] = {
        netAssetsB: Number((rec.net / 1e9).toFixed(4)),
        issuer: rec.issuer || null,
        asOf: quarter,
      }
    }

    fs.writeFileSync(OUT, JSON.stringify(out, null, 0))
    log(`\nwrote ${Object.keys(out).length} tickers → ${path.relative(ROOT, OUT)}`)
  }
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1) })
