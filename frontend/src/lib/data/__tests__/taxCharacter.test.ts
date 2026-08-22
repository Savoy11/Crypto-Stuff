import { describe, it, expect } from 'vitest'
import {
  getTransferTaxNotes,
  TAX_GUIDANCE_REVIEW,
  getTaxGuidanceProvenance,
  taxGuidanceAgeDays,
  taxGuidanceIsStale,
  TAX_GUIDANCE_COMPILED,
  TAX_GUIDANCE_STALE_AFTER_DAYS,
  type TaxNote,
} from '../taxCharacter'

const MOVE_ONLY = { sellingFirst: false, paysGasFromWallet: false }

describe('getTransferTaxNotes — what applies when', () => {
  it('always leads with the fact that a self-transfer is not taxable', () => {
    const notes = getTransferTaxNotes(MOVE_ONLY)
    expect(notes[0].id).toBe('self-transfer-not-taxable')
    expect(notes[0].character).toBe('not-taxable')
    expect(notes[0].confidence).toBe('settled')
  })

  it('pairs it with the record-keeping consequence, so "not taxable" is not read as "nothing to do"', () => {
    const ids = getTransferTaxNotes(MOVE_ONLY).map(n => n.id)
    expect(ids).toContain('transfer-record-keeping')
  })

  it('raises no disposition at all for a plain move', () => {
    const notes = getTransferTaxNotes(MOVE_ONLY)
    expect(notes.some(n => n.character === 'taxable-disposition')).toBe(false)
  })

  it('adds the disposition and trading-fee notes only when the user is selling first', () => {
    const notes = getTransferTaxNotes({ ...MOVE_ONLY, sellingFirst: true })
    const ids = notes.map(n => n.id)
    expect(ids).toContain('sale-is-disposition')
    expect(ids).toContain('trading-fees-adjust-gain')
  })

  it('calls out crypto-to-crypto only when the sale is into crypto', () => {
    const intoFiat = getTransferTaxNotes({ ...MOVE_ONLY, sellingFirst: true })
    expect(intoFiat.map(n => n.id)).not.toContain('crypto-to-crypto-taxable')
    const intoCrypto = getTransferTaxNotes({ ...MOVE_ONLY, sellingFirst: true, saleMayBeIntoCrypto: true })
    expect(intoCrypto.map(n => n.id)).toContain('crypto-to-crypto-taxable')
  })

  // The IRS names BOTH ways units leave you to pay for a transfer — "digital
  // assets you use, or are withheld". Gating on wallet gas alone hid the note
  // on the withheld case, which is the ordinary exchange withdrawal fee.
  it('raises the fee-disposition note for a venue-withheld fee, not just wallet gas', () => {
    expect(getTransferTaxNotes(MOVE_ONLY).map(n => n.id))
      .not.toContain('fee-paid-in-crypto-is-a-disposition')
    for (const input of [
      { ...MOVE_ONLY, paysGasFromWallet: true },
      { ...MOVE_ONLY, feeWithheldInCoin: true },
    ]) {
      expect(getTransferTaxNotes(input).map(n => n.id))
        .toContain('fee-paid-in-crypto-is-a-disposition')
    }
  })

  it('never claims a transfer fee reduces the gain, and pairs the fee notes', () => {
    const notes = getTransferTaxNotes({ ...MOVE_ONLY, feeWithheldInCoin: true })
    const ids = notes.map(n => n.id)
    // the stranded-cost note must accompany the disposition note
    expect(ids).toContain('transfer-fees-stranded')
    const stranded = notes.find(n => n.id === 'transfer-fees-stranded')!
    expect(stranded.detail).toContain('not netted against proceeds')
    // Practice diverges from the IRS position here (major tax software
    // capitalises the fee instead), so this must never wear the settled badge.
    expect(stranded.confidence).toBe('uncertain')
    expect(stranded.detail).toContain('Practice is not uniform')
  })

  it('scopes the fees-change-the-gain claim to the sale, never the move', () => {
    const notes = getTransferTaxNotes({ ...MOVE_ONLY, sellingFirst: true, feeWithheldInCoin: true })
    const trading = notes.find(n => n.id === 'trading-fees-adjust-gain')!
    // it must disclaim the withdrawal/network leg explicitly
    expect(trading.detail).toContain('not the withdrawal or network fee')
    // and it may never appear without the stranded-cost note when a transfer fee exists
    expect(notes.map(n => n.id)).toContain('transfer-fees-stranded')
  })

  it('no settled note claims a withdrawal or network fee adjusts basis or proceeds', () => {
    const notes = getTransferTaxNotes({
      sellingFirst: true, paysGasFromWallet: true, feeWithheldInCoin: true, saleMayBeIntoCrypto: true,
    })
    for (const n of notes.filter(n => n.character === 'basis-adjustment')) {
      const claimsReduction = /withdrawal[^.]*reduces the gain|network fee[^.]*reduces the gain/i
      expect(`${n.title} ${n.detail}`, `${n.id} extends the basis rule to a transfer fee`)
        .not.toMatch(claimsReduction)
    }
  })

  it('is honest that the notes have not been read against primary sources', () => {
    expect(TAX_GUIDANCE_REVIEW).toBe('seeded')
    expect(getTaxGuidanceProvenance().review).toBe('seeded')
  })
})

