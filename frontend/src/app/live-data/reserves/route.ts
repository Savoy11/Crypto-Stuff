import { NextResponse } from 'next/server'
import { ATTESTATION_META, COMPOSITION_MAP, META_AS_OF, MONITORED_STABLECOINS } from '@/lib/data/stablecoinMeta'

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

// Attestation metadata, reserve composition, and META_AS_OF now live in
// src/lib/data/stablecoinMeta.ts — shared with the risk-scores engine.

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

const TARGET_SYMBOLS = new Set<string>(MONITORED_STABLECOINS)

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

      // Composition percentages are shares of the RESERVE POOL, not of
      // circulating supply, so the dollar figures have to scale by the
      // collateralization ratio. Multiplying circulating supply alone is only
      // right at a 1.0 ratio: DAI is disclosed at 1.5, so every leg was
      // understated by a third (~$1.51B shown for ETH collateral against
      // ~$2.27B disclosed) while the centre of the same donut read
      // "150.0% Collat." — one chart contradicting itself. LUSD (1.1) had the
      // same defect.
      const reservePoolUsd = circulatingUsd * (meta?.collateralizationRatio ?? 1)
      const composition = rawComposition.map((c) => ({
        category: c.category,
        percentage: c.percentage,
        amount: reservePoolUsd * (c.percentage / 100),
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
