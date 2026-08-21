/**
 * Tax CHARACTER of a transfer route — what KIND of event each leg is under US
 * federal law, stated as settled tax treatment of transaction types.
 *
 * S3 (2026-08-21), part 1 of the owner's "explain the federal tax implications"
 * ask. Deliberately the narrow half: this module makes NO calculation, asks for
 * no personal figures, and produces no number a user could mistake for a tax
 * bill. It answers "is this a taxable event?" — not "what do I owe?".
 *
 * WHY THAT SPLIT. The single most useful and most reassuring fact about this
 * tool's core action is that it is NOT a taxable event: moving your own coin
 * between your own accounts is not a disposition. Users routinely believe the
 * opposite and avoid rebalancing because of it. Saying so requires no personal
 * data at all — so it ships separately from, and ahead of, any estimator.
 *
 * WHAT THIS IS NOT: tax advice, and not a substitute for a preparer or a
 * return. It is a plain-language summary of how the Code treats these
 * transaction types, with the authority named so a reader can check it. It
 * covers FEDERAL treatment only — no state tax, no non-US regime — and it
 * cannot know a user's lots, basis, residency, or filing position.
 *
 * PROVENANCE. Tax law moves, so this carries a compiled date and per-note
 * confidence rather than presenting every statement as equally solid. Two of
 * the notes below are 'recently-changed' (the per-wallet basis rule and the
 * 1099-DA phase-in, both 2025-2026) and one is 'uncertain' (whether paying
 * network gas in crypto is itself a micro-disposition — practitioner consensus,
 * no direct IRS guidance). Flattening those into one confident voice would be
 * the same failure as stamping a seeded table with a verified date.
 */

/** Date this guidance was compiled as a whole. Never bump for a partial edit. */
export const TAX_GUIDANCE_COMPILED = '2026-08-21'

/**
 * Tax guidance goes stale faster than a fee table in one specific way: an Act
 * of Congress can invalidate a note overnight. 180 days matches the source-terms
 * registry — long enough that the app is not crying wolf, short enough that a
 * filing-season change gets re-read.
 */
export const TAX_GUIDANCE_STALE_AFTER_DAYS = 180

export function taxGuidanceAgeDays(now: Date = new Date()): number {
  return Math.floor((now.getTime() - new Date(TAX_GUIDANCE_COMPILED + 'T00:00:00Z').getTime()) / 86_400_000)
}

export function taxGuidanceIsStale(now: Date = new Date()): boolean {
  return taxGuidanceAgeDays(now) > TAX_GUIDANCE_STALE_AFTER_DAYS
}

/**
 * How solid a statement is.
 * - `settled`          — long-standing treatment; a preparer would not blink.
 * - `recently-changed` — the rule changed in the last couple of filing years,
 *                        so older advice found online is likely wrong.
 * - `uncertain`        — no direct guidance; practitioner consensus at best.
 *                        Never presented as though it were settled.
 */
export type TaxConfidence = 'settled' | 'recently-changed' | 'uncertain'

/** What kind of claim a note makes about a leg of the route. */
export type TaxCharacter =
  | 'not-taxable'          // no disposition occurs
  | 'taxable-disposition'  // gain/loss is realised
  | 'basis-adjustment'     // affects basis or proceeds, not a separate deduction
  | 'record-keeping'       // no tax due, but a reporting/tracking consequence

export interface TaxNote {
  id: string
  character: TaxCharacter
  title: string
  detail: string
  confidence: TaxConfidence
  /** The authority a reader can look up. Not a citation to rely on in a return. */
  authority: string
}

export interface TaxCharacterInput {
  /**
   * Is the user selling before/instead of moving? Drives whether a disposition
   * is in scope at all. Mirrors the calculator's "I'm selling first" toggle.
   */
  sellingFirst: boolean
  /**
   * Does any leg pay on-chain gas out of the user's own wallet (rather than the
   * gas being covered by an exchange withdrawal fee)? Only then does the
   * uncertain fee-unit question arise.
   */
  paysGasFromWallet: boolean
  /**
   * Might the sale be into another crypto/stablecoin rather than fiat?
   *
   * Named for what the caller can honestly assert: the calculator does not
   * capture what a user sells INTO, and swapping to a stablecoin is the case
   * people most often assume is untaxed. Withholding a settled fact because we
   * are unsure it applies is the worse error, so callers that cannot tell
   * should pass true and let the note clarify.
   */
  saleMayBeIntoCrypto?: boolean
}

const NOT_A_TAXABLE_EVENT: TaxNote = {
  id: 'self-transfer-not-taxable',
  character: 'not-taxable',
  title: 'Moving your own coin between your own accounts is not a taxable event',
  detail:
    'No disposition occurs when you transfer crypto between wallets or exchange accounts you control, so no gain or loss is realised. Your original cost basis and holding period carry over unchanged — the transfer does not restart the one-year long-term clock.',
  confidence: 'settled',
  authority: 'Crypto is property (IRS Notice 2014-21); gain is realised only on a disposition (IRC §1001)',
}

