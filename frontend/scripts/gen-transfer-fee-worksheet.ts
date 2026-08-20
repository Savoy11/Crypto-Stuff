/**
 * Generate a verification worksheet for the transfer-fee table (audit finding M4).
 *
 *   npm run fee-worksheet
 *
 * Writes two files to the repo root, both gitignored:
 *   transfer-fee-worksheet.csv  — one row per exchange×coin×network, for a spreadsheet
 *   transfer-fee-worksheet.md   — per-exchange summary + progress tracker
 *
 * Why this exists: `TRANSFER_FEES_LAST_VERIFIED` is 2025-06-01 and the table holds
 * ~560 entries. Re-verifying it by reading TypeScript is miserable and error-prone —
 * you lose your place, and nothing records what you already checked. The CSV gives
 * you the current value next to blank columns to fill in, so the job is comparing
 * rather than transcribing.
 *
 * The unit of work is ONE EXCHANGE, not one entry: you open an exchange's fee page
 * once and check every row it covers. Rows are sorted tier-1 first, then by
 * exchange, so the highest-traffic tables come first and you can stop at any
 * exchange boundary without leaving a half-checked table behind.
 *
 * IMPORTANT — this script only reads. Nothing here bumps TRANSFER_FEES_LAST_VERIFIED.
 * That date means "the whole table was verified as of this day", so it can only be
 * moved by hand once every exchange is done. Bumping it after a partial pass is the
 * exact dishonesty the provenance machinery exists to prevent.
 */

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  EXCHANGES,
  COIN_INFO,
  NETWORKS,
  TRANSFER_FEES_LAST_VERIFIED,
  transferFeesAgeDays,
  SPOT_TRADING_FEES,
  TRADING_FEES_COMPILED,
} from '../src/lib/data/transferFees'

// Withdrawal-fee pages, best known at time of writing. These are a starting point,
// NOT verified links — exchanges move these pages and several require a login to
// show live fees. If one 404s, search "<exchange> withdrawal fees" and please fix
// the entry here so the next pass doesn't hit the same dead end.
const FEE_PAGES: Record<string, string> = {
  binance: 'https://www.binance.com/en/fee/cryptoFee',
  coinbase: 'https://help.coinbase.com/en/coinbase/trading-and-funding/pricing-and-fees/fees',
  kraken: 'https://support.kraken.com/hc/en-us/articles/360000767986',
  okx: 'https://www.okx.com/fees',
  bybit: 'https://www.bybit.com/en/help-center/article/Deposit-Withdrawal-Fee',
  kucoin: 'https://www.kucoin.com/vip/level',
  cryptocom: 'https://crypto.com/exchange/document/fees-limits',
  bitget: 'https://www.bitget.com/fee',
  gateio: 'https://www.gate.io/fee',
  htx: 'https://www.htx.com/support/en-us/detail/360000203002',
  mexc: 'https://www.mexc.com/fee',
  gemini: 'https://www.gemini.com/fees',
  bitfinex: 'https://www.bitfinex.com/fees',
  bitstamp: 'https://www.bitstamp.net/fee-schedule/',
  upbit: 'https://upbit.com/service_center/guide',
  robinhood: 'https://robinhood.com/us/en/support/articles/crypto-fees/',
  hyperliquid: 'https://hyperliquid.gitbook.io/hyperliquid-docs',
  poloniex: 'https://poloniex.com/fee-schedule',
  bingx: 'https://bingx.com/en-us/rate/',
  phemex: 'https://phemex.com/fees-conditions',
  woox: 'https://woox.io/en/fees',
  bitmart: 'https://www.bitmart.com/fee/en-US',
  bitrue: 'https://www.bitrue.com/fee',
  lbank: 'https://www.lbank.com/fees',
  pionex: 'https://www.pionex.com/blog/pionex-fees/',
}

