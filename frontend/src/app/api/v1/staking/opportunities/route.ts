import { NextRequest, NextResponse } from 'next/server'
import { CORS, options } from '@/app/api/_cors'
import {
  STAKING_PROVIDERS, computeOverallRisk, mergedRisks, getRiskLevel,
  resolveYieldType, YIELD_TYPE_META,
  type StakingCoinId, type ProviderCategory,
} from '@/lib/data/stakingProviders'

export const dynamic = 'force-dynamic'
export { options as OPTIONS }

const LIVE_APR_SOURCES: Record<string, string> = {
  lido_eth:       'https://eth-api.lido.fi/v1/protocol/steth/apr/sma',
  marinade_sol:   'https://api.marinade.finance/msol/apy/1y',
  jito_sol:       'https://kobe.mainnet.jito.network/api/v1/apy',
}

async function fetchLiveRates(): Promise<Record<string, number>> {
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
  // Derive exchange rates from Lido if available
  if (rates.lido_eth) {
    rates.rocketpool_eth = rates.rocketpool_eth ?? Math.round((rates.lido_eth - 0.2) * 100) / 100
    rates.coinbase_eth   = rates.coinbase_eth   ?? Math.round((rates.lido_eth - 0.5) * 100) / 100
    rates.kraken_eth     = rates.kraken_eth     ?? Math.round((rates.lido_eth - 0.2) * 100) / 100
    rates.binance_eth    = rates.binance_eth     ?? Math.round((rates.lido_eth - 0.6) * 100) / 100
  }
  return rates
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
  const includeDefunct = searchParams.get('include_defunct') === 'true'

  const liveRates = await fetchLiveRates()

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

      const liveApr = asset.liveAprKey ? liveRates[asset.liveAprKey] : undefined
      const apr     = liveApr ?? asset.staticApr
      const aprSource: 'live' | 'estimate' = liveApr != null ? 'live' : 'estimate'

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
    filters: { coin: coinParam ?? 'all', category: categoryParam ?? 'all', yieldType: yieldTypeParam ?? 'all', includeAdjacent, maxRisk, includeDefunct },
    note: 'Each opportunity carries a yieldType (native, liquid, cefi, restaking, governance, lending). By default only products that actually stake the queried coin are returned; governance-token staking and lending yield are excluded unless include_adjacent=true or yield_type is set explicitly. riskScore is a composite 1–10 score (10 = highest risk). Defunct providers (e.g. Celsius) are excluded by default — use include_defunct=true.',
    updatedAt: new Date().toISOString(),
  }, { headers: CORS })
}
