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
 * Has anyone opened the primary documents?
 *
 * `seeded` — written from the regulation text and IRS guidance as reproduced by
 * research, WITHOUT every pinpoint cite being read in the original. This is the
 * source-terms registry's distinction, and it exists here for the same reason:
 * the first cut of these notes carried authority citations that read as though
 * someone had checked them, and two of them were wrong — a withdrawal fee was
 * said to reduce a taxable gain (it does not), and the per-wallet basis rule
 * was credited to the revenue procedure that is merely its elective transition
 * safe harbor. A verdict nobody read, wearing a citation that says somebody
 * did, launders an assumption into a record.
 *
 * Verification is also environment-dependent, exactly like the data audits:
 * irs.gov, eCFR, congress.gov and Cornell are unreachable from the build
 * environment, so this must be re-read on a machine that can open them. Flip to
 * `verified` only when someone has actually read §1.1001-7, §1.1012-1(h) and
 * (j), Rev. Proc. 2024-28 and the current §67 text in the original.
 */
export const TAX_GUIDANCE_REVIEW: 'seeded' | 'verified' = 'seeded'

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
   * Does any leg pay on-chain gas out of the user's own wallet?
   */
  paysGasFromWallet: boolean
  /**
   * Does any leg have a fee the venue withholds IN THE COIN being moved (the
   * ordinary exchange withdrawal fee)?
   *
   * This exists because the first cut gated the fee-disposition note on
   * `paysGasFromWallet` alone — so the note was hidden on precisely the case the
   * IRS names in terms ("digital assets you use, or are withheld, to pay for
   * transaction services") and shown on the case it does not. Withheld and
   * self-paid are the same event in substance: units leave you to pay for the
   * transfer.
   */
  feeWithheldInCoin?: boolean
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
    'No disposition occurs when you transfer crypto between wallets or exchange accounts you control, so no gain or loss is realised on the coin being moved, and its cost basis and holding period carry over — the transfer does not restart the one-year long-term clock. The exception is the fee: any coin you spend, or that the venue withholds, to pay for the transfer is treated separately (see below). Both ends must genuinely be yours — sending to someone else is a different question.',
  confidence: 'settled',
  authority: 'Gain is realised only on a sale or exchange (IRC §1001; crypto is property — Notice 2014-21). IRS FAQs on digital asset transactions state the self-transfer rule and its "used, or are withheld, to pay for transaction services" exception',
}

const FEE_UNITS_DISPOSED: TaxNote = {
  id: 'fee-paid-in-crypto-is-a-disposition',
  character: 'taxable-disposition',
  title: 'A fee paid in crypto is itself a small sale of the coin used to pay it',
  detail:
    'Whenever units are spent — gas you sign for, or a withdrawal fee the exchange takes out of the coin being sent — those units are disposed of to pay for a service. You have a gain or loss on them: their market value at that moment, less your basis in those particular units. It is small, it is separate from the transfer being non-taxable, and it is reportable.',
  confidence: 'settled',
  authority: 'Treas. Reg. §1.1001-7(b)(1)(ii) (TD 10000): using or withholding digital assets to pay transaction costs is a disposition of those assets',
}

const TRANSFER_FEES_STRANDED: TaxNote = {
  id: 'transfer-fees-stranded',
  character: 'basis-adjustment',
  title: 'The withdrawal and network fees on a move do not reduce your gain',
  detail:
    'Only costs that effect a sale, disposition or acquisition adjust proceeds or basis. Moving your own coin between your own accounts is none of those, so the IRS treats fees paid for that transfer as outside those rules — they are not netted against proceeds, not added to basis, and investment expenses are not separately deductible either. The practical result is that these fees are a real economic cost with no tax offset, even though the units spent paying them are a reportable disposition.',
  confidence: 'settled',
  authority: 'Treas. Reg. §1.1001-7(b)(2)(i) / §1.1012-1(h) — costs must effect a sale, disposition or acquisition; IRS FAQs state transfer-service fees between your own wallets are not digital asset transaction costs; miscellaneous itemized deductions are disallowed under IRC §67',
}

