/**
 * Apply verified fee updates to the withdrawal table — from either source.
 *
 *   npm run fee-apply -- transfer-fee-reconcile.json     (machine reconcile)
 *   npm run fee-apply -- transfer-fee-worksheet.csv      (filled-in worksheet)
 *   npm run fee-apply -- <file> --dry-run                (show, change nothing)
 *
 * WHY THIS IS A TOOL AND NOT A HAND EDIT. The table is 543 hand-maintained rows
 * and the values repeat across exchanges, so editing it by search-and-replace is
 * how a correct value lands on the wrong row. Everything here is keyed on
 * (exchange, coin, network) resolved from the app's own catalogs — never on
 * matching a number.
 *
 * THREE GUARDS, and the run aborts whole rather than partially applying:
 *
 *  1. EVERY ROW MUST RESOLVE to exactly one existing table entry. An unknown
 *     exchange/coin/network is an error, never a silently skipped line.
 *  2. THE CURRENT VALUE MUST MATCH what the input says it was. If the table has
 *     moved since the worksheet was generated, the diff is stale and applying it
 *     would overwrite newer work. (This guard earned its keep on the first run:
 *     it caught SHIB stored as `220_000`, where a naive parse read `220`.)
 *  3. NOTHING HERE TOUCHES TRANSFER_FEES_LAST_VERIFIED. That date asserts the
 *     whole table was checked on one day; only a human who finished every
 *     exchange can move it.
 *
 * Rows the worksheet marks `unavailable` or left blank are SKIPPED, not guessed.
 * Blank means unknown, and unknown is not zero.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { EXCHANGES, COIN_INFO, NETWORKS } from '../src/lib/data/transferFees'

const SRC = 'src/lib/data/transferFees.ts'
const [input, ...flags] = process.argv.slice(2)
const dryRun = flags.includes('--dry-run')
if (!input) {
  console.error('usage: npm run fee-apply -- <reconcile.json|worksheet.csv> [--dry-run]')
  process.exit(1)
}

// Display name -> id, built from the app's own catalogs so it cannot drift.
const exByName = new Map(EXCHANGES.map(e => [e.name.toLowerCase(), e.id]))
const coinBySymbol = new Map(Object.entries(COIN_INFO).map(([id, c]: any) => [c.symbol.toUpperCase(), id]))
const netByShort = new Map(Object.entries(NETWORKS).map(([id, n]: any) => [n.shortName.toLowerCase(), id]))

/** Minimal RFC4180 line parser — quoted cells may contain commas and "" escapes. */
function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ } else inQuotes = false
      } else cur += ch
    } else if (ch === '"') inQuotes = true
    else if (ch === ',') { out.push(cur.trim()); cur = '' }
    else cur += ch
  }
  out.push(cur.trim())
  return out
}

interface Update { exchangeId: string; coinId: string; networkId: string; from: number; to: number; toRaw: string; label: string }

function parseCsv(text: string): Update[] {
  const lines = text.trim().split(/\r?\n/)
  const head = splitCsvLine(lines[0])
  const col = (n: string) => head.findIndex(h => h.toLowerCase() === n.toLowerCase())
  const [iEx, iCoin, iNet, iFee, iActual, iStatus] =
    ['Exchange', 'Coin', 'Network', 'Current fee', 'ACTUAL fee', 'Status (ok/changed/delisted/unavailable)'].map(col)
  if ([iEx, iCoin, iNet, iFee, iActual].some(i => i < 0)) throw new Error('CSV is missing expected columns — regenerate with npm run fee-worksheet')

  const out: Update[] = []
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line)
    // Short rows are normal — a spreadsheet drops trailing empty cells — so
    // every read is defaulted rather than assumed present.
    const cell = (i: number) => (i >= 0 ? cells[i] ?? '' : '')
    const status = cell(iStatus).toLowerCase()
    const actual = cell(iActual)
    // Blank / unavailable / delisted are not fee updates. Silence is honest.
    if (!actual || status === 'unavailable' || status === 'delisted' || status === 'ok') continue
    const exchangeId = exByName.get(cell(iEx).toLowerCase())
    const coinId = coinBySymbol.get(cell(iCoin).toUpperCase())
    const networkId = netByShort.get(cell(iNet).toLowerCase())
    const label = `${cell(iEx)} ${cell(iCoin)} ${cell(iNet)}`
    if (!exchangeId || !coinId || !networkId) throw new Error(`unresolved row: ${label}`)
    if (!Number.isFinite(Number(actual))) throw new Error(`non-numeric ACTUAL fee for ${label}: "${actual}"`)
    out.push({
      exchangeId, coinId, networkId,
      from: Number(cell(iFee).replace(/_/g, '')), to: Number(actual), toRaw: actual, label,
    })
  }
  return out
}