describe('honesty invariants', () => {
  const everyNote = (): TaxNote[] => getTransferTaxNotes({
    sellingFirst: true, paysGasFromWallet: true, feeWithheldInCoin: true, saleMayBeIntoCrypto: true,
  })

  it('the not-taxable headline never stands without its fee carve-out when a fee is paid in coin', () => {
    const notes = everyNote()
    expect(notes[0].id).toBe('self-transfer-not-taxable')
    // the carve-out is stated in the headline note itself...
    expect(notes[0].detail).toContain('withholds')
    // ...and the disposition note follows it immediately
    expect(notes[1].id).toBe('fee-paid-in-crypto-is-a-disposition')
  })

  it('the two rules that changed for 2025/2026 are not presented as long-settled', () => {
    const rec = everyNote().find(n => n.id === 'transfer-record-keeping')!
    expect(rec.confidence).toBe('recently-changed')
  })

  it('every note names an authority a reader can look up', () => {
    for (const n of everyNote()) {
      expect(n.authority.length, `${n.id} has no authority`).toBeGreaterThan(10)
    }
  })

  // The whole point of part 1: it characterises, it does not calculate. A digit
  // in this copy would be a rate or a threshold, and rates go stale and drift
  // toward advice — which is what the estimator (part 2, user-supplied inputs)
  // is for.
  it('states no rate, bracket or dollar threshold anywhere in the copy', () => {
    for (const n of everyNote()) {
      const copy = `${n.title} ${n.detail}`
      expect(copy, `${n.id} contains a % rate`).not.toMatch(/\d+(\.\d+)?\s*%/)
      expect(copy, `${n.id} contains a dollar figure`).not.toMatch(/\$\s?\d/)
    }
  })

  it('gives no instruction on whether or when to transact', () => {
    for (const n of everyNote()) {
      const copy = `${n.title} ${n.detail}`.toLowerCase()
      for (const phrase of ['you should sell', 'you should buy', 'we recommend', 'best to sell', 'wait until', 'hold for at least']) {
        expect(copy, `${n.id} reads as advice: "${phrase}"`).not.toContain(phrase)
      }
    }
  })

  it('note ids are unique and stable', () => {
    const ids = everyNote().map(n => n.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('provenance', () => {
  it('reports age and staleness from an injectable clock', () => {
    const compiled = new Date(TAX_GUIDANCE_COMPILED + 'T00:00:00Z')
    const justAfter = new Date(compiled.getTime() + 86_400_000)
    expect(taxGuidanceAgeDays(justAfter)).toBe(1)
    expect(taxGuidanceIsStale(justAfter)).toBe(false)

    const wayLater = new Date(compiled.getTime() + (TAX_GUIDANCE_STALE_AFTER_DAYS + 2) * 86_400_000)
    expect(taxGuidanceIsStale(wayLater)).toBe(true)
  })

  it('states its scope as federal-only and not advice', () => {
    const p = getTaxGuidanceProvenance()
    expect(p.scope.toLowerCase()).toContain('federal')
    expect(p.scope.toLowerCase()).toContain('not tax advice')
  })
})
