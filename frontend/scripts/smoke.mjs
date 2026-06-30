#!/usr/bin/env node
// CAEP data validation smoke tests.
//
// Spot-checks live endpoints against sane tolerances and verifies the internal
// (/live-data/*) and public (/api/v1/*) layers agree. Not a unit-test suite — a
// fast guard against stale, inconsistent, or obviously-wrong numbers.
//
// Usage:  node scripts/smoke.mjs            (defaults to http://localhost:3000)
//         CAEP_BASE_URL=https://… node scripts/smoke.mjs
// Requires the app to be running.

const BASE = process.env.CAEP_BASE_URL ?? 'http://localhost:3000'

let passed = 0
let failed = 0
const failures = []

function check(name, cond, detail = '') {
  if (cond) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

async function getJson(path) {
  const r = await fetch(`${BASE}${path}`)
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${path}`)
  return r.json()
}

async function run() {
  console.log(`CAEP smoke tests → ${BASE}\n`)

  // ── Prices: sane bounds ────────────────────────────────────────────────────
  console.log('Prices')
  try {
    const m = await getJson('/live-data/markets')
    const q = m.quotes ?? {}
    const btc = q.btc?.price
    const eth = q.eth?.price
    check('BTC price present and in [1k, 1M]', typeof btc === 'number' && btc > 1_000 && btc < 1_000_000, `btc=${btc}`)
    check('ETH price present and in [100, 100k]', typeof eth === 'number' && eth > 100 && eth < 100_000, `eth=${eth}`)
    // Stablecoins should be near $1.
    const usdc = q.usdc?.price
    if (typeof usdc === 'number') {
      check('USDC within 5% of $1 peg', Math.abs(usdc - 1) < 0.05, `usdc=${usdc}`)
    }
  } catch (e) {
    check('markets endpoint reachable', false, String(e))
  }

  // ── Cross-layer price agreement ─────────────────────────────────────────────
  console.log('Cross-layer consistency')
  try {
    const [ld, v1] = await Promise.all([
      getJson('/live-data/network-fees'),
      getJson('/api/v1/network-fees'),
    ])
    // Both layers use the same shared module + source, so values must track
    // closely. They are fetched in separate requests, so allow a small tolerance
    // for live-price movement between calls. A logic bug (e.g. different gas
    // amount) would blow well past this tolerance.
    const within = (a, b, tol = 0.02) => a != null && b != null && Math.abs(a - b) <= Math.abs(b) * tol
    const a = ld.networkFees?.erc20?.feeUsd
    const b = v1.fees?.erc20?.feeUsd
    check('erc20 feeUsd agrees across layers (≤2%)', within(a, b), `live=${a} v1=${b}`)
    const ab = ld.networkFees?.bitcoin?.feeUsd
    const bb = v1.fees?.bitcoin?.feeUsd
    check('bitcoin feeUsd agrees across layers (≤2%)', within(ab, bb), `live=${ab} v1=${bb}`)
    // gas amount (feeNative) is static, so it must be exactly equal — this is the
    // real guard against the two layers using different gas assumptions.
    check('erc20 feeNative identical (static gas, no drift)',
      ld.networkFees?.erc20?.feeNative === v1.fees?.erc20?.feeNative,
      `live=${ld.networkFees?.erc20?.feeNative} v1=${v1.fees?.erc20?.feeNative}`)
    check('bitcoin fee is live (mempool)', ld.networkFees?.bitcoin?.source === 'live', `source=${ld.networkFees?.bitcoin?.source}`)
  } catch (e) {
    check('network-fees endpoints reachable', false, String(e))
  }

  // ── Network fees: positive + plausible ──────────────────────────────────────
  console.log('Network fees')
  try {
    const v1 = await getJson('/api/v1/network-fees')
    const fees = v1.fees ?? {}
    let allPositive = true
    let allPlausible = true
    for (const [net, f] of Object.entries(fees)) {
      if (!(f.feeUsd >= 0)) allPositive = false
      if (f.feeUsd > 500) { allPlausible = false } // no normal transfer costs >$500
      void net
    }
    check('all network feeUsd values are >= 0', allPositive)
    check('no network feeUsd exceeds $500', allPlausible)
  } catch (e) {
    check('v1 network-fees reachable', false, String(e))
  }

  // ── Staking: APR in plausible range ─────────────────────────────────────────
  console.log('Staking')
  try {
    const s = await getJson('/api/v1/staking/opportunities?coin=eth')
    const items = s.opportunities ?? s.data ?? s.results ?? []
    if (Array.isArray(items) && items.length > 0) {
      const aprs = items.map((i) => i.apr ?? i.apy ?? i.rate).filter((x) => typeof x === 'number')
      const allSane = aprs.every((a) => a >= 0 && a < 100)
      check('ETH staking APRs in [0, 100)%', aprs.length > 0 && allSane, `aprs=${aprs.join(',')}`)
      // Taxonomy: default ETH staking must NOT include governance-token or lending
      // yield (those don't actually stake ETH). They appear only with include_adjacent.
      const adjacentLeak = items.filter((i) => i.stakesQueriedAsset === false)
      check('default ETH staking excludes governance/lending', adjacentLeak.length === 0,
        `leaked=${adjacentLeak.map((i) => `${i.provider}:${i.yieldType}`).join(',')}`)
      const adj = await getJson('/api/v1/staking/opportunities?coin=eth&include_adjacent=true')
      const adjItems = adj.opportunities ?? []
      check('include_adjacent surfaces governance/lending', adjItems.some((i) => i.stakesQueriedAsset === false),
        `count=${adjItems.filter((i) => i.stakesQueriedAsset === false).length}`)
    } else {
      check('staking opportunities returned (skipped APR check — none)', true)
    }
  } catch (e) {
    check('staking endpoint reachable', false, String(e))
  }

  // ── News relevance ──────────────────────────────────────────────────────────
  console.log('News')
  try {
    const n = await getJson('/live-data/news?asset=btc&limit=20')
    const articles = n.articles ?? []
    check('news returns articles (or empty, not error)', Array.isArray(articles))
  } catch (e) {
    check('news endpoint reachable', false, String(e))
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log('\nFailures:')
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
}

run().catch((e) => {
  console.error('Smoke run crashed:', e)
  process.exit(1)
})
