import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Every surface that lists assets must offer PRICE as a sort option.
 *
 * Owner requirement (2026-08-22): "Price should be a sort option on every page
 * displaying assets." It had drifted — /assets showed market cap, 24h change,
 * liquidity and volume but no price column at all, and both scanners plus coin
 * discovery could sort by everything except the most basic figure about an
 * asset.
 *
 * This is a source-text guard in the NT12 style: it reads each page's sort-key
 * declaration rather than rendering it, so it needs no live market data (which
 * is exactly what the build environment cannot reach). It fails if someone
 * removes a price sort, which is the regression it exists to catch.
 */

const ROOT = join(process.cwd(), 'src', 'app', '(dashboard)')

/** Surfaces that list assets, and the token proving price is sortable there. */
const SURFACES: { label: string; file: string; token: string }[] = [
  { label: 'Coins registry',   file: 'assets/../../../components/assets/AssetTable.tsx', token: "key: 'price'" },
  { label: 'Stock Registry',   file: 'equities/EquitiesClient.tsx',                      token: "'price'" },
  { label: 'Fund Registry',    file: 'funds/FundsClient.tsx',                            token: "'price'" },
  { label: 'Coin Discovery',   file: 'coin-discovery/page.tsx',                          token: "value: 'price'" },
  { label: 'Crypto Scanner',   file: 'scanner/page.tsx',                                 token: "key: 'price'" },
  { label: 'Equities Scanner', file: 'equities/scanner/page.tsx',                        token: "key: 'price' as const" },
  // FX quotes a rate, which IS the price of the pair — the column is labelled
  // "Rate" because that is what a currency pair's price is called.
  { label: 'Currencies',       file: 'macro/currencies/CurrenciesClient.tsx',            token: "'rate'" },
]

/**
 * The one deliberate exception, kept here so it is a recorded decision rather
 * than an oversight someone "fixes" later.
 *
 * Commodity contracts quote in different units — gold in $/troy oz, corn in
 * ¢/bushel — so ordering the raw numbers ranks cocoa above gold and means
 * nothing. Converting to a common unit would be worse: it implies a
 * comparability between a bushel and an ounce that does not exist. Percent
 * change IS comparable across contracts, and that is sortable.
 */
const EXEMPT = {
  label: 'Commodities',
  file: 'macro/commodities/CommoditiesClient.tsx',
  reason: 'contracts quote in different units, so raw price order is meaningless',
}

const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

describe('price is a sort option on every asset-listing surface', () => {
  for (const s of SURFACES) {
    it(`${s.label} offers a price sort`, () => {
      const src = read(s.file)
      expect(src.includes(s.token), `${s.label} (${s.file}) no longer offers a price sort — expected ${s.token}`).toBe(true)
    })
  }

  it('the commodities exemption is still documented in the file itself', () => {
    // If someone adds price sorting to commodities, this fails and the reasoning
    // above must be revisited deliberately rather than silently contradicted.
    const src = read(EXPECTED_EXEMPT_FILE())
    expect(src.includes("No 'price'"), 'the commodities no-price-sort rationale has gone — was price sorting added without revisiting why it was excluded?').toBe(true)
  })

  // Guards the guard: if the paths were wrong, every assertion above would pass
  // vacuously on empty strings.
  it('every surface file was actually read', () => {
    for (const s of [...SURFACES, EXEMPT]) {
      expect(read(s.file).length, `${s.file} is empty or unreadable`).toBeGreaterThan(200)
    }
  })
})

function EXPECTED_EXEMPT_FILE() { return EXEMPT.file }
