/**
 * Reconcile the hand-maintained withdrawal-fee table against what the exchanges'
 * own public APIs report right now.
 *
 *   npm run fee-reconcile          — RUN THIS ON THE OWNER'S MACHINE
 *
 * WHY THIS EXISTS. `npm run fee-worksheet` asks a person to check 543 rows by
 * opening fee pages. That job has never been done, which is why
 * TRANSFER_FEES_LAST_VERIFIED still reads 2025-06-01. The live adapters built
 * for the overlay already read real fees straight from exchange APIs, so a
 * slice of that work can be done by machine — and a machine reading an
 * exchange's own API is better evidence than a human reading its marketing page.
 *
 * This script does NOT edit the table. It produces:
 *   transfer-fee-reconcile.md    — the report to read
 *   transfer-fee-reconcile.json  — proposed corrections, for review and apply
 *
 * Three rules keep it honest:
 *
 *  1. A SUSPENSION IS NOT A CORRECTION. `withdrawEnabled: false` from a live API
 *     is usually a temporary halt. Writing it into the permanent table would
 *     bake a transient state into a snapshot that outlives it, so suspensions
 *     are reported and never proposed as edits.
 *
 *  2. A DYNAMIC FEE HAS NO CORRECT VALUE. Rows whose note says the fee floats
 *     with gas are expected to disagree with any single reading. Proposing a
 *     "fix" there swaps one snapshot for another and calls it settled, so they
 *     are reported separately and never proposed as edits.
 *
 *  3. IT CANNOT BUMP THE TABLE DATE. TRANSFER_FEES_LAST_VERIFIED means the whole
 *     table was checked on that day. Reconciling the ~20% of rows the adapters
 *     cover does not make that true, so the date is untouched no matter how
 *     clean the run is. Per-row evidence goes in the JSON instead.
 */

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  EXCHANGES, COIN_INFO, NETWORKS,
  TRANSFER_FEES_LAST_VERIFIED, transferFeesAgeDays,
} from '../src/lib/data/transferFees'
import { WITHDRAW_FEE_SOURCES, type ParsedFeeRow } from '../src/lib/server/withdrawFeeAdapters'

const RUN_DATE = new Date().toISOString().slice(0, 10)

/** Relative tolerance: exchanges round differently, so a hair's difference is a match. */
const TOLERANCE = 0.005

type Verdict = 'confirmed' | 'changed' | 'dynamic' | 'suspended' | 'unparsed'

interface Finding {
  exchangeId: string
  exchange: string
  coinId: string
  coin: string
  networkId: string
  network: string
  verdict: Verdict
  staticFee: number
  liveFee?: number
  staticMin: number
  liveMin?: number
  note?: string
}

function differs(a: number, b: number): boolean {
  if (a === b) return false
  const scale = Math.max(Math.abs(a), Math.abs(b))
  if (scale === 0) return false
  return Math.abs(a - b) / scale > TOLERANCE
}