const TRANSFER_RECORD_KEEPING: TaxNote = {
  id: 'transfer-record-keeping',
  character: 'record-keeping',
  title: 'It does create a record-keeping obligation',
  detail:
    'Since 2025 basis must be tracked per wallet and per account rather than pooled across all your holdings, and brokers report transferred-in assets as "noncovered" — meaning the receiving exchange generally does not know what you paid. Keep your own record of the basis and acquisition date that moved with these coins; reconstructing it later is the expensive part.',
  confidence: 'recently-changed',
  authority: 'Rev. Proc. 2024-28 (per-wallet basis, from 2025); Form 1099-DA regime (TD 10000)',
}

const SALE_IS_A_DISPOSITION: TaxNote = {
  id: 'sale-is-disposition',
  character: 'taxable-disposition',
  title: 'Selling is a taxable disposition',
  detail:
    'A sale realises capital gain or loss: proceeds minus your adjusted cost basis, per tax lot. Whether it is short-term or long-term turns on whether you held that lot more than one year — the rates differ, and which lots you are deemed to sell depends on the accounting method you have applied consistently.',
  confidence: 'settled',
  authority: 'IRC §1001 (gain/loss); IRC §1222 (holding period)',
}

const CRYPTO_TO_CRYPTO: TaxNote = {
  id: 'crypto-to-crypto-taxable',
  character: 'taxable-disposition',
  title: 'Converting to another coin — including a stablecoin — is also a disposition',
  detail:
    'Swapping one crypto for another is taxed as if you sold the first for its fair market value, even though no cash is received. Like-kind exchange deferral is not available: since 2018 IRC §1031 applies only to real property. Routing through a stablecoin to "avoid" a sale does not avoid the disposition.',
  confidence: 'settled',
  authority: 'IRC §1001; IRC §1031(a)(1) as amended by the TCJA (real property only)',
}

const FEES_ADJUST_BASIS: TaxNote = {
  id: 'fees-adjust-basis',
  character: 'basis-adjustment',
  title: 'The fees on this page are not a separate deduction — they change the gain',
  detail:
    'Fees paid to acquire crypto are added to its cost basis; fees paid to dispose of it reduce the proceeds. Either way they flow into the capital gain calculation rather than being written off separately. So a withdrawal or trading fee on a sale leg is not simply money lost — it reduces the gain you are taxed on.',
  confidence: 'settled',
  authority: 'IRC §1012 (basis); IRC §1001 (amount realised)',
}

const GAS_FEE_UNITS: TaxNote = {
  id: 'gas-paid-in-crypto',
  character: 'taxable-disposition',
  title: 'Paying gas from your own wallet may itself be a small disposition',
  detail:
    'When you pay network gas in crypto (ETH, SOL, BNB…), you are spending those fee units — and spending crypto is generally a disposition of the units spent, producing a small gain or loss against their basis. There is no direct IRS guidance on this point and practice varies; on a large or frequent transfer it is worth raising with a preparer rather than assuming either treatment.',
  confidence: 'uncertain',
  authority: 'No direct guidance; follows from IRC §1001 disposition principles',
}

/**
 * Which notes apply to the route the user has actually built.
 *
 * Pure and order-stable: the reassuring, always-true fact leads, and the
 * uncertain one never appears without the settled context around it.
 */
export function getTransferTaxNotes(input: TaxCharacterInput): TaxNote[] {
  const notes: TaxNote[] = [NOT_A_TAXABLE_EVENT, TRANSFER_RECORD_KEEPING]

  if (input.sellingFirst) {
    notes.push(SALE_IS_A_DISPOSITION)
    if (input.saleMayBeIntoCrypto) notes.push(CRYPTO_TO_CRYPTO)
    notes.push(FEES_ADJUST_BASIS)
  }

  if (input.paysGasFromWallet) notes.push(GAS_FEE_UNITS)

  return notes
}

export interface TaxGuidanceProvenance {
  source: string
  compiledAt: string
  ageDays: number
  stale: boolean
  scope: string
}

export function getTaxGuidanceProvenance(now: Date = new Date()): TaxGuidanceProvenance {
  return {
    source: 'Plain-language summary of US federal tax treatment, compiled from the Code, IRS guidance and published procedures',
    compiledAt: TAX_GUIDANCE_COMPILED,
    ageDays: taxGuidanceAgeDays(now),
    stale: taxGuidanceIsStale(now),
    scope: 'US federal only — no state tax, no non-US regime. Educational, not tax advice.',
  }
}
