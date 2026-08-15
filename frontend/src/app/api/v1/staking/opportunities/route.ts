import { NextRequest, NextResponse } from 'next/server'
import { CORS, options } from '@/app/api/_cors'
import {
  STAKING_PROVIDERS, computeOverallRisk, mergedRisks, getRiskLevel,
  resolveYieldType, YIELD_TYPE_META, getStakingDataProvenance,
  type StakingCoinId, type ProviderCategory,
} from '@/lib/data/stakingProviders'
import { scoreStakingProvider } from '@/lib/risk/profiles/stakingAdapter'

export const dynamic = 'force-dynamic'
export { options as OPTIONS }

const LIVE_APR_SOURCES: Record<string, string> = {
  lido_eth:       'https://eth-api.lido.fi/v1/protocol/steth/apr/sma',
  marinade_sol:   'https://api.marinade.finance/msol/apy/1y',
  jito_sol:       'https://kobe.mainnet.jito.network/api/v1/apy',
}

async function fetchLiveRates(): Promise<{ rates: Record<string, number>; derived: Set<string> }> {
  const rates: Record<string, number> = {}
  const results = await Promise.allSettled(
    Object.entries(LIVE_APR_SOURCES).map(async ([key, url]) => {
      const res = await fetch(url, { next: { revalidate: 600 } })
      if (!res.ok) return
      const data = await res.json()
      let apr: number | null = null
      if (key === 'lido_eth') {
        const raw = (data as { data?: { aprs?: Array<{ apr: string }> } })?.data?.aprs?.[0]?.apr
        if (raw) apr = parseFloat(raw) * 100
      } else {
        const raw = typeof data === 'number' ? data : (data as { value?: number })?.value
        if (raw != null) apr = raw < 1 ? raw * 100 : raw
      }
      if (apr != null && apr > 0 && apr < 30) rates[key] = Math.round(apr * 100) / 100
    })
  )
  void results
  // Derive exchange rates from Lido if available. These are OUR estimates
  // anchored to a live feed, not the providers' own numbers — they must never
  // be labelled aprSource:'live' on the public contract (review defect D-19),
  // so the derived keys are tracked separately.
  const derived = new Set<string>()
  if (rates.lido_eth) {
    for (const [key, spread] of [['rocketpool_eth', 0.2], ['coinbase_eth', 0.5], ['kraken_eth', 0.2], ['binance_eth', 0.6]] as const) {
      if (rates[key] == null) {
        rates[key] = Math.round((rates.lido_eth - spread) * 100) / 100
        derived.add(key)
      }
    }
  }
  return { rates, derived }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const coinParam     = searchParams.get('coin')?.toLowerCase() as StakingCoinId | null
  const categoryParam = searchParams.get('category') as ProviderCategory | null
  const yieldTypeParam = searchParams.get('yield_type')?.toLowerCase() ?? null
  // When true (default), return only products that actually stake the queried coin —
  // i.e. exclude governance-token and lending yield. Set to 'true' to include them.
  const includeAdjacent = searchParams.get('include_adjacent') === 'true'
  const maxRisk       = parseFloat(searchParams.get('max_risk') ?? '10')
  // Canonical-scale FLOOR on safety (0–100 higher = safer): when set, only
  // opportunities scoring AT OR ABOVE it are returned. Additive to `max_risk`,
  // which is left byte-identical in meaning (1–10 higher = riskier). See R2 §5.3.
  //
  // NOTE: the spec (§5.3 Phase 5a) drafted this as `max_safety`, but a *floor*
  // named `max_*` re-creates the exact inverted-filter footgun §5.3 exists to
  // prevent (an agent reading "max" as a ceiling gets the opposite result,
  // silently, with a 200). It is named `min_safety` here for that reason; the
  // legacy `max_safety` spelling is accepted as an alias so no drafted client
  // breaks, but both mean the same floor.
  const minSafetyRaw  = searchParams.get('min_safety') ?? searchParams.get('max_safety')
  const minSafety     = minSafetyRaw != null ? parseFloat(minSafetyRaw) : null
  const includeDefunct = searchParams.get('include_defunct') === 'true'

  const { rates: liveRates, derived: derivedKeys } = await fetchLiveRates()

  const opportunities: object[] = []

  for (const provider of STAKING_PROVIDERS) {
    if (provider.defunct && !includeDefunct) continue
    if (categoryParam && provider.category !== categoryParam) continue

    const overallRisk = computeOverallRisk(provider.risks)
    if (overallRisk > maxRisk) continue

    for (const [assetCoinId, asset] of Object.entries(provider.assets) as [StakingCoinId, NonNullable<(typeof provider.assets)[StakingCoinId]>][]) {
      if (!asset) continue
      if (coinParam && assetCoinId !== coinParam) continue

      const yieldType = resolveYieldType(provider, asset)
      const yieldMeta = YIELD_TYPE_META[yieldType]

      // Yield-type filters
      if (yieldTypeParam && yieldType !== yieldTypeParam) continue
      // By default, hide products that don't actually stake the queried coin
      // (governance-token staking, lending) so "ETH staking" means ETH staking.
      if (!includeAdjacent && !yieldMeta.stakesQueriedAsset && !yieldTypeParam) continue

      const effectiveRisks = mergedRisks(provider.risks, asset.assetRisks)
      const riskScore = computeOverallRisk(effectiveRisks)
      if (riskScore > maxRisk) continue

      // Canonical 0–100 higher-is-safer composite via the shared, tested adapter.
      const composite = scoreStakingProvider(effectiveRisks)
      const safetyScore = parseFloat(composite.score.toFixed(1))
      if (minSafety != null && safetyScore < minSafety) continue

      const liveApr = asset.liveAprKey ? liveRates[asset.liveAprKey] : undefined
      const apr     = liveApr ?? asset.staticApr
      // 'derived' = our Lido-anchored estimate for an exchange rate — a live
      // NUMBER but not the provider's own feed. Labelling it 'live' was D-19.
      const aprSource: 'live' | 'derived' | 'estimate' =
        liveApr != null ? (asset.liveAprKey && derivedKeys.has(asset.liveAprKey) ? 'derived' : 'live') : 'estimate'

      opportunities.push({
        provider:        provider.id,
        providerName:    provider.name,
        category:        provider.category,
        yieldType,
        yieldTypeLabel:  yieldMeta.label,
        stakesQueriedAsset: yieldMeta.stakesQueriedAsset,
        defunct:         provider.defunct ?? false,
        coin:            assetCoinId.toUpperCase(),
        coinId:          assetCoinId,
        apr,
        aprSource,
        lockupDays:      asset.lockupDays,
        lockupNote:      asset.lockupNote ?? null,
        liquid:          asset.liquid,
        receiptToken:    asset.receiptToken ?? null,
        minStakeNative:  asset.minStakeNative,
        custodyModel:    provider.custodyModel,
        // Canonical 0–100 higher-is-safer score + 5-level band (R2 §5.3 Phase 5a).
        // Prefer these; the legacy trio below is retained on its own scale.
        safetyScore,
        band:            composite.band,
        // @deprecated LEGACY 1–10 higher-is-RISKIER + 4-level vocabulary. Kept
        // byte-identical for existing consumers; migrate to safetyScore/band.
        riskScore:       parseFloat(riskScore.toFixed(2)),
        riskLevel:       getRiskLevel(riskScore),
        riskBreakdown: {
          custody:      effectiveRisks.custodyRisk,
          counterparty: effectiveRisks.counterpartyRisk,
          contract:     effectiveRisks.contractRisk,
          slashing:     effectiveRisks.slashingRisk,
          liquidity:    effectiveRisks.liquidityRisk,
          regulatory:   effectiveRisks.regulatoryRisk,
        },
        features:       asset.features,
        tvlBillions:    provider.tvlBillions ?? null,
        auditCount:     provider.auditCount ?? null,
      })
    }
  }

  // Sort: viable (non-defunct) first, then by APR desc
  opportunities.sort((a, b) => {
    const ao = a as Record<string, unknown>
    const bo = b as Record<string, unknown>
    if (ao.defunct !== bo.defunct) return ao.defunct ? 1 : -1
    return (bo.apr as number) - (ao.apr as number)
  })

  // Count opportunities per yield type for the response summary
  const yieldTypeCounts = opportunities.reduce<Record<string, number>>((acc, o) => {
    const t = (o as Record<string, unknown>).yieldType as string
    acc[t] = (acc[t] ?? 0) + 1
    return acc
  }, {})

  return NextResponse.json({
    opportunities,
    total: opportunities.length,
    yieldTypeCounts,
    filters: { coin: coinParam ?? 'all', category: categoryParam ?? 'all', yieldType: yieldTypeParam ?? 'all', includeAdjacent, maxRisk, minSafety, includeDefunct },
    note: 'Each opportunity carries a yieldType (native, liquid, cefi, restaking, governance, lending). By default only products that actually stake the queried coin are returned; governance-token staking and lending yield are excluded unless include_adjacent=true or yield_type is set explicitly. SCORING: prefer safetyScore (0–100, HIGHER = SAFER) with its 5-level band (low/moderate/elevated/high/critical); filter it with min_safety (a 0–100 floor). The legacy riskScore (1–10, HIGHER = RISKIER) with its riskLevel and the max_risk filter remain unchanged for existing consumers but are deprecated. Defunct providers (e.g. Celsius) are excluded by default — use include_defunct=true. FRESHNESS: updatedAt is when this response was generated, which describes the live APRs only (per-row aprSource="live"). Rows with aprSource="derived" are our estimates anchored to the Lido feed, not provider-published rates. Rows with aprSource="estimate", and every risk score, lock-up, and minimum on every row, come from the curated catalog described by referenceData — check referenceData.verifiedAt, not updatedAt, before treating those as current.',
    source: 'Finance Now curated staking catalog + live protocol APR feeds (Lido, Marinade, Jito). Some exchange ETH rates are derived from the Lido feed (aprSource="derived").',
    updatedAt: new Date().toISOString(),
    // Provenance for the curated half of this payload. Without it the fresh
    // `updatedAt` above implied the risk profiles and estimated APRs had just
    // been refreshed too, which was never true (audit finding M5).
    referenceData: getStakingDataProvenance(),
  }, { headers: CORS })
}
