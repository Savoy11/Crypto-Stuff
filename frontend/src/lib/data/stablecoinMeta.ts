// Curated stablecoin issuer metadata — attestations, reserve composition, and
// structural facts from public issuer disclosures. This is REFERENCE data
// (a maintained snapshot, not a live feed): consumers must surface META_AS_OF
// and treat it as lower-confidence than live oracle data.
//
// Shared by /live-data/reserves (transparency monitor) and
// /live-data/risk-scores (composite risk engine).

/** Snapshot date of the curated tables below — update when refreshing them. */
export const META_AS_OF = '2024-12-01'

/** The stablecoins Finance Now actively monitors (DefiLlama symbols, uppercase). */
export const MONITORED_STABLECOINS = ['USDC', 'USDT', 'DAI', 'FRAX', 'TUSD', 'PYUSD', 'USDP', 'GUSD', 'LUSD'] as const

export interface AttestationMeta {
  attester: string
  attestationUrl: string
  /** null = continuous on-chain verification, no periodic attestation. */
  lastAttestedDate: string | null
  collateralizationRatio: number
}

// Known attestation metadata — keyed by uppercase symbol for reliable matching
// (DefiLlama coin IDs like 'usd-coin' are not stable across API responses)
export const ATTESTATION_META: Record<string, AttestationMeta> = {
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

/** Reserve composition breakdowns (from public disclosures — approximate), keyed by uppercase symbol. */
export const COMPOSITION_MAP: Record<string, { category: string; percentage: number }[]> = {
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
  'FRAX': { regulatedIssuer: false, incidentPenalty: 10, incidentNote: 'Formerly fractional-algorithmic; migrated toward full collateralization after the UST collapse.' },
  'TUSD': { regulatedIssuer: false, incidentPenalty: 20, incidentNote: 'Attestation gaps and opaque issuer/custodian changes since 2023.' },
  'PYUSD': { regulatedIssuer: true, incidentPenalty: 0 },
  'USDP': { regulatedIssuer: true, incidentPenalty: 0 },
  'GUSD': { regulatedIssuer: true, incidentPenalty: 0 },
  'LUSD': { regulatedIssuer: false, incidentPenalty: 0 },
}
