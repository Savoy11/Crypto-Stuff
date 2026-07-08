import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export interface LiveReserveAsset {
  id: string
  symbol: string
  name: string
  pegType: string
  pegMechanism: string
  circulatingUsd: number
  price: number
  priceSource: string
  chains: string[]
  // Composition breakdown from DefiLlama (where available)
  composition: { category: string; percentage: number; amount: number; description: string }[]
  // Attestation metadata (static — from known issuer disclosures)
  attester: string
  attestationUrl: string
  lastAttestedDate: string | null
  collateralizationRatio: number | null  // null = not publicly disclosed
}

// Snapshot date of the curated ATTESTATION_META below. These attester names,
// URLs, and dates are issuer-disclosure snapshots, NOT a live feed — update
// META_AS_OF whenever the table is refreshed.
const META_AS_OF = '2024-12-01'

// Known attestation metadata — keyed by uppercase symbol for reliable matching
// (DefiLlama coin IDs like 'usd-coin' are not stable across API responses)
const ATTESTATION_META: Record<string, {
  attester: string; attestationUrl: string; lastAttestedDate: string | null; collateralizationRatio: number
}> = {
  'USDC': {
    attester: 'Deloitte (via Grant Thornton)',
    attestationUrl: 'https://www.circle.com/en/transparency',
    lastAttestedDate: '2024-11-30',
    collateralizationRatio: 1.0,
  },
  'USDT': {
    attester: 'BDO Italia',
    attestationUrl: 'https://tether.to/en/transparency/',
    lastAttestedDate: '2024-09-30',
    collateralizationRatio: 1.0,
  },
  'DAI': {
    attester: 'On-chain (MakerDAO oracles)',
    attestationUrl: 'https://daistats.com',
    lastAttestedDate: null,
    collateralizationRatio: 1.5,
  },
  'FRAX': {
    attester: 'Frax Protocol (algorithmic)',
    attestationUrl: 'https://app.frax.finance/fraxstats',
    lastAttestedDate: null,
    collateralizationRatio: 1.0,
  },
  'TUSD': {
    attester: 'Moore Hong Kong',
    attestationUrl: 'https://real-time-attest.trustexplorer.io/truecurrencies',
    lastAttestedDate: '2024-10-01',
    collateralizationRatio: 1.0,
  },
  'PYUSD': {
    attester: 'Ernst & Young',
    attestationUrl: 'https://newsroom.paypal-corp.com/PYUSD-Transparency',
    lastAttestedDate: '2024-11-01',
    collateralizationRatio: 1.0,
  },
  'USDP': {
    attester: 'Withum',
    attestationUrl: 'https://www.paxos.com/attestations/',
    lastAttestedDate: '2024-10-31',
    collateralizationRatio: 1.0,
  },
  'GUSD': {
    attester: 'BPM',
    attestationUrl: 'https://gemini.com/dollar',
    lastAttestedDate: '2024-11-15',
    collateralizationRatio: 1.0,
  },
  'LUSD': {
    attester: 'On-chain (Liquity Protocol)',
    attestationUrl: 'https://www.liquity.org/',
    lastAttestedDate: null,
    collateralizationRatio: 1.1,
  },
}

// Peg composition breakdowns (from public disclosures — approximate), keyed by uppercase symbol
const COMPOSITION_MAP: Record<string, { category: string; percentage: number }[]> = {
  'USDC': [
    { category: 'Cash', percentage: 15 },
    { category: 'US Treasuries', percentage: 85 },
  ],
  'USDT': [
    { category: 'US Treasuries', percentage: 66 },
    { category: 'Cash & Bank Deposits', percentage: 15 },
    { category: 'Other Investments', percentage: 10 },
    { category: 'Secured Loans', percentage: 5 },
    { category: 'Corporate Bonds', percentage: 4 },
  ],
  'DAI': [
    { category: 'USDC Collateral', percentage: 32 },
    { category: 'ETH Collateral', percentage: 28 },
    { category: 'RWA (Treasuries)', percentage: 27 },
    { category: 'Other Crypto', percentage: 13 },
  ],
  'PYUSD': [
    { category: 'US Treasuries', percentage: 80 },
    { category: 'USD Deposits', percentage: 20 },
  ],
}

interface DefiLlamaStablecoin {
  id: string
  name: string
  symbol: string
  pegType: string
  pegMechanism: string
  circulating?: { peggedUSD?: number }
  price?: number
  priceSource?: string
  chains?: string[]
}

const TARGET_SYMBOLS = new Set(['USDC', 'USDT', 'DAI', 'FRAX', 'TUSD', 'PYUSD', 'USDP', 'GUSD', 'LUSD'])

export async function GET() {
  try {
    const res = await fetch('https://stablecoins.llama.fi/stablecoins?includePrices=true', {
      headers: { Accept: 'application/json' },
      next: { revalidate: 300 },
    })
    if (!res.ok) throw new Error(`DefiLlama HTTP ${res.status}`)
    const data = await res.json()

    const coins: DefiLlamaStablecoin[] = data.peggedAssets ?? []
    const filtered = coins.filter((c) => TARGET_SYMBOLS.has(c.symbol?.toUpperCase()))

    // DefiLlama returns several distinct tokens that share a ticker (e.g. multiple "USDP"/"USDp",
    // duplicate "GUSD"). Uppercasing the symbol for matching collapses these together, so without
    // de-duping we double-count supply AND attach an issuer's real attestation (e.g. Paxos/Withum)
    // to an unrelated lookalike token. Keep only the canonical entry per symbol — the one with the
    // largest circulating supply, which is reliably the real major stablecoin for our target set.
    const bySymbol = new Map<string, DefiLlamaStablecoin>()
    for (const coin of filtered) {
      const sym = coin.symbol?.toUpperCase() ?? ''
      const existing = bySymbol.get(sym)
      const circ = coin.circulating?.peggedUSD ?? 0
      if (!existing || circ > (existing.circulating?.peggedUSD ?? 0)) {
        bySymbol.set(sym, coin)
      }
    }
    const deduped = Array.from(bySymbol.values())

    const assets: LiveReserveAsset[] = deduped.map((coin): LiveReserveAsset => {
      const sym = coin.symbol?.toUpperCase() ?? ''
      const meta = ATTESTATION_META[sym] ?? null
      const rawComposition = COMPOSITION_MAP[sym] ?? []
      const circulatingUsd = coin.circulating?.peggedUSD ?? 0

      const composition = rawComposition.map((c) => ({
        category: c.category,
        percentage: c.percentage,
        amount: circulatingUsd * (c.percentage / 100),
        description: '',
      }))

      return {
        id: coin.id,
        symbol: coin.symbol,
        name: coin.name,
        pegType: coin.pegType ?? 'peggedUSD',
        pegMechanism: coin.pegMechanism ?? 'unknown',
        circulatingUsd,
        price: coin.price ?? 1,
        priceSource: coin.priceSource ?? 'DefiLlama',
        chains: coin.chains ?? [],
        composition,
        attester: meta?.attester ?? 'Not publicly disclosed',
        attestationUrl: meta?.attestationUrl ?? '#',
        lastAttestedDate: meta?.lastAttestedDate ?? null,
        collateralizationRatio: meta?.collateralizationRatio ?? null,
      }
    })

    assets.sort((a, b) => b.circulatingUsd - a.circulatingUsd)

    return NextResponse.json({ ok: true, assets, metaAsOf: META_AS_OF, updatedAt: new Date().toISOString() })
  } catch (err) {
    return NextResponse.json(
      { ok: false, assets: [], error: String(err), updatedAt: new Date().toISOString() },
      { status: 200 }
    )
  }
}
