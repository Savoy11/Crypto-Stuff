// Curated stablecoin issuer metadata — attestations, reserve composition, and
// structural facts from public issuer disclosures. This is REFERENCE data
// (a maintained snapshot, not a live feed): consumers must surface META_AS_OF
// and treat it as lower-confidence than live oracle data.
//
// Shared by /live-data/reserves (transparency monitor) and
// /live-data/risk-scores (composite risk engine).

/** Snapshot date of the curated tables below — update when refreshing them. */
export const META_AS_OF = '2026-07-28'

// ── Staleness machinery (same pattern as transferFees.ts) ────────────────────
// Issuer attestations publish monthly-to-quarterly, so a snapshot older than
// 120 days is more than one full attestation cycle behind and must be treated
// as stale. This exists because the previous snapshot silently aged to 20
// months while feeding the live risk engine (audit finding H2, 2026-07-27).

export const META_STALE_AFTER_DAYS = 120

export function stablecoinMetaAgeDays(now: Date = new Date()): number {
  return Math.floor((now.getTime() - new Date(META_AS_OF).getTime()) / 86_400_000)
}

export function stablecoinMetaIsStale(now: Date = new Date()): boolean {
  return stablecoinMetaAgeDays(now) > META_STALE_AFTER_DAYS
}

export type StablecoinMetaConfidence = 'high' | 'medium' | 'low'

export interface StablecoinMetaProvenance {
  source: string
  verifiedAt: string
  ageDays: number
  stale: boolean
  confidence: StablecoinMetaConfidence
}

export function getStablecoinMetaProvenance(now: Date = new Date()): StablecoinMetaProvenance {
  const ageDays = stablecoinMetaAgeDays(now)
  const stale = ageDays > META_STALE_AFTER_DAYS
  const confidence: StablecoinMetaConfidence =
    ageDays <= 60 ? 'high' : ageDays <= META_STALE_AFTER_DAYS ? 'medium' : 'low'
  return {
    source: 'Curated snapshot of public issuer disclosures (attestations, reserve reports)',
    verifiedAt: META_AS_OF,
    ageDays,
    stale,
    confidence,
  }
}

/** The stablecoins Finance Now Free actively monitors (DefiLlama symbols, uppercase). */
export const MONITORED_STABLECOINS = ['USDC', 'USDT', 'DAI', 'FRAX', 'TUSD', 'PYUSD', 'USDP', 'GUSD', 'LUSD'] as const

export interface AttestationMeta {
  attester: string
  attestationUrl: string
  /** null = continuous on-chain verification, no periodic attestation. */
  lastAttestedDate: string | null
  collateralizationRatio: number
}

// Known attestation metadata — keyed by uppercase symbol for reliable matching
// (DefiLlama coin IDs like 'usd-coin' are not stable across API responses).
//
// Refreshed 2026-07-28 (audit H2) from public issuer disclosures. Dates marked
// "conservative" are the latest attestation that could be POSITIVELY verified;
// issuers on a monthly cadence likely have a newer one — never assume it.
export const ATTESTATION_META: Record<string, AttestationMeta> = {
  'USDC': {
    // Monthly Deloitte & Touche AUP reports; March 2026 report verified
    // ($77.2B in circulation, reserves in Circle Reserve Fund + bank cash).
    attester: 'Deloitte & Touche (monthly)',
    attestationUrl: 'https://www.circle.com/transparency',
    lastAttestedDate: '2026-03-31',
    collateralizationRatio: 1.0,
  },
  'USDT': {
    // Quarterly BDO Italia attestation; Q1 2026 (as of 2026-03-31, published
    // 2026-05-01): $191.7B assets vs $183.5B liabilities → ~1.04.
    attester: 'BDO Italia (quarterly)',
    attestationUrl: 'https://tether.to/en/transparency/',
    lastAttestedDate: '2026-03-31',
    collateralizationRatio: 1.04,
  },
  'DAI': {
    // MakerDAO rebranded to Sky (2024); DAI and USDS share one collateral
    // pool. Blended CR is well below the old crypto-vault-only ~1.5 now that
    // ~60% of backing is 1:1 USDC + RWA treasuries; ~1.2 is an approximation.
    attester: 'On-chain (Sky Protocol, formerly MakerDAO)',
    attestationUrl: 'https://info.sky.money',
    lastAttestedDate: null,
    collateralizationRatio: 1.2,
  },
  'FRAX': {
    // No longer fractional-algorithmic: frxUSD mints only against approved
    // custodial collateral (Circle USDC, Securitize/BlackRock BUIDL,
    // Superstate, WisdomTree, et al.).
    attester: 'Custodian-backed (frxUSD enshrined custodians)',
    attestationUrl: 'https://frax.com/frxUSD',
    lastAttestedDate: null,
    collateralizationRatio: 1.0,
  },
  'TUSD': {
    // Attestations reported paused/irregular amid collateral concerns; this
    // is the last regular attestation date we can stand behind. See
    // STRUCTURE_META incident note (SEC settlement, custodian opacity).
    attester: 'Moore Hong Kong (paused/irregular)',
    attestationUrl: 'https://www.tusd.io/',
    lastAttestedDate: '2024-10-01',
    collateralizationRatio: 1.0,
  },
  'PYUSD': {
    // Paxos-issued; KPMG LLP took over attestations from Withum for reports
    // posted on/after 2025-02-28. Monthly cadence; May 2026 conservative.
    attester: 'KPMG LLP (monthly)',
    attestationUrl: 'https://www.paxos.com/pyusd-transparency',
    lastAttestedDate: '2026-05-31',
    collateralizationRatio: 1.0,
  },
  'USDP': {
    // Paxos DISCONTINUED proactive monthly USDP reserve reports (confirmed
    // 2026-07). Last era of regular reports ended around the Withum→KPMG
    // handover; freshness scoring should see this as the gap it is.
    attester: 'KPMG LLP — proactive monthly reports discontinued',
    attestationUrl: 'https://www.paxos.com/usdp-transparency',
    lastAttestedDate: '2025-02-28',
    collateralizationRatio: 1.0,
  },
  'GUSD': {
    // BPM periodic attestations under NYDFS oversight; monthly cadence
    // historically. Conservative quarter-end — exact latest not verified.
    attester: 'BPM (periodic, NYDFS-supervised)',
    attestationUrl: 'https://www.gemini.com/dollar',
    lastAttestedDate: '2026-03-31',
    collateralizationRatio: 1.0,
  },
  'LUSD': {
    // Immutable Liquity v1 protocol — continuously verifiable on-chain.
    attester: 'On-chain (Liquity Protocol)',
    attestationUrl: 'https://www.liquity.org/',
    lastAttestedDate: null,
    collateralizationRatio: 1.1,
  },
}