async function main() {
  const findings: Finding[] = []
  const sourceStatus: { exchangeId: string; probed: boolean; status: string; rows: number }[] = []
  const parsed: ParsedFeeRow[] = []

  for (const src of WITHDRAW_FEE_SOURCES) {
    try {
      const res = await fetch(src.url, { headers: { Accept: 'application/json' } })
      if (!res.ok) {
        sourceStatus.push({ exchangeId: src.exchangeId, probed: src.probed, status: `HTTP ${res.status}`, rows: 0 })
        continue
      }
      const rows = src.parse(await res.json())
      parsed.push(...rows)
      sourceStatus.push({
        exchangeId: src.exchangeId, probed: src.probed,
        status: rows.length > 0 ? 'live' : 'answered but nothing parsed', rows: rows.length,
      })
    } catch (err: any) {
      sourceStatus.push({ exchangeId: src.exchangeId, probed: src.probed, status: `failed: ${err?.message ?? err}`, rows: 0 })
    }
  }

  // Index the live rows so the walk below is over the CURATED table — the thing
  // being verified — rather than over whatever the APIs happened to return.
  const live = new Map<string, ParsedFeeRow>()
  for (const r of parsed) live.set(`${r.exchangeId}:${r.coin}:${r.network}`, r)

  const covered = new Set(sourceStatus.filter(s => s.rows > 0).map(s => s.exchangeId))
  let curatedRows = 0
  let uncoveredRows = 0

  for (const ex of EXCHANGES) {
    for (const [coinId, coin] of Object.entries(ex.coins)) {
      if (!coin) continue
      for (const n of coin.networks) {
        curatedRows++
        if (!covered.has(ex.id)) { uncoveredRows++; continue }
        const hit = live.get(`${ex.id}:${coinId}:${n.networkId}`)
        if (!hit) { uncoveredRows++; continue }

        const base = {
          exchangeId: ex.id, exchange: ex.name, coinId,
          coin: COIN_INFO[coinId as keyof typeof COIN_INFO]?.symbol ?? coinId.toUpperCase(),
          networkId: n.networkId, network: NETWORKS[n.networkId]?.shortName ?? n.networkId,
          staticFee: n.withdrawFee, staticMin: n.minWithdraw,
          liveFee: hit.withdrawFee, liveMin: hit.minWithdraw, note: n.note,
        }

        // Rule 1 — a halt is a state, not a schedule.
        if (hit.withdrawEnabled === false) {
          findings.push({ ...base, verdict: 'suspended' })
          continue
        }
        if (hit.withdrawFee === undefined) {
          findings.push({ ...base, verdict: 'unparsed' })
          continue
        }
        // Rule 2 — a floating fee has no single right answer.
        if (n.note && /dynamic|gas-dependent|varies/i.test(n.note)) {
          findings.push({ ...base, verdict: 'dynamic' })
          continue
        }
        findings.push({
          ...base,
          verdict: differs(n.withdrawFee, hit.withdrawFee) ? 'changed' : 'confirmed',
        })
      }
    }
  }

  const by = (v: Verdict) => findings.filter(f => f.verdict === v)
  const confirmed = by('confirmed')
  const changed = by('changed')
  const dynamic = by('dynamic')
  const suspended = by('suspended')
  const unparsed = by('unparsed')

  // ─── JSON: only real proposals, and only the fee field ─────────────────────
  const proposals = changed.map(f => ({
    exchangeId: f.exchangeId, coinId: f.coinId, networkId: f.networkId,
    field: 'withdrawFee', from: f.staticFee, to: f.liveFee,
    minFrom: f.staticMin, minTo: f.liveMin,
    evidence: `${f.exchangeId} public API, read ${RUN_DATE}`,
  }))
  writeFileSync(join(process.cwd(), 'transfer-fee-reconcile.json'), JSON.stringify({
    runDate: RUN_DATE,
    tableVerifiedAt: TRANSFER_FEES_LAST_VERIFIED,
    tableAgeDays: transferFeesAgeDays(),
    sourceStatus,
    counts: {
      curatedRows, reconciled: findings.length, uncoveredRows,
      confirmed: confirmed.length, changed: changed.length,
      dynamic: dynamic.length, suspended: suspended.length, unparsed: unparsed.length,
    },
    confirmedRows: confirmed.map(f => `${f.exchangeId}:${f.coinId}:${f.networkId}`),
    proposals,
  }, null, 2) + '\n')

  // ─── Markdown report ───────────────────────────────────────────────────────
  const L: string[] = []
  L.push(`# Transfer-fee reconcile — ${RUN_DATE}`, '')
  L.push(`Table verified as a whole on **${TRANSFER_FEES_LAST_VERIFIED}** (${transferFeesAgeDays()} days ago).`)
  L.push('This run does **not** change that date — it covers only the rows the live adapters reach.', '')
  L.push('## Sources', '')
  L.push('| Exchange | Previously probed | This run | Rows |', '|---|---|---|---|')
  for (const s of sourceStatus) L.push(`| ${s.exchangeId} | ${s.probed ? 'yes' : 'no'} | ${s.status} | ${s.rows} |`)
  L.push('')
  L.push('## Coverage', '')
  L.push(`- Curated rows in the table: **${curatedRows}**`)
  L.push(`- Reconciled against a live reading: **${findings.length}** (${((findings.length / curatedRows) * 100).toFixed(1)}%)`)
  L.push(`- No live coverage — still needs a human: **${uncoveredRows}**`, '')
  L.push('## Results', '')
  L.push(`- ✅ confirmed (table matches the exchange): **${confirmed.length}**`)
  L.push(`- ✏️ changed (proposed correction): **${changed.length}**`)
  L.push(`- 🔁 dynamic (floating fee — no single right value, not proposed): **${dynamic.length}**`)
  L.push(`- ⛔ suspended right now (state, not a schedule — not proposed): **${suspended.length}**`)
  L.push(`- ❔ live row carried no usable fee: **${unparsed.length}**`, '')

  if (changed.length) {
    L.push('### ✏️ Proposed corrections', '')
    L.push('| Exchange | Coin | Network | Table says | Exchange says | Factor |', '|---|---|---|---|---|---|')
    for (const f of changed.sort((a, b) =>
      Math.abs((b.liveFee! / (b.staticFee || 1))) - Math.abs((a.liveFee! / (a.staticFee || 1))))) {
      const factor = f.staticFee ? (f.liveFee! / f.staticFee).toFixed(2) + '×' : 'n/a'
      L.push(`| ${f.exchange} | ${f.coin} | ${f.network} | ${f.staticFee} | ${f.liveFee} | ${factor} |`)
    }
    L.push('', 'Biggest factors first — those are where the table is most wrong.', '')
  }
  if (suspended.length) {
    L.push('### ⛔ Withdrawals reported suspended right now', '')
    L.push('Not table edits — these are live states the app already surfaces as blocked routes.', '')
    for (const f of suspended) L.push(`- ${f.exchange} · ${f.coin} on ${f.network}`)
    L.push('')
  }
  if (dynamic.length) {
    L.push('### 🔁 Dynamic fees (reading recorded, not proposed)', '')
    L.push('| Exchange | Coin | Network | Table | Reading now | Note |', '|---|---|---|---|---|---|')
    for (const f of dynamic) L.push(`| ${f.exchange} | ${f.coin} | ${f.network} | ${f.staticFee} | ${f.liveFee ?? '—'} | ${(f.note ?? '').replace(/\|/g, '/')} |`)
    L.push('')
  }
  L.push('## What to do next', '')
  L.push('1. Skim the proposed corrections above. They come from each exchange\'s own API, so the usual failure is a **units or chain-mapping** mistake on our side, not a wrong exchange — a 1000× factor means the parser, not the fee.')
  L.push('2. Hand `transfer-fee-reconcile.json` back to Claude to apply the approved ones as a reviewable diff.')
  L.push(`3. The remaining **${uncoveredRows}** rows have no live source. Those are the \`npm run fee-worksheet\` job, and only finishing them can move TRANSFER_FEES_LAST_VERIFIED.`)
  writeFileSync(join(process.cwd(), 'transfer-fee-reconcile.md'), L.join('\n') + '\n')

  process.stdout.write(
    `\nReconciled ${findings.length} of ${curatedRows} rows ` +
    `(${confirmed.length} confirmed, ${changed.length} changed, ${dynamic.length} dynamic, ${suspended.length} suspended).\n` +
    `${uncoveredRows} rows have no live source and still need the worksheet.\n\n` +
    `Wrote transfer-fee-reconcile.md and transfer-fee-reconcile.json\n`
  )
}

main()
