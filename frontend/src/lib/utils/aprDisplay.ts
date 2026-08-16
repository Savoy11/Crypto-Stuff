// APR selection for staking provider cards — pure so the "which number shows,
// and is it labelled live" decision is testable. A wrong `live` badge here is
// exactly the misattribution bug the own-key rule exists to prevent.

import {
  DEFAULT_LIVE_APR_KEY,
  type StakingProvider, type StakingCoinId,
} from '@/lib/data/stakingProviders'

export function aprDisplay(
  staticApr: number,
  liveKey: string | undefined,
  rates: Partial<Record<string, number>>,
  sources: Partial<Record<string, 'live' | 'estimate'>>,
) {
  // Only providers with their OWN live-rate key show a live number/badge.
  // The old coin-level default-key fallback displayed a different provider's
  // rate (e.g. Lido's stETH APR on a CeFi card) as if it were this provider's.
  if (!liveKey) return { apr: staticApr, live: false }
  const live = rates[liveKey]
  if (live != null) return { apr: live, live: sources[liveKey] === 'live' }
  return { apr: staticApr, live: false }
}

/**
 * Resolve which live-rate key an asset row should read.
 *   1. An explicit asset.liveAprKey always wins.
 *   2. Self-custody wallets do NATIVE delegation, so the live network base rate
 *      (DEFAULT_LIVE_APR_KEY) is an honest reading of what the position earns
 *      (minus a small validator commission). Scoped to non-ETH coins: wallet ETH
 *      staking routes through assorted providers, so we don't show one LST's rate
 *      for it. CeFi/liquid are deliberately excluded — their rates aren't the raw
 *      network rate, so they must opt in with an explicit key.
 */
export function resolveLiveAprKey(
  provider: StakingProvider,
  coinId: StakingCoinId,
  asset: StakingProvider['assets'][StakingCoinId],
): string | undefined {
  if (asset?.liveAprKey) return asset.liveAprKey
  if (provider.category === 'wallet' && coinId !== 'eth') return DEFAULT_LIVE_APR_KEY[coinId]
  return undefined
}