const csvCell = (v: unknown): string => {
  const s = v === undefined || v === null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

interface Row {
  tier: 1 | 2
  exchangeId: string
  exchange: string
  coin: string
  coinId: string
  network: string
  networkId: string
  fee: number
  minWithdraw: number
  withdrawEnabled: boolean
  depositEnabled: boolean
  note: string
  recentlyChecked: boolean
}

const rows: Row[] = []

for (const ex of EXCHANGES) {
  for (const [coinId, coin] of Object.entries(ex.coins)) {
    if (!coin) continue
    for (const n of coin.networks) {
      const note = n.note ?? ''
      rows.push({
        tier: ex.tier,
        exchangeId: ex.id,
        exchange: ex.name,
        coinId,
        coin: COIN_INFO[coinId as keyof typeof COIN_INFO]?.symbol ?? coinId.toUpperCase(),
        networkId: n.networkId,
        network: NETWORKS[n.networkId]?.shortName ?? n.networkId,
        fee: n.withdrawFee,
        minWithdraw: n.minWithdraw,
        withdrawEnabled: n.withdrawEnabled,
        depositEnabled: n.depositEnabled,
        note,
        // The 2026-07-20 partial pass left this marker on the entries it checked.
        // Those are the only rows in the table with a verification date attached.
        recentlyChecked: /re-verified 2026-07/i.test(note),
      })
    }
  }
}

// Tier 1 first (highest traffic = highest cost of being wrong), then alphabetical
// by exchange so the file is stable across runs and diffs cleanly.
rows.sort(
  (a, b) =>
    a.tier - b.tier ||
    a.exchange.localeCompare(b.exchange) ||
    a.coin.localeCompare(b.coin) ||
    a.network.localeCompare(b.network)
)

// ─── CSV ─────────────────────────────────────────────────────────────────────
const header = [
  'Tier', 'Exchange', 'Coin', 'Network',
  'Current fee', 'Current min', 'Withdraw on?', 'Deposit on?',
  'Existing note', 'Checked 2026-07?',
  // Blank columns for the person doing the work.
  'ACTUAL fee', 'ACTUAL min', 'Status (ok/changed/delisted/unavailable)', 'Date checked', 'Comment',
]

const csv = [
  header.map(csvCell).join(','),
  ...rows.map((r) =>
    [
      r.tier, r.exchange, r.coin, r.network,
      r.fee, r.minWithdraw, r.withdrawEnabled ? 'yes' : 'NO', r.depositEnabled ? 'yes' : 'NO',
      r.note, r.recentlyChecked ? 'yes' : '',
      '', '', '', '', '',
    ].map(csvCell).join(',')
  ),
].join('\n')

// ─── Markdown tracker ────────────────────────────────────────────────────────
const byExchange = new Map<string, Row[]>()
for (const r of rows) {
  const list = byExchange.get(r.exchange) ?? []
  list.push(r)
  byExchange.set(r.exchange, list)
}

const age = transferFeesAgeDays(new Date())
const md: string[] = [
  '# Transfer-fee verification worksheet (audit finding M4)',
  '',
  `Generated from \`src/lib/data/transferFees.ts\`. **Do not edit this file** — it is`,
  `regenerated by \`npm run fee-worksheet\`. Record findings in the CSV.`,
  '',
  `- **Entries to verify:** ${rows.length}`,
  `- **Exchanges:** ${byExchange.size}`,
  `- **Table last fully verified:** ${TRANSFER_FEES_LAST_VERIFIED} (**${age} days ago**)`,
  `- **Already checked in the 2026-07-20 partial pass:** ${rows.filter((r) => r.recentlyChecked).length}`,
  '',
  '## How to use this',
  '',
  '1. Work **one exchange at a time** — open its fee page once, check every row it covers.',
  '2. Fill the ACTUAL columns in the CSV. Leave a row blank if you did not check it;',
  '   blank means unknown, which is honest. Do not copy the current value across.',
  '3. Statuses: `ok` (matches), `changed` (fill ACTUAL), `delisted` (pair no longer offered),',
  '   `unavailable` (fee not published without login/API).',
  '4. When **every** exchange is done, bump `TRANSFER_FEES_LAST_VERIFIED` by hand.',
  '   That date asserts the whole table was verified — a partial pass must not move it.',
  '   This is why the 2026-07-20 pass deliberately left it alone.',
  '',
  '## Progress',
  '',
  '| ✔ | Exchange | Tier | Entries | Coins | Fee page (unverified starting point) |',
  '|---|----------|------|---------|-------|--------------------------------------|',
]

for (const [name, list] of [...byExchange.entries()].sort(
  (a, b) => a[1][0].tier - b[1][0].tier || a[0].localeCompare(b[0])
)) {
  const coins = new Set(list.map((r) => r.coin)).size
  const url = FEE_PAGES[list[0].exchangeId] ?? '—'
  md.push(`| [ ] | ${name} | ${list[0].tier} | ${list.length} | ${coins} | ${url} |`)
}

md.push(
  '',
  '## Notes worth knowing before you start',
  '',
  '- **Dynamic fees.** Several entries are marked "Dynamic — adjusts with gas". Those can',
  '  never be exactly right; the job is checking the value is still *representative*, not',
  '  identical. Record the observed range in the Comment column.',
  '- **Login walls.** Some exchanges only show live withdrawal fees to signed-in users.',
  '  Mark those `unavailable` rather than guessing — an unverified row recorded as verified',
  '  is worse than one left blank.',
  '- **Delistings are findings.** A pair that no longer exists should be removed from the',
  '  table, not left with a stale fee. Flag it `delisted` and it can be deleted in the',
  '  follow-up commit.',
  '- **Disabled rows still matter.** `Withdraw on?` = NO entries are load-bearing: the path',
  '  finder uses them to exclude routes. If a network has been re-enabled, that changes',
  '  which routes the calculator offers.',
  ''
)

// ── Spot trading fees (S3) — seeded, needs the same verification pass ─────────
md.push(
  '## Spot trading fees (seeded ' + TRADING_FEES_COMPILED + ' — verify alongside withdrawals)',
  '',
  'Default-tier maker/taker per exchange, powering the "all-in cost of sale" panel.',
  'Seeded from published schedules, confidence pinned LOW until verified. Check the',
  'spot fee schedule page while you have each exchange open for withdrawals.',
  '',
  '| Done | Exchange | Maker % | Taker % | Note | Observed maker | Observed taker |',
  '|------|----------|---------|---------|------|----------------|----------------|',
)
for (const ex of EXCHANGES) {
  const f = SPOT_TRADING_FEES[ex.id]
  md.push(
    `| [ ] | ${ex.name} | ${f ? f.makerPct : 'NOT CATALOGUED'} | ${f ? f.takerPct : '—'} | ${f?.note ?? ''} |  |  |`,
  )
}
md.push('')

const root = join(process.cwd(), '..')
writeFileSync(join(root, 'transfer-fee-worksheet.csv'), csv + '\n', 'utf8')
writeFileSync(join(root, 'transfer-fee-worksheet.md'), md.join('\n'), 'utf8')

console.log(`transfer-fee worksheet written`)
console.log(`  ${rows.length} entries across ${byExchange.size} exchanges`)
console.log(`  table last fully verified ${TRANSFER_FEES_LAST_VERIFIED} (${age} days ago)`)
console.log(`  ${rows.filter((r) => r.recentlyChecked).length} already checked in the 2026-07 partial pass`)
console.log(`  → transfer-fee-worksheet.csv (fill this in)`)
console.log(`  → transfer-fee-worksheet.md (progress tracker)`)