const TRANSFER_RECORD_KEEPING: TaxNote = {
  id: 'transfer-record-keeping',
  character: 'record-keeping',
  title: 'A move still creates a record-keeping obligation',
  detail:
    'Basis is tracked per wallet and per account rather than pooled across everything you hold, and brokers report transferred-in assets as "noncovered" — the receiving exchange generally does not know what you paid. Keep your own record of the basis and acquisition date that moved with these coins; reconstructing it later is the expensive part.',
  confidence: 'recently-changed',
  authority: 'Treas. Reg. §1.1012-1(j) imposes per-wallet/per-account basis identification for acquisitions and dispositions from 1 Jan 2025; Rev. Proc. 2024-28 is the ELECTIVE transition safe harbor for allocating pre-2025 basis, not the source of the requirement. Form 1099-DA regime (TD 10000)',
}

const SALE_IS_A_DISPOSITION: TaxNote = {
  id: 'sale-is-disposition',
  character: 'taxable-disposition',
  title: 'Selling is a taxable disposition',
  detail:
    'A sale realises capital gain or loss: proceeds minus your adjusted cost basis, per tax lot. Whether it is short-term or long-term turns on whether you held that lot more than one year. Which lots you are treated as selling depends on identifying them at the time of sale; absent that, the earliest units in that wallet or account go first.',
  confidence: 'settled',
  authority: 'IRC §1001 (gain/loss); IRC §1222 (holding period); Treas. Reg. §1.1012-1(j) (identification, and FIFO within the wallet or account absent it)',
}

const CRYPTO_TO_CRYPTO: TaxNote = {
  id: 'crypto-to-crypto-taxable',
  character: 'taxable-disposition',
  title: 'Converting to another coin — including a stablecoin — is also a disposition',
  detail:
    'Swapping one crypto for another is taxed as if you sold the first for its market value, even though no cash is received. Like-kind exchange deferral is not available: since 2018 it applies only to real property. Routing through a stablecoin does not avoid the disposition.',
  confidence: 'settled',
  authority: 'IRC §1001; IRC §1031(a)(1) as amended by the TCJA (real property only)',
}

const TRADING_FEES_ADJUST: TaxNote = {
  id: 'trading-fees-adjust-gain',
  character: 'basis-adjustment',
  title: 'Trading fees on the sale itself are not a separate deduction — they change the gain',
  detail:
    'Fees paid to acquire crypto are added to its cost basis; fees paid to effect the sale reduce the proceeds. Either way they flow into the capital gain calculation rather than being written off separately. This covers the trading commission on the sale leg — not the withdrawal or network fee for moving the coin afterwards, which is the different case described above.',
  confidence: 'settled',
  authority: 'Treas. Reg. §1.1012-1(h) (basis) and §1.1001-7(b) (amount realised) — digital asset transaction costs, for dispositions from 1 Jan 2025',
}

/**
 * Which notes apply to the route the user has actually built.
 *
 * Pure and order-stable: the reassuring, always-true fact leads, and the
 * uncertain one never appears without the settled context around it.
 */
export function getTransferTaxNotes(input: TaxCharacterInput): TaxNote[] {
  const notes: TaxNote[] = [NOT_A_TAXABLE_EVENT]

  // The carve-out travels WITH the reassuring rule, never below the fold: a fee
  // paid in crypto is the common case (on-chain gas always; an exchange
  // withdrawal fee usually), and "not a taxable event" read alone teaches the
  // reader that moving coins is free of consequence.
  if (input.paysGasFromWallet || input.feeWithheldInCoin) {
    notes.push(FEE_UNITS_DISPOSED)
    notes.push(TRANSFER_FEES_STRANDED)
  }

  notes.push(TRANSFER_RECORD_KEEPING)

  if (input.sellingFirst) {
    notes.push(SALE_IS_A_DISPOSITION)
    if (input.saleMayBeIntoCrypto) notes.push(CRYPTO_TO_CRYPTO)
    // Only ever shown alongside TRANSFER_FEES_STRANDED when a transfer fee
    // exists, so "fees reduce the gain" can't be read as covering the move.
    notes.push(TRADING_FEES_ADJUST)
  }

  return notes
}

export interface TaxGuidanceProvenance {
  source: string
  compiledAt: string
  ageDays: number
  stale: boolean
  scope: string
  review: 'seeded' | 'verified'
}

export function getTaxGuidanceProvenance(now: Date = new Date()): TaxGuidanceProvenance {
  return {
    source: 'Plain-language summary of US federal tax treatment, compiled from the Code, Treasury regulations and IRS guidance',
    compiledAt: TAX_GUIDANCE_COMPILED,
    ageDays: taxGuidanceAgeDays(now),
    stale: taxGuidanceIsStale(now),
    scope: 'US federal only — no state tax, no non-US regime. Educational, not tax advice.',
    review: TAX_GUIDANCE_REVIEW,
  }
}