function parseJson(text: string): Update[] {
  const j = JSON.parse(text)
  return (j.proposals ?? []).map((p: any) => ({
    exchangeId: p.exchangeId, coinId: p.coinId, networkId: p.networkId,
    from: Number(p.from), to: Number(p.to), toRaw: String(p.to),
    label: `${p.exchangeId} ${p.coinId} ${p.networkId}`,
  }))
}

const raw = readFileSync(input, 'utf8')
const updates = input.endsWith('.json') ? parseJson(raw) : parseCsv(raw)
if (updates.length === 0) { console.log('Nothing to apply — no filled-in changes found.'); process.exit(0) }

const byKey = new Map(updates.map(u => [`${u.exchangeId}:${u.coinId}:${u.networkId}`, u]))
if (byKey.size !== updates.length) throw new Error('the input contains duplicate rows for the same exchange/coin/network')

const lines = readFileSync(SRC, 'utf8').split('\n')
let exId: string | null = null, coinId: string | null = null
const applied: string[] = []
const problems: string[] = []

for (let i = 0; i < lines.length; i++) {
  const L = lines[i]
  const mEx = L.match(/^\s*id: '([a-z0-9]+)', name: /)
  if (mEx) { exId = mEx[1]; coinId = null; continue }
  const mCoin = L.match(/^\s{6}([a-z0-9]+):\s*\{ networks: \[/)
  if (mCoin) { coinId = mCoin[1]; continue }
  // Numeric separators are used in this table (220_000), so they are part of the
  // captured token and stripped before comparing — capturing only "220" made a
  // correct row look like a mismatch on the first run.
  const mNet = L.match(/networkId: '([a-z0-9_]+)',(\s*)withdrawFee: ([0-9._]+)/)
  if (!mNet || !exId || !coinId) continue

  const key = `${exId}:${coinId}:${mNet[1]}`
  const u = byKey.get(key)
  if (!u) continue
  const current = Number(mNet[3].replace(/_/g, ''))
  const scale = Math.max(Math.abs(current), Math.abs(u.from), 1e-12)
  if (Math.abs(current - u.from) / scale > 0.001) {
    problems.push(`${u.label}: table now holds ${current}, the input expected ${u.from}`)
    continue
  }
  if (!dryRun) lines[i] = L.replace(`withdrawFee: ${mNet[3]}`, `withdrawFee: ${u.toRaw}`)
  applied.push(`${u.label}: ${u.from} -> ${u.toRaw}`)
  byKey.delete(key)
}

if (problems.length) {
  console.error(`ABORTED — ${problems.length} row(s) no longer match the table.\n` +
    `The input is stale: regenerate it and re-check those rows.\n\n` + problems.join('\n'))
  process.exit(1)
}
if (byKey.size) {
  console.error(`ABORTED — ${byKey.size} row(s) did not match any table entry:\n` +
    [...byKey.values()].map(u => u.label).join('\n'))
  process.exit(1)
}

if (!dryRun) writeFileSync(SRC, lines.join('\n'))
console.log(`${dryRun ? '[dry run] would apply' : 'Applied'} ${applied.length} fee update(s):`)
for (const a of applied) console.log('  ' + a)
console.log(`\nTRANSFER_FEES_LAST_VERIFIED is untouched — only a completed pass over every exchange moves it.`)
