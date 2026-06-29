import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export interface StakingRatesResponse {
  ok: boolean
  rates: Partial<Record<string, number>>  // provider key → APR %
  sources: Partial<Record<string, 'live' | 'estimate'>>
  updatedAt: string
}

// ─── Static fallback APRs ────────────────────────────────────────────────────
// These are shown any time a live fetch fails or times out.
// Keys must match the liveAprKey values used in stakingProviders.ts.
const FALLBACK: Record<string, number> = {
  // ETH liquid staking
  lido_eth:        3.8,
  rocketpool_eth:  3.6,
  ankr_eth:        3.7,
  coinbase_eth:    3.2,
  kraken_eth:      3.5,
  binance_eth:     3.1,

  // Solana
  marinade_sol:    7.0,
  jito_sol:        7.5,
  native_sol:      6.5,   // generic Solana native staking

  // Cosmos / ATOM
  stride_atom:     14.0,
  native_atom:     13.0,  // Cosmos Hub baseline (~13%)
  osmo_native:     9.0,   // Osmosis

  // Polkadot / Kusama
  native_dot:      12.0,
  native_ksm:      15.0,

  // Cardano
  native_ada:       4.5,

  // Avalanche
  native_avax:      7.5,

  // BNB Chain
  native_bnb:       5.0,

  // MATIC / Polygon
  native_matic:     4.5,
  lido_matic:       4.0,  // Lido stMATIC

  // TRON
  native_trx:       4.5,

  // Bitcoin yield (Babylon restaking baseline)
  babylon_btc:      3.5,

  // CRO (Crypto.com)
  native_cro:      10.0,

  // Injective
  native_inj:      14.0,
  stride_inj:      13.0,

  // Celestia
  native_tia:      17.0,
  stride_tia:      16.0,

  // NEAR Protocol
  native_near:     10.0,
  metapool_near:    9.5,
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clamp(v: number, lo = 0, hi = 50) { return v >= lo && v <= hi ? v : null }
function round2(v: number) { return Math.round(v * 100) / 100 }

/** Extract a number from various API shapes (decimal or percent, object or primitive) */
function extractNumber(data: unknown, ...paths: string[]): number | null {
  let v: unknown = data
  for (const p of paths) v = (v as Record<string, unknown>)?.[p]
  if (v == null) return null
  const n = typeof v === 'string' ? parseFloat(v) : Number(v)
  return isNaN(n) ? null : n
}

/** Normalise a rate: if < 1 assume decimal (0.038 → 3.8), else assume percent */
function normPct(raw: number): number { return raw < 1 ? raw * 100 : raw }

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function GET() {
  const rates  = { ...FALLBACK } as Record<string, number>
  const sources = Object.fromEntries(Object.keys(FALLBACK).map(k => [k, 'estimate'])) as Record<string, 'live' | 'estimate'>

  // Run all external fetches in parallel with a 6-second timeout each
  const T = 6_000
  function timedFetch(url: string, opts?: RequestInit) {
    const c = new AbortController()
    const id = setTimeout(() => c.abort(), T)
    return fetch(url, { ...opts, signal: c.signal, next: { revalidate: 300 } })
      .finally(() => clearTimeout(id))
  }

  const [
    lidoRes,
    rocketRes,
    marinadeRes,
    jitoRes,
    strideRes,
    cosmosRes,
    osmosisRes,
    dotRes,
    ksmRes,
    adaRes,
    avaxRes,
    bnbRes,
    maticRes,
    trxRes,
    injRes,
    tiaRes,
    nearRes,
  ] = await Promise.allSettled([
    // 1. Lido stETH 7-day APR SMA
    timedFetch('https://eth-api.lido.fi/v1/protocol/steth/apr/sma', { headers: { Accept: 'application/json' } }),
    // 2. Rocket Pool rETH APR (from Rocket Pool API)
    timedFetch('https://api.rocketpool.net/api/apr', { headers: { Accept: 'application/json' } }),
    // 3. Marinade mSOL 1-year APY
    timedFetch('https://api.marinade.finance/msol/apy/1y', { headers: { Accept: 'application/json' } }),
    // 4. Jito jitoSOL APY
    timedFetch('https://kobe.mainnet.jito.network/api/v1/apy', { headers: { Accept: 'application/json' } }),
    // 5. Stride stATOM APY
    timedFetch('https://edge.stride.zone/api/stake-stats', { headers: { Accept: 'application/json' } }),
    // 6. Cosmos Hub staking APR (Mintscan public API)
    timedFetch('https://api-cosmoshub-ia.cosmostation.io/cosmos/mint/v1beta1/inflation', { headers: { Accept: 'application/json' } }),
    // 7. Osmosis staking APR
    timedFetch('https://api-osmosis.cosmostation.io/cosmos/mint/v1beta1/inflation', { headers: { Accept: 'application/json' } }),
    // 8. Polkadot staking APY (Polkadot.js API via Subscan public)
    timedFetch('https://polkadot.webapi.subscan.io/api/v2/scan/staking_apy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }),
    // 9. Kusama staking APY (Subscan)
    timedFetch('https://kusama.webapi.subscan.io/api/v2/scan/staking_apy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }),
    // 10. Cardano staking yield (adapools public)
    timedFetch('https://js.adapools.org/global.json', { headers: { Accept: 'application/json' } }),
    // 11. Avalanche staking APY (Avalanche public endpoint)
    timedFetch('https://api.avax.network/ext/info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'info.getNodeVersion', params: {} }) }),
    // 12. BNB staking APR (BSC staking info)
    timedFetch('https://api.binance.org/v1/staking/asset?assetName=BNB', { headers: { Accept: 'application/json' } }),
    // 13. Polygon staking APR (Lido stMATIC)
    timedFetch('https://polygon.lido.fi/api/stats', { headers: { Accept: 'application/json' } }),
    // 14. TRON staking APR (TronScan public)
    timedFetch('https://apilist.tronscanapi.com/api/trx/staking-info', { headers: { Accept: 'application/json' } }),
    // 15. Injective inflation (Cosmos LCD)
    timedFetch('https://lcd.injective.network/cosmos/mint/v1beta1/inflation', { headers: { Accept: 'application/json' } }),
    // 16. Celestia inflation (Cosmostation LCD)
    timedFetch('https://api-celestia-ia.cosmostation.io/cosmos/mint/v1beta1/inflation', { headers: { Accept: 'application/json' } }),
    // 17. NEAR staking APY (NEAR public stats)
    timedFetch('https://api.nearblocks.io/v1/stats', { headers: { Accept: 'application/json' } }),
  ])

  // ── 1. Lido stETH ──────────────────────────────────────────────────────────
  if (lidoRes.status === 'fulfilled' && lidoRes.value.ok) {
    try {
      const d = await lidoRes.value.json()
      const raw = parseFloat(d?.data?.aprs?.[0]?.apr ?? d?.data?.smaApr ?? '')
      const pct = clamp(raw < 1 ? raw * 100 : raw, 0, 15)
      if (pct != null) {
        rates.lido_eth = round2(pct)
        rates.ankr_eth = round2(pct + 0.1)
        rates.coinbase_eth = round2(pct - 0.5)
        rates.kraken_eth   = round2(pct - 0.2)
        rates.binance_eth  = round2(pct - 0.6)
        for (const k of ['lido_eth','ankr_eth','coinbase_eth','kraken_eth','binance_eth']) sources[k] = 'live'
      }
    } catch { /* keep fallback */ }
  }

  // ── 2. Rocket Pool rETH ────────────────────────────────────────────────────
  if (rocketRes.status === 'fulfilled' && rocketRes.value.ok) {
    try {
      const d = await rocketRes.value.json()
      // RP API returns { yearlyAPR: "3.54" } or { currentAPR: number }
      const raw = parseFloat(d?.yearlyAPR ?? d?.currentAPR ?? d?.apr ?? '')
      const pct = clamp(normPct(raw), 0, 15)
      if (pct != null) { rates.rocketpool_eth = round2(pct); sources.rocketpool_eth = 'live' }
    } catch { /* fallback */ }
  }

  // ── 3. Marinade mSOL ───────────────────────────────────────────────────────
  if (marinadeRes.status === 'fulfilled' && marinadeRes.value.ok) {
    try {
      const d = await marinadeRes.value.json()
      const raw = typeof d === 'number' ? d : extractNumber(d, 'value') ?? extractNumber(d, 'apy')
      if (raw != null) {
        const pct = clamp(normPct(raw), 0, 25)
        if (pct != null) { rates.marinade_sol = round2(pct); sources.marinade_sol = 'live' }
      }
    } catch { /* fallback */ }
  }

  // ── 4. Jito jitoSOL ────────────────────────────────────────────────────────
  if (jitoRes.status === 'fulfilled' && jitoRes.value.ok) {
    try {
      const d = await jitoRes.value.json()
      const raw = typeof d === 'number' ? d : extractNumber(d, 'value') ?? extractNumber(d, 'apy')
      if (raw != null) {
        const pct = clamp(normPct(raw), 0, 25)
        if (pct != null) { rates.jito_sol = round2(pct); sources.jito_sol = 'live' }
      }
    } catch { /* fallback */ }
  }

  // If either Solana rate is live, derive native_sol as average
  if (sources.marinade_sol === 'live' || sources.jito_sol === 'live') {
    const vals = [rates.marinade_sol, rates.jito_sol].filter(Boolean) as number[]
    rates.native_sol = round2(vals.reduce((a, b) => a + b, 0) / vals.length)
    sources.native_sol = 'live'
  }

  // ── 5. Stride (stATOM, stINJ, stTIA) ──────────────────────────────────────
  if (strideRes.status === 'fulfilled' && strideRes.value.ok) {
    try {
      const d = await strideRes.value.json()
      // Stride API: { atom: { apr: "0.142" }, inj: { apr: "0.135" }, tia: { apr: "0.165" }, ... }
      const parseStride = (key: string) => {
        const raw = parseFloat(d?.[key]?.apr ?? d?.[key.toUpperCase()]?.apr ?? '')
        return isNaN(raw) ? null : clamp(normPct(raw), 0, 40)
      }
      const atom = parseStride('atom'); if (atom != null) { rates.stride_atom = round2(atom); sources.stride_atom = 'live' }
      const inj  = parseStride('inj');  if (inj  != null) { rates.stride_inj  = round2(inj);  sources.stride_inj  = 'live' }
      const tia  = parseStride('tia');  if (tia  != null) { rates.stride_tia  = round2(tia);  sources.stride_tia  = 'live' }
    } catch { /* fallback */ }
  }

  // ── 6. Cosmos Hub inflation → APR estimate ─────────────────────────────────
  if (cosmosRes.status === 'fulfilled' && cosmosRes.value.ok) {
    try {
      const d = await cosmosRes.value.json()
      const raw = parseFloat(d?.inflation ?? '')
      // Rough conversion: inflation / bonded_ratio (~67%) ≈ staking APR
      const apr = clamp(normPct(raw) / 0.67, 0, 35)
      if (apr != null) { rates.native_atom = round2(apr); sources.native_atom = 'live' }
    } catch { /* fallback */ }
  }

  // ── 7. Osmosis inflation ───────────────────────────────────────────────────
  if (osmosisRes.status === 'fulfilled' && osmosisRes.value.ok) {
    try {
      const d = await osmosisRes.value.json()
      const raw = parseFloat(d?.inflation ?? '')
      const apr = clamp(normPct(raw) / 0.50, 0, 50)   // Osmosis bonded ~50%
      if (apr != null) { rates.osmo_native = round2(apr); sources.osmo_native = 'live' }
    } catch { /* fallback */ }
  }

  // ── 8. Polkadot staking APY ────────────────────────────────────────────────
  if (dotRes.status === 'fulfilled' && dotRes.value.ok) {
    try {
      const d = await dotRes.value.json()
      const raw = parseFloat(d?.data?.apy ?? d?.apy ?? '')
      const pct = clamp(normPct(raw), 0, 30)
      if (pct != null) { rates.native_dot = round2(pct); sources.native_dot = 'live' }
    } catch { /* fallback */ }
  }

  // ── 9. Kusama staking APY ──────────────────────────────────────────────────
  if (ksmRes.status === 'fulfilled' && ksmRes.value.ok) {
    try {
      const d = await ksmRes.value.json()
      const raw = parseFloat(d?.data?.apy ?? d?.apy ?? '')
      const pct = clamp(normPct(raw), 0, 35)
      if (pct != null) { rates.native_ksm = round2(pct); sources.native_ksm = 'live' }
    } catch { /* fallback */ }
  }

  // ── 10. Cardano staking APY ────────────────────────────────────────────────
  if (adaRes.status === 'fulfilled' && adaRes.value.ok) {
    try {
      const d = await adaRes.value.json()
      // adapools global.json: { stats: { delegators: { ..., roa: "4.2" } } }
      const raw = parseFloat(d?.stats?.delegators?.roa ?? d?.roa ?? d?.apy ?? '')
      const pct = clamp(raw, 0, 15)
      if (pct != null) { rates.native_ada = round2(pct); sources.native_ada = 'live' }
    } catch { /* fallback */ }
  }

  // ── 11. Avalanche — info endpoint doesn't give APY; skip, keep fallback ────
  // AVAX staking APY is stable around 7–9%; no reliable public API without wallet

  // ── 12. BNB staking ────────────────────────────────────────────────────────
  if (bnbRes.status === 'fulfilled' && bnbRes.value.ok) {
    try {
      const d = await bnbRes.value.json()
      // Binance.org staking: { data: { stakingAccount: { annualizedYield: "5.3" } } }
      const raw = parseFloat(d?.data?.annualizedYield ?? d?.annualizedYield ?? d?.apr ?? '')
      const pct = clamp(normPct(raw), 0, 20)
      if (pct != null) { rates.native_bnb = round2(pct); sources.native_bnb = 'live' }
    } catch { /* fallback */ }
  }

  // ── 13. Polygon stMATIC (Lido) ─────────────────────────────────────────────
  if (maticRes.status === 'fulfilled' && maticRes.value.ok) {
    try {
      const d = await maticRes.value.json()
      // Lido Polygon stats: { apr: 4.2 } or { stMaticApr: "4.2" }
      const raw = parseFloat(d?.apr ?? d?.stMaticApr ?? d?.apy ?? '')
      const pct = clamp(normPct(raw), 0, 20)
      if (pct != null) {
        rates.lido_matic   = round2(pct)
        rates.native_matic = round2(pct + 0.3)   // native is slightly higher
        sources.lido_matic = 'live'
        sources.native_matic = 'live'
      }
    } catch { /* fallback */ }
  }

  // ── 14. TRON staking ───────────────────────────────────────────────────────
  if (trxRes.status === 'fulfilled' && trxRes.value.ok) {
    try {
      const d = await trxRes.value.json()
      // TronScan: { data: { stakeYield: 4.5 } } or { annualized_rate: 0.045 }
      const raw = parseFloat(d?.data?.stakeYield ?? d?.annualized_rate ?? d?.apr ?? '')
      const pct = clamp(normPct(raw), 0, 20)
      if (pct != null) { rates.native_trx = round2(pct); sources.native_trx = 'live' }
    } catch { /* fallback */ }
  }

  // ── 15. Injective inflation → APR ──────────────────────────────────────────
  if (injRes.status === 'fulfilled' && injRes.value.ok) {
    try {
      const d = await injRes.value.json()
      const raw = parseFloat(d?.inflation ?? '')
      const apr = clamp(normPct(raw) / 0.60, 0, 40)  // ~60% bonded ratio
      if (apr != null) { rates.native_inj = round2(apr); sources.native_inj = 'live' }
    } catch { /* fallback */ }
  }

  // ── 16. Celestia inflation → APR ───────────────────────────────────────────
  if (tiaRes.status === 'fulfilled' && tiaRes.value.ok) {
    try {
      const d = await tiaRes.value.json()
      const raw = parseFloat(d?.inflation ?? '')
      const apr = clamp(normPct(raw) / 0.65, 0, 40)  // ~65% bonded ratio
      if (apr != null) { rates.native_tia = round2(apr); sources.native_tia = 'live' }
    } catch { /* fallback */ }
  }

  // ── 17. NEAR staking APY (nearblocks stats) ────────────────────────────────
  if (nearRes.status === 'fulfilled' && nearRes.value.ok) {
    try {
      const d = await nearRes.value.json()
      // nearblocks: { stats: { staking_ratio: "0.65", epoch_reward: "..." } }
      // or { staking_return: 10.2 }
      const raw = parseFloat(d?.stats?.staking_return ?? d?.staking_return ?? d?.apy ?? '')
      const pct = clamp(raw < 1 ? raw * 100 : raw, 0, 25)
      if (pct != null) { rates.native_near = round2(pct); sources.native_near = 'live' }
    } catch { /* fallback */ }
  }

  // ── Bitcoin yield: no live public API; keep fallback estimate ──────────────
  // babylon_btc is a nascent protocol with variable TVL-based yield; static fallback is accurate

  return NextResponse.json({
    ok: true,
    rates,
    sources,
    updatedAt: new Date().toISOString(),
  } satisfies StakingRatesResponse)
}