/** Reserve composition breakdowns (from public disclosures — approximate), keyed by uppercase symbol. */
export const COMPOSITION_MAP: Record<string, { category: string; percentage: number }[]> = {
  // Circle March 2026 report: ~80% short-dated treasuries via the BlackRock-
  // managed Circle Reserve Fund (USDXX), ~20% cash at GSIBs.
  'USDC': [
    { category: 'US Treasuries (Circle Reserve Fund)', percentage: 80 },
    { category: 'Cash at banks', percentage: 20 },
  ],
  // Tether Q1 2026 attestation: $141B direct T-bills of $191.7B assets, plus
  // reverse repo, money-market funds, ~$8B gold, ~$7B bitcoin, remainder
  // cash/secured loans/other.
  'USDT': [
    { category: 'US Treasuries', percentage: 74 },
    { category: 'Reverse Repos', percentage: 6 },
    { category: 'Money Market Funds', percentage: 4 },
    { category: 'Gold', percentage: 4 },
    { category: 'Bitcoin', percentage: 4 },
    { category: 'Cash, Secured Loans & Other', percentage: 8 },
  ],
  // Sky (ex-MakerDAO) Q1 2026: shared DAI/USDS collateral pool.
  'DAI': [
    { category: 'USDC (PSM)', percentage: 38 },
    { category: 'RWA (Treasuries)', percentage: 22 },
    { category: 'Crypto-collateralized loans', percentage: 25 },
    { category: 'Spark Protocol allocation', percentage: 10 },
    { category: 'Other', percentage: 5 },
  ],
  // Paxos PYUSD: treasuries + reverse repo + deposits per monthly reports.
  'PYUSD': [
    { category: 'US Treasuries & Reverse Repos', percentage: 85 },
    { category: 'USD Deposits', percentage: 15 },
  ],
}

export interface StablecoinStructureMeta {
  /** Issuer operates under a prudential regulator (e.g. NYDFS trust charter). */
  regulatedIssuer: boolean
  /** Penalty (0–50) for past incidents: attestation gaps, banking crises, enforcement. */
  incidentPenalty: number
  incidentNote?: string
}

/**
 * Structural facts per monitored stablecoin. regulatedIssuer reflects a
 * NYDFS trust charter or equivalent prudential oversight of the issuer.
 */
export const STRUCTURE_META: Record<string, StablecoinStructureMeta> = {
  'USDC': { regulatedIssuer: true, incidentPenalty: 10, incidentNote: 'Depegged to ~$0.88 during the March 2023 SVB collapse; made whole within days.' },
  'USDT': { regulatedIssuer: false, incidentPenalty: 15, incidentNote: '2021 CFTC settlement over historical misstatements about reserve backing.' },
  'DAI': { regulatedIssuer: false, incidentPenalty: 10, incidentNote: 'Black Thursday 2020 liquidation failures left bad debt; system recapitalized.' },
  'FRAX': { regulatedIssuer: false, incidentPenalty: 10, incidentNote: 'Formerly fractional-algorithmic; frxUSD is now fully custodian-collateralized (migration completed after the UST collapse).' },
  'TUSD': { regulatedIssuer: false, incidentPenalty: 20, incidentNote: 'Attestation gaps and opaque issuer/custodian changes since 2023.' },
  'PYUSD': { regulatedIssuer: true, incidentPenalty: 0 },
  'USDP': { regulatedIssuer: true, incidentPenalty: 10, incidentNote: 'Paxos discontinued proactive monthly USDP reserve reports (2025–2026); transparency materially reduced versus peers.' },
  'GUSD': { regulatedIssuer: true, incidentPenalty: 0 },
  'LUSD': { regulatedIssuer: false, incidentPenalty: 0 },
}
