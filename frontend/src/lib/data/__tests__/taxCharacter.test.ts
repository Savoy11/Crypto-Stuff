import { describe, it, expect } from 'vitest'
import {
  getTransferTaxNotes,
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

  it('adds the disposition and basis notes only when the user is selling first', () => {
    const notes = getTransferTaxNotes({ ...MOVE_ONLY, sellingFirst: true })
    const ids = notes.map(n => n.id)
    expect(ids).toContain('sale-is-disposition')
    expect(ids).toContain('fees-adjust-basis')
  })

  it('calls out crypto-to-crypto only when the sale is into crypto', () => {
    const intoFiat = getTransferTaxNotes({ ...MOVE_ONLY, sellingFirst: true })
    expect(intoFiat.map(n => n.id)).not.toContain('crypto-to-crypto-taxable')
    const intoCrypto = getTransferTaxNotes({ ...MOVE_ONLY, sellingFirst: true, saleMayBeIntoCrypto: true })
    expect(intoCrypto.map(n => n.id)).toContain('crypto-to-crypto-taxable')
  })

  it('raises the gas-units question only when gas is actually paid from the wallet', () => {
    expect(getTransferTaxNotes(MOVE_ONLY).map(n => n.id)).not.toContain('gas-paid-in-crypto')
    const walletGas = getTransferTaxNotes({ ...MOVE_ONLY, paysGasFromWallet: true })
    expect(walletGas.map(n => n.id)).toContain('gas-paid-in-crypto')
  })
})

describe('honesty invariants', () => {
  const everyNote = (): TaxNote[] => getTransferTaxNotes({
    sellingFirst: true, paysGasFromWallet: true, saleMayBeIntoCrypto: true,
  })

  it('the uncertain note is labelled uncertain and never appears alone', () => {
    const notes = everyNote()
    const gas = notes.find(n => n.id === 'gas-paid-in-crypto')!
    expect(gas.confidence).toBe('uncertain')
    // the settled framing must always be present around it
    expect(notes.some(n => n.confidence === 'settled')).toBe(true)
    expect(notes.length).toBeGreaterThan(1)
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
