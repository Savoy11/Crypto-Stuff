// Portfolio Builder engine — pure logic, no API calls.
// Turns a suitability questionnaire into a diversified target allocation
// mapped to concrete catalog instruments, with drift bands for rebalancing.
//
// EDUCATIONAL TOOLING, NOT INVESTMENT ADVICE. The UI must show a disclaimer.

import { FUND_CATALOG, computeFeeDrag } from './fundCatalog'
import type { SectorId } from './equityCatalog'
import { SECTOR_INFO } from './equityCatalog'
import { computeHoldings, type Portfolio } from './portfolioUtils'

// ─── Inputs ───────────────────────────────────────────────────────────────────

export type CryptoComfort = 'none' | 'small' | 'moderate'

/**
 * Appetite for an optional macro sleeve (commodities, currencies).
 *
 * These are opt-in by design. They aren't "riskier assets you graduate into"
 * the way crypto is — they're diversifiers, and a growth-focused investor may
 * deliberately want none of them. Nothing here is sized off risk tolerance
 * for that reason: a high-risk investor doesn't automatically want more gold.
 */
export type SleeveAppetite = 'none' | 'small' | 'moderate'

// ─── Sleeve styles ────────────────────────────────────────────────────────────
//
// Appetite decides HOW MUCH; style decides WHAT KIND. The distinction matters
// because risk varies as much *within* an asset class as between them: silver
// is roughly twice as volatile as gold, high-yield credit behaves like equity
// in a crisis while Treasuries rally, and a commodity currency moves *with*
// risk assets rather than against them.
//
// Every style is optional and every default reproduces the behaviour that
// existed before styles were added, so saved plans replay unchanged.

export type CryptoStyle = 'bitcoin' | 'diversified'
export type CommodityStyle = 'gold' | 'balanced' | 'precious' | 'broad'
export type CurrencyStyle = 'reserve' | 'haven' | 'commodity'
export type BondStyle = 'treasury' | 'aggregate' | 'corporate' | 'high-yield'

/** One instrument inside a sleeve. `share` is a fraction of that sleeve. */
export interface SleeveHolding {
  symbol: string
  share: number
  rationale: string
}

export const CRYPTO_STYLES: Record<CryptoStyle, { label: string; note: string; mix: SleeveHolding[] }> = {
  bitcoin: {
    label: 'Bitcoin only',
    note: 'The longest track record and the lower volatility of the two — the conservative way to hold crypto.',
    mix: [{ symbol: 'IBIT', share: 1, rationale: 'Spot-Bitcoin ETF sleeve — sized so a full crypto drawdown cannot derail the plan.' }],
  },
  diversified: {
    label: 'Bitcoin + Ethereum',
    note: 'Adds Ethereum: a different technology bet with higher volatility than Bitcoin, weighted smaller for that reason.',
    mix: [
      { symbol: 'IBIT', share: 0.7, rationale: 'Spot-Bitcoin ETF — the larger, less volatile leg of the crypto sleeve.' },
      { symbol: 'ETHA', share: 0.3, rationale: 'Spot-Ether ETF — separate technology and adoption risk from Bitcoin, held smaller because it swings harder.' },
    ],
  },
}

export const COMMODITY_STYLES: Record<CommodityStyle, { label: string; note: string; mix: SleeveHolding[] }> = {
  gold: {
    label: 'Gold only',
    note: 'The lowest-volatility commodity and the one with the longest record of holding up when equities and bonds fall together.',
    mix: [{ symbol: 'GLDM', share: 1, rationale: 'Gold at 10bps — the cheapest broad diversifier, sized to steady the plan without dragging it.' }],
  },
  balanced: {
    label: 'Gold + broad basket',
    note: 'Gold carries the crisis hedge; the basket carries the supply-shock inflation case gold alone can miss.',
    mix: [
      { symbol: 'GLDM', share: 0.6, rationale: 'Gold at 10bps — the diversifier with the longest record of holding up when equities and bonds fall together.' },
      { symbol: 'PDBC', share: 0.4, rationale: 'Broad commodity basket (energy, metals, agriculture) — hedges supply-driven inflation. Issues a 1099, not a K-1.' },
    ],
  },
  precious: {
    label: 'Precious metals',
    note: 'Adds silver — roughly twice gold’s volatility, because industrial demand ties it to the economic cycle in a way gold isn’t.',
    mix: [
      { symbol: 'GLDM', share: 0.65, rationale: 'Gold at 10bps — the stable anchor of a precious-metals sleeve.' },
      { symbol: 'SIVR', share: 0.35, rationale: 'Silver at 30bps — part monetary metal, part industrial input; swings harder than gold in both directions.' },
    ],
  },
  broad: {
    label: 'Broad basket only',
    note: 'Energy-weighted, so it tracks inflation more directly than gold — and falls harder when growth slows.',
    mix: [{ symbol: 'PDBC', share: 1, rationale: 'Broad commodity basket (energy, metals, agriculture) — the most direct inflation hedge here, and the most volatile. Issues a 1099, not a K-1.' }],
  },
}

export const CURRENCY_STYLES: Record<CurrencyStyle, { label: string; note: string; mix: SleeveHolding[] }> = {
  reserve: {
    label: 'Major reserve',
    note: 'The two largest non-dollar reserve currencies — the plainest way to not hold every asset in dollars.',
    mix: [
      { symbol: 'FXE', share: 0.5, rationale: 'Euro deposits — the largest non-dollar reserve currency.' },
      { symbol: 'FXY', share: 0.5, rationale: 'Yen deposits — the other major reserve currency, and historically a risk-off haven.' },
    ],
  },
  haven: {
    label: 'Safe haven',
    note: 'Franc and yen both tend to appreciate during crises, which is when a diversifier has to earn its place.',
    mix: [
      { symbol: 'FXF', share: 0.5, rationale: 'Swiss franc deposits — the classic crisis currency, backed by a persistent current-account surplus.' },
      { symbol: 'FXY', share: 0.5, rationale: 'Yen deposits — strengthens when carry trades unwind, which is usually when equities are falling.' },
    ],
  },
  commodity: {
    label: 'Commodity currencies',
    note: 'Australian and Canadian dollars track commodity demand — they tend to fall WITH equities, so they diversify least when it matters most.',
    mix: [
      { symbol: 'FXA', share: 0.5, rationale: 'Australian dollar deposits — a currency proxy for Chinese demand and metals prices.' },
      { symbol: 'FXC', share: 0.5, rationale: 'Canadian dollar deposits — tracks oil as much as rate differentials.' },
    ],
  },
}

export const BOND_STYLES: Record<BondStyle, { label: string; note: string }> = {
  treasury:     { label: 'Treasuries only',   note: 'Government-backed throughout — no corporate default risk, and the assets that rally hardest in a flight to safety.' },
  aggregate:    { label: 'Aggregate market',  note: 'The whole investment-grade market: government, high-quality corporate, and mortgage debt.' },
  corporate:    { label: 'Corporate tilt',    note: 'Adds investment-grade corporate credit for extra yield, accepting modest default and spread risk.' },
  'high-yield': { label: 'High-yield tilt',   note: 'Adds below-investment-grade debt. The yield is real, and so is the risk: high-yield falls with equities in a crisis, exactly when bonds are supposed to hold.' },
}

export interface BuilderInputs {
  /** 1 (capital preservation) … 10 (maximum growth) */
  riskTolerance: number
  /** Years until retirement */
  yearsToRetirement: number
  /** Years until the money is first spent — the binding constraint */
  yearsToFirstUse: number
  /** Optional sector tilts, max 3 applied */
  sectorFocus: SectorId[]
  /** Sectors the user does not want tilted into. See the caveat in buildPortfolio. */
  sectorExclude: SectorId[]
  cryptoComfort: CryptoComfort
  /**
   * Optional macro sleeves. Both are `?` on purpose: plans saved before these
   * existed replay through reviewPlan()'s aged rebuild with the field absent,
   * and must rebuild identically rather than sprouting a sleeve the user
   * never chose. Absent === 'none'.
   */
  commodityComfort?: SleeveAppetite
  currencyComfort?: SleeveAppetite
  /**
   * What kind of exposure inside each sleeve. Optional for the same reason
   * the appetites are: every default reproduces pre-style behaviour, so a
   * saved plan rebuilds identically instead of silently changing holdings.
   */
  cryptoStyle?: CryptoStyle
  commodityStyle?: CommodityStyle
  currencyStyle?: CurrencyStyle
  /** Bonds are always held, so this is a style with no appetite selector. */
  bondStyle?: BondStyle
  /** Investment amount in USD (for dollar figures in the output) */
  amount: number
}

// ─── Output ───────────────────────────────────────────────────────────────────

export type BuilderAssetClass =
  | 'us-equity' | 'intl-equity' | 'sector-tilt' | 'bonds' | 'inflation' | 'cash'
  | 'crypto' | 'commodity' | 'currency'

export const ASSET_CLASS_INFO: Record<BuilderAssetClass, { label: string; color: string }> = {
  'us-equity':   { label: 'US Equity',            color: '#3b82f6' },
  'intl-equity': { label: 'International Equity', color: '#06b6d4' },
  'sector-tilt': { label: 'Sector Tilts',         color: '#8b5cf6' },
  'bonds':       { label: 'Bonds',                color: '#64748b' },
  'inflation':   { label: 'Inflation Protection', color: '#f59e0b' },
  'cash':        { label: 'Cash & Short-Term',    color: '#22c55e' },
  'crypto':      { label: 'Crypto',               color: '#f97316' },
  'commodity':   { label: 'Commodities',          color: '#a16207' },
  'currency':    { label: 'Foreign Currency',     color: '#ec4899' },
}

export interface BuiltHolding {
  symbol: string
  name: string
  assetClass: BuilderAssetClass
  weightPct: number
  amountUsd: number
  rationale: string
}

export interface SuitabilityNote {
  level: 'info' | 'warn'
  message: string
}

export interface FeeSummary {
  /** Weight-averaged expense ratio across holdings with known ERs. */
  blendedExpenseRatioPct: number
  /** blendedExpenseRatioPct applied to the invested amount, per year. */
  annualFeeUsd: number
  /** Cumulative cost over the horizon vs a 3bps benchmark, compounded. */
  horizonFeeDragUsd: number
  /** Share of portfolio weight whose expense ratio is actually known (0–100). */
  coveragePct: number
}

export interface BuiltPortfolio {
  inputs: BuilderInputs
  /** The binding horizon the allocation was built against, in years. */
  horizonYears: number
  classMix: Array<{ assetClass: BuilderAssetClass; pct: number }>
  holdings: BuiltHolding[]
  fees: FeeSummary
  /** Rebalance when any holding drifts this many absolute points from target */
  driftBandPct: number
  /** Suggested review cadence in days */
  reviewIntervalDays: number
  diversificationScore: number // 0–100
  notes: SuitabilityNote[]
}

// ─── Sector tilt ETF mapping (from the fund catalog) ─────────────────────────

const SECTOR_ETF: Partial<Record<SectorId, string>> = {
  'technology': 'XLK',
  'financials': 'XLF',
  'energy': 'XLE',
  'healthcare': 'XLV',
  'industrials': 'XLI',
  'utilities': 'XLU',
  'real-estate': 'VNQ',
}

function fund(symbol: string) {
  const f = FUND_CATALOG.find((x) => x.symbol === symbol)
  return { symbol, name: f?.name ?? symbol }
}

/** Expense ratio from the catalog, or null when the symbol isn't catalogued. */
function expenseRatio(symbol: string): number | null {
  return FUND_CATALOG.find((x) => x.symbol === symbol)?.expenseRatioPct ?? null
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const round1 = (v: number) => Math.round(v * 10) / 10

// ─── Bond ladder ──────────────────────────────────────────────────────────────

// Duration is matched to the spend date: a long bond fund yanked at the wrong
// moment can lose more than the equity it was meant to stabilise, so the sleeve
// shortens as the money comes due. Shares are fractions of the bond sleeve.

/**
 * A bond-ladder rung is just a sleeve holding, so the two share a type — which
 * means consolidateLadder()'s sliver protection applies to every sleeve, not
 * only bonds.
 */
type LadderRung = SleeveHolding

/** Below this, the defensive sleeve is held as one fund instead of split. */
export const MIN_SPLITTABLE_SLEEVE_PCT = 5
/** A rung worth less than this much of the portfolio isn't worth holding. */
export const MIN_RUNG_PCT = 1

/**
 * A leg of an optional sleeve needs more weight than a bond rung to justify
 * itself: bond rungs are duration slices of one allocation, whereas a sleeve
 * leg is a distinct position the user has to buy, hold and rebalance. Below
 * this, the sleeve collapses to its largest leg instead.
 */
export const MIN_SLEEVE_LEG_PCT = 2

/**
 * Drop rungs too small to be worth trading and re-spread their share over the
 * survivors, so a thin sleeve becomes one or two real positions rather than a
 * handful of slivers. Always returns at least one rung.
 */
/**
 * Rewrite a duration ladder for a credit posture. Duration (which maturities)
 * stays the horizon's decision; this only changes credit quality.
 *
 * 'treasury' swaps the aggregate fund — which holds corporate and mortgage
 * debt — for its Treasury equivalent; the duplicate IEF rungs that produces
 * merge downstream in add(). The credit tilts scale the government ladder down
 * and append the credit fund, so shares still total 1.
 */
export function applyBondStyle(rungs: LadderRung[], style: BondStyle): LadderRung[] {
  if (style === 'aggregate') return rungs
  if (style === 'treasury') {
    return rungs.map((r) => r.symbol === 'BND'
      ? { ...r, symbol: 'IEF', rationale: 'Intermediate Treasuries in place of the aggregate market — government-backed, with no corporate or mortgage credit risk.' }
      : r)
  }
  const credit = style === 'corporate'
    ? { symbol: 'LQD', share: 0.3, rationale: 'Investment-grade corporate bonds — extra yield over Treasuries in exchange for modest default and spread risk.' }
    : { symbol: 'HYG', share: 0.2, rationale: 'High-yield corporate bonds — the highest income here, and the one bond holding that falls alongside equities in a crisis.' }
  return [
    ...rungs.map((r) => ({ ...r, share: r.share * (1 - credit.share) })),
    credit,
  ]
}

export function consolidateLadder(
  rungs: LadderRung[],
  sleevePct: number,
  minLegPct: number = MIN_RUNG_PCT,
): LadderRung[] {
  if (sleevePct <= 0) return []
  const kept = rungs.filter((r) => sleevePct * r.share >= minLegPct)
  // Everything is a sliver: keep the single largest rung and give it the sleeve.
  if (kept.length === 0) {
    const biggest = rungs.reduce((a, b) => (a.share >= b.share ? a : b))
    return [{ ...biggest, share: 1 }]
  }
  const keptShare = kept.reduce((s, r) => s + r.share, 0)
  return kept.map((r) => ({ ...r, share: r.share / keptShare }))
}

export function bondLadder(horizon: number): LadderRung[] {
  if (horizon < 3) return [
    { symbol: 'SHY', share: 1, rationale: '1–3 year Treasuries only — with the money due this soon, duration risk is the risk that matters.' },
  ]
  if (horizon < 7) return [
    { symbol: 'SHY', share: 0.5, rationale: '1–3 year Treasuries — the rung that matures before the spend date.' },
    { symbol: 'IEF', share: 0.5, rationale: '7–10 year Treasuries — modest duration for yield while the horizon still allows it.' },
  ]
  if (horizon < 15) return [
    { symbol: 'SHY', share: 0.2, rationale: '1–3 year Treasuries — the near rung, drawn down first.' },
    { symbol: 'IEF', share: 0.5, rationale: '7–10 year Treasuries — the ladder’s centre of gravity.' },
    { symbol: 'BND', share: 0.3, rationale: 'Aggregate bond market — broad credit and maturity exposure around the Treasury rungs.' },
  ]
  return [
    { symbol: 'IEF', share: 0.3, rationale: '7–10 year Treasuries — the near rung of a long ladder.' },
    { symbol: 'BND', share: 0.45, rationale: 'Aggregate bond market — the diversified core of the sleeve.' },
    { symbol: 'TLT', share: 0.25, rationale: '20+ year Treasuries — long duration earns its keep only on a horizon this far out, and hedges equity drawdowns.' },
  ]
}

// ─── Engine ───────────────────────────────────────────────────────────────────

export function buildPortfolio(inputs: BuilderInputs): BuiltPortfolio {
  const notes: SuitabilityNote[] = []
  // Style defaults reproduce pre-style behaviour exactly, so plans saved
  // before styles existed rebuild with identical holdings.
  const cryptoStyle = inputs.cryptoStyle ?? 'bitcoin'
  const commodityStyle = inputs.commodityStyle ?? 'balanced'
  const currencyStyle = inputs.currencyStyle ?? 'reserve'
  const bondStyle = inputs.bondStyle ?? 'aggregate'
  // The binding horizon is when the money is actually used, not retirement.
  const horizon = Math.max(0, Math.min(inputs.yearsToFirstUse, inputs.yearsToRetirement + 30))
  if (inputs.yearsToFirstUse < inputs.yearsToRetirement) {
    notes.push({ level: 'info', message: `Allocation is anchored to first use in ${inputs.yearsToFirstUse}y — the binding constraint — rather than retirement in ${inputs.yearsToRetirement}y.` })
  }

  // 1. Equity share: glide path by horizon, tilted by risk tolerance.
  //    horizon 25y+ → base 85%; scales down to 15% at 1y. Risk shifts ±15pts.
  const horizonEquity = clamp(15 + (horizon / 25) * 70, 15, 85)
  const riskShift = (inputs.riskTolerance - 5.5) * 3.3 // −15 … +15
  let equityPct = clamp(horizonEquity + riskShift, 10, 95)

  // 2. Cash floor for near-term spending
  let cashPct = horizon < 1 ? 30 : horizon < 3 ? 15 : horizon < 5 ? 5 : 0
  if (cashPct > 0) {
    notes.push({ level: 'info', message: `Money needed within ${horizon} years — ${cashPct}% held in short-term Treasuries to protect the spend date.` })
    equityPct = Math.min(equityPct, 100 - cashPct - 10)
  }

  // 3. Alternative sleeves — crypto, commodities, foreign currency. All opt-in.
  //
  //    Each sleeve is funded from its OWN side of the growth/defensive split,
  //    so opting in never changes how much risk the plan takes — only what
  //    expresses it. Commodities are a growth-side diversifier and come out of
  //    equity; foreign currency moves like cash and comes out of the bond
  //    side. The glide path decided the risk posture from the horizon; a
  //    diversification choice shouldn't silently override it.
  let cryptoPct = inputs.cryptoComfort === 'none' ? 0
    : inputs.cryptoComfort === 'small' ? clamp(inputs.riskTolerance * 0.5, 1, 4)
    : clamp(inputs.riskTolerance, 2, 8)
  if (horizon < 5) cryptoPct = Math.min(cryptoPct, 2)
  if (cryptoPct > 0 && horizon < 5) {
    notes.push({ level: 'warn', message: 'Crypto sleeve capped at 2% — volatile assets fit poorly with a spend date under five years.' })
  }

  // Commodities are deliberately NOT scaled by risk tolerance. Gold is a
  // diversifier, not a growth asset — wanting more risk is not a reason to
  // hold more of it, and an aggressive investor may rationally want none.
  let commodityPct = inputs.commodityComfort === 'small' ? 5
    : inputs.commodityComfort === 'moderate' ? 10
    : 0
  if (horizon < 3 && commodityPct > 0) {
    commodityPct = Math.min(commodityPct, 3)
    notes.push({ level: 'warn', message: 'Commodity sleeve trimmed to 3% — gold and broad commodities can fall 20%+ in a year, which a spend date this close cannot absorb.' })
  }

  const currencyPct = inputs.currencyComfort === 'small' ? 3
    : inputs.currencyComfort === 'moderate' ? 6
    : 0
  if (currencyPct > 0) {
    notes.push({ level: 'warn', message: 'Foreign currency holds no long-run expected return — it is a relative bet, not a productive asset, and these funds charge 0.40% a year to hold cash. International equity already carries unhedged currency exposure, so this sleeve mostly makes sense if the money will actually be spent in another currency.' })
  }

  // Style-specific risk disclosure: each of these picks a materially riskier
  // profile inside its asset class, and the reason belongs on the plan.
  if (cryptoPct > 0 && cryptoStyle === 'diversified') {
    notes.push({ level: 'info', message: 'Crypto sleeve splits 70/30 Bitcoin to Ethereum — Ethereum carries separate technology and adoption risk and swings harder, so it is held at the smaller weight.' })
  }
  if (commodityPct > 0 && commodityStyle === 'precious') {
    notes.push({ level: 'info', message: 'Silver is roughly twice as volatile as gold: industrial demand ties it to the economic cycle, so it diversifies less in exactly the recessions gold is held for.' })
  }
  if (commodityPct > 0 && commodityStyle === 'broad') {
    notes.push({ level: 'info', message: 'A broad basket is energy-weighted, so it tracks inflation more directly than gold — and falls harder when growth slows.' })
  }
  if (currencyPct > 0 && currencyStyle === 'commodity') {
    notes.push({ level: 'warn', message: 'Commodity currencies fall alongside equities when growth expectations drop — they diversify least in the drawdowns a diversifier is meant for. Safe-haven currencies behave the opposite way.' })
  }
  if (bondStyle === 'high-yield') {
    notes.push({ level: 'warn', message: 'High-yield bonds default in recessions and fell over 30% in 2008 — they behave like equity precisely when the bond sleeve is supposed to be holding the plan steady. The extra yield is compensation for that, not a free lunch.' })
  }
  if (bondStyle === 'corporate') {
    notes.push({ level: 'info', message: 'Investment-grade corporate credit adds yield over Treasuries, with modest default risk and spreads that widen when equities fall.' })
  }
  if (bondStyle === 'treasury') {
    notes.push({ level: 'info', message: 'Treasuries only — no corporate default risk, and the asset most likely to rally in a flight to safety. The trade-off is a lower yield than the aggregate market.' })
  }

  // 4. Bonds fill the remainder; part goes to TIPS on long horizons.
  //    A sleeve this small can't be subdivided — splitting 2% three ways buys
  //    $500 positions whose trading friction outweighs the diversification.
  //    Commodities are funded from equity (same side of the split); currency
  //    and crypto fall out of the residual below. The final clamp is an
  //    overflow guard: equity 95 + crypto 8 alone used to total 103%, which
  //    the rounding pass then hid by silently shrinking the core holding.
  equityPct = Math.max(0, equityPct - commodityPct)
  const altsPct = cryptoPct + commodityPct + currencyPct
  equityPct = clamp(equityPct, 0, Math.max(0, 100 - cashPct - altsPct))
  let bondsTotal = Math.max(0, 100 - equityPct - cashPct - altsPct)
  // What's left after a max-risk plan funds every sleeve can be a fraction of
  // a point. That isn't a bond position, it's a rounding artifact — a 0.2%
  // sleeve is $200 on a $100k plan. Hand it back to equity rather than emit a
  // fund nobody can meaningfully buy.
  if (bondsTotal > 0 && bondsTotal < MIN_RUNG_PCT) {
    equityPct = round1(equityPct + bondsTotal)
    bondsTotal = 0
  }
  const splittable = bondsTotal >= MIN_SPLITTABLE_SLEEVE_PCT
  const inflationPct = splittable ? round1(bondsTotal * (horizon >= 10 ? 0.3 : 0.2)) : 0
  const bondsPct = round1(bondsTotal - inflationPct)

  // 5. Split equity: international sleeve + sector tilts carved from US.
  //    Exclusions beat focus — a user who says "not energy" means it.
  const intlPct = round1(equityPct * 0.3)
  const excluded = new Set(inputs.sectorExclude)
  const conflicted = inputs.sectorFocus.filter((s) => excluded.has(s))
  const wanted = inputs.sectorFocus.filter((s) => SECTOR_ETF[s] && !excluded.has(s))
  const tilts = wanted.slice(0, 3)
  // The 3% floor exists so a tilt is a real position rather than a sliver, but
  // it must not outrun the equity sleeve it comes out of. On a defensive plan
  // (equity 10%: 3 intl + 3 tilts × 3%) the old unclamped arithmetic drove the
  // US core NEGATIVE, `add()` silently dropped it, and the plan shipped with
  // VTI at 0% — three single-sector ETFs and no diversified core, under a note
  // promising the tilts "can't dominate a diversified core". Cap the tilt
  // budget so the core always keeps the larger half of what's left after
  // international.
  const tiltBudget = Math.max(0, round1((equityPct - intlPct) * 0.5))
  const idealEach = round1(clamp(equityPct * 0.06, 3, 6))
  // Floor, not round, when the budget is the binding constraint: rounding the
  // per-tilt share UP can push the combined tilts past half the sleeve and
  // leave the core the smaller position — the exact inversion this cap exists
  // to prevent.
  const rawTiltEach = tilts.length > 0
    ? Math.min(idealEach, Math.floor((tiltBudget / tilts.length) * 10) / 10)
    : 0
  // Below the sliver threshold the tilts are dropped, so their budget returns
  // to the core rather than vanishing into the rounding normalizer.
  const tiltEach = rawTiltEach >= MIN_SLEEVE_LEG_PCT ? rawTiltEach : 0
  const tiltTotal = round1(tiltEach * tilts.length)
  const usCorePct = round1(equityPct - intlPct - tiltTotal)
  if (tilts.length > 0 && tiltEach === 0) {
    // Below the sliver threshold the honest answer is no tilt at all.
    notes.push({
      level: 'warn',
      message: `A ${round1(equityPct)}% equity sleeve is too small to carry ${tilts.length} sector tilt${tilts.length > 1 ? 's' : ''} worth holding — the plan stays in the diversified core instead. Raising risk tolerance or the time horizon would make room.`,
    })
  } else if (tilts.length > 0) {
    notes.push({ level: 'info', message: `Sector tilts are capped at ${tiltEach}% each so a theme can't dominate a diversified core.` })
  }
  if (wanted.length > 3) {
    notes.push({ level: 'warn', message: 'More than three sector tilts dilutes the point of tilting — only the first three were applied.' })
  }
  for (const s of conflicted) {
    notes.push({ level: 'warn', message: `${SECTOR_INFO[s].label} was both focused and excluded — the exclusion wins, so no tilt was added.` })
  }
  if (excluded.size > 0) {
    // Be straight about the limit: no tilt is added, but a total-market core
    // still owns these companies. A real screen needs a screened fund, and the
    // catalog carries none — promising exclusion we can't deliver would be a lie.
    const names = inputs.sectorExclude.map((s) => SECTOR_INFO[s].label).join(', ')
    notes.push({ level: 'warn', message: `No tilt was added for ${names}, but the broad US and international core funds still hold those companies at index weight. Excluding a sector outright requires a screened fund, which this catalog does not carry.` })
  }

  // 6. Map to instruments. Symbols can repeat across sleeves (SHY serves both
  //    the cash floor and the near ladder rung), so rows merge by symbol while
  //    class contributions stay separate — otherwise the mix would misreport.
  const holdings: BuiltHolding[] = []
  const contributions: Array<{ assetClass: BuilderAssetClass; pct: number }> = []
  const add = (symbol: string, assetClass: BuilderAssetClass, weightPct: number, rationale: string) => {
    const pct = round1(weightPct)
    if (pct <= 0) return
    contributions.push({ assetClass, pct })
    const existing = holdings.find((h) => h.symbol === symbol)
    if (existing) {
      existing.weightPct = round1(existing.weightPct + pct)
      existing.amountUsd = Math.round(inputs.amount * existing.weightPct / 100)
      existing.rationale += ` Also serving as ${ASSET_CLASS_INFO[assetClass].label.toLowerCase()}.`
      return
    }
    holdings.push({ ...fund(symbol), assetClass, weightPct: pct, amountUsd: Math.round(inputs.amount * pct / 100), rationale })
  }

  add('VTI', 'us-equity', usCorePct, 'Total US market at 3bps — the diversified growth core.')
  add('VXUS', 'intl-equity', intlPct, 'All non-US markets — geographic diversification the US core cannot provide.')
  // Skipped entirely when the budget can't fund a real position — the note
  // above says so rather than emitting unbuyable slivers.
  if (tiltEach > 0) {
    for (const s of tilts) add(SECTOR_ETF[s]!, 'sector-tilt', tiltEach, `${SECTOR_INFO[s].label} tilt you selected — capped to stay diversified.`)
  }
  for (const rung of consolidateLadder(applyBondStyle(bondLadder(horizon), bondStyle), bondsPct)) {
    add(rung.symbol, 'bonds', bondsPct * rung.share, rung.rationale)
  }
  add('TIP', 'inflation', inflationPct, 'Inflation-protected Treasuries — guards purchasing power over the horizon.')
  add('SHY', 'cash', cashPct, 'Short-term Treasuries — near-cash for money needed soon.')
  // Each optional sleeve maps through its chosen style, then through the same
  // sliver guard the bond ladder uses — so a small sleeve collapses to its
  // largest leg rather than emitting two unbuyable positions.
  const addSleeve = (
    pct: number, assetClass: BuilderAssetClass, mix: SleeveHolding[], styleLabel: string,
  ) => {
    if (pct <= 0) return
    const legs = consolidateLadder(mix, pct, MIN_SLEEVE_LEG_PCT)
    // Never drop a leg of the user's chosen style in silence. If the sleeve is
    // too small to carry every position, say so and say what to do about it —
    // otherwise picking "Bitcoin + Ethereum" and receiving only Bitcoin looks
    // like the tool ignored the choice.
    if (legs.length < mix.length) {
      notes.push({
        level: 'info',
        message: `A ${round1(pct)}% ${ASSET_CLASS_INFO[assetClass].label.toLowerCase()} sleeve is too small to split "${styleLabel}" into positions worth holding separately, so it is held as ${legs.map((l) => l.symbol).join(' + ')} alone. Raising the sleeve size would split it.`,
      })
    }
    for (const leg of legs) add(leg.symbol, assetClass, pct * leg.share, leg.rationale)
  }

  addSleeve(cryptoPct, 'crypto', CRYPTO_STYLES[cryptoStyle].mix, CRYPTO_STYLES[cryptoStyle].label)
  addSleeve(commodityPct, 'commodity', COMMODITY_STYLES[commodityStyle].mix, COMMODITY_STYLES[commodityStyle].label)
  addSleeve(currencyPct, 'currency', CURRENCY_STYLES[currencyStyle].mix, CURRENCY_STYLES[currencyStyle].label)

  // Normalize rounding drift into the largest holding
  const total = holdings.reduce((s, h) => s + h.weightPct, 0)
  if (holdings.length > 0 && Math.abs(total - 100) > 0.01) {
    const largest = holdings.reduce((a, b) => (a.weightPct >= b.weightPct ? a : b))
    const correction = round1(100 - total)
    largest.weightPct = round1(largest.weightPct + correction)
    largest.amountUsd = Math.round(inputs.amount * largest.weightPct / 100)
    const biggestContribution = contributions
      .filter((c) => c.assetClass === largest.assetClass)
      .sort((a, b) => b.pct - a.pct)[0]
    if (biggestContribution) biggestContribution.pct = round1(biggestContribution.pct + correction)
  }

  // 7. Class mix summary
  const mixMap = new Map<BuilderAssetClass, number>()
  for (const c of contributions) mixMap.set(c.assetClass, round1((mixMap.get(c.assetClass) ?? 0) + c.pct))
  const classMix = Array.from(mixMap.entries()).map(([assetClass, pct]) => ({ assetClass, pct }))
    .sort((a, b) => b.pct - a.pct)

  // 8. Fees. Costs are the one return component that is knowable in advance,
  //    so they get stated in dollars rather than basis points.
  const priced = holdings.map((h) => ({ h, er: expenseRatio(h.symbol) })).filter((x) => x.er != null)
  const pricedWeight = priced.reduce((s, x) => s + x.h.weightPct, 0)
  const blendedExpenseRatioPct = pricedWeight > 0
    ? Math.round((priced.reduce((s, x) => s + x.h.weightPct * x.er!, 0) / pricedWeight) * 1000) / 1000
    : 0
  const feeYears = Math.max(1, Math.round(horizon))
  const drag = computeFeeDrag(inputs.amount, blendedExpenseRatioPct, feeYears)
  const fees: FeeSummary = {
    blendedExpenseRatioPct,
    annualFeeUsd: Math.round(inputs.amount * blendedExpenseRatioPct / 100),
    horizonFeeDragUsd: Math.max(0, drag[drag.length - 1]?.feesPaid ?? 0),
    coveragePct: round1(pricedWeight),
  }
  // No fee warning here on purpose: every instrument the builder can reach is a
  // cheap index fund, so the blend tops out around 0.13% and any threshold worth
  // warning about would be unreachable. Fee creep is a real risk in the portfolio
  // the user actually holds — it is checked there, in reviewPlan().

  // 8. Diversification score — Gini–Simpson diversity (1 − Σwᵢ²) over the
  //    class mix, worth 90 points, plus up to 10 for international equity
  //    reaching a fifth of the plan. The old count-based formula pinned every
  //    reasonable multi-class plan at exactly 100 — it stopped discriminating
  //    exactly where the well-diversified plans live. This one uses the full
  //    weight distribution: adding a class always helps, balancing weights
  //    always helps, and 100 needs a perfectly even split across every class
  //    the builder has plus a real international sleeve — unreachable by an
  //    actual plan, so the top of the scale keeps its meaning.
  const hhi = classMix.reduce((s, c) => s + (c.pct / 100) ** 2, 0)
  const diversificationScore = Math.round(clamp(
    90 * (1 - hhi) + 10 * Math.min(intlPct / 20, 1), 0, 100))

  if (inputs.riskTolerance >= 8 && horizon < 5) {
    notes.push({ level: 'warn', message: 'High risk tolerance with a short horizon — the horizon wins. Appetite for risk does not extend a spend date.' })
  }

  return {
    inputs,
    horizonYears: horizon,
    classMix,
    holdings,
    fees,
    driftBandPct: 5,
    reviewIntervalDays: 90,
    diversificationScore,
    notes,
  }
}

// ─── Drift / rebalance check ──────────────────────────────────────────────────

export interface DriftItem {
  symbol: string
  name: string
  targetPct: number
  currentPct: number
  driftPts: number
  action: 'buy' | 'sell' | 'hold'
  /** Dollars to trade to return to target. Positive = buy, negative = sell. */
  tradeUsd: number
}

export interface DriftReport {
  items: DriftItem[]
  rebalanceDue: boolean
  /** Positions held that the plan doesn't call for at all. */
  unplanned: Array<{ symbol: string; currentPct: number }>
  /** Largest absolute drift in the portfolio, in points. */
  maxDriftPts: number
  /** Total value that has to change hands to fully rebalance. */
  turnoverUsd: number
}

/**
 * Compare a plan's targets against actual weights.
 *
 * `portfolioValueUsd` defaults to the amount the plan was built with, but the
 * caller should pass the live value — trades sized off a stale principal are
 * worse than no trade sizes at all.
 */
export function checkDrift(
  plan: BuiltPortfolio,
  currentWeights: Record<string, number>,
  portfolioValueUsd?: number,
): DriftReport {
  const value = portfolioValueUsd ?? plan.inputs.amount
  const items: DriftItem[] = plan.holdings.map((h) => {
    const currentPct = round1(currentWeights[h.symbol] ?? 0)
    const driftPts = round1(currentPct - h.weightPct)
    return {
      symbol: h.symbol,
      name: h.name,
      targetPct: h.weightPct,
      currentPct,
      driftPts,
      // A drift exactly on the band is within tolerance; only a breach trades.
      action: (Math.abs(driftPts) <= plan.driftBandPct ? 'hold' : driftPts > 0 ? 'sell' : 'buy') as DriftItem['action'],
      tradeUsd: Math.round(value * -driftPts / 100),
    }
  })

  const planned = new Set(plan.holdings.map((h) => h.symbol))
  const unplanned = Object.entries(currentWeights)
    .filter(([symbol, pct]) => !planned.has(symbol) && pct > 0)
    .map(([symbol, pct]) => ({ symbol, currentPct: round1(pct) }))
    .sort((a, b) => b.currentPct - a.currentPct)

  return {
    items,
    rebalanceDue: items.some((i) => i.action !== 'hold'),
    unplanned,
    maxDriftPts: items.reduce((m, i) => Math.max(m, Math.abs(i.driftPts)), 0),
    turnoverUsd: items.filter((i) => i.action !== 'hold').reduce((s, i) => s + Math.abs(i.tradeUsd), 0),
  }
}

// ─── Saved plans (localStorage until DB persistence lands) ───────────────────

export interface SavedPlan {
  id: string
  name: string
  createdAt: string
  lastReviewedAt: string
  /** Portfolio the monitor compares against; persisted server-side. */
  linkedPortfolioId?: string | null
  plan: BuiltPortfolio
}

/**
 * Legacy localStorage key. Plans now persist to Postgres via
 * /api/user/builder-plans; this key exists only so the page can import
 * plans saved before persistence landed (then renames it to *:imported).
 */
export const BUILDER_STORAGE_KEY = 'fnf:builder-plans:v1'

export function reviewDue(saved: SavedPlan, now = Date.now()): boolean {
  const last = new Date(saved.lastReviewedAt).getTime()
  return now - last > saved.plan.reviewIntervalDays * 86_400_000
}

// ─── Bridging a real portfolio into plan-space ───────────────────────────────

export interface ActualWeights {
  weights: Record<string, number>
  valueUsd: number
  /** Share of the portfolio (by target allocation) genuinely marked to market. */
  pricedPct: number
  /** Excluded for want of a live price. */
  unpricedPct: number
  /** Excluded for want of a cost basis — priced, but not markable. */
  noCostBasisPct: number
}

/**
 * Turn a saved portfolio plus live prices into the symbol→weight shape the
 * drift and review checks expect.
 *
 * A position is included only if it can be **marked to market**, which needs
 * both a live price and a cost basis. Anything else is left out entirely rather
 * than valued at cost — a portfolio half-valued at cost produces confident,
 * wrong drift.
 *
 * The cost-basis half of that rule is the one that was missing (W4-C1).
 * `computeHoldings` pins a priced-but-basis-less holding's `currentValue` to its
 * `targetValue`, which is right for the Portfolios page (show the position, show
 * no P&L) and catastrophic here: reading it back as an "actual" weight restates
 * the portfolio's own target allocation. With no entry prices anywhere, every
 * actual weight equalled its target, so drift was 0 on every line, every action
 * was `hold`, and `pricedPct` was 100 — which is also what the UI's coverage
 * disclosure keys on, so the monitor reported a clean bill of health having
 * measured nothing at all.
 *
 * The two exclusion reasons are reported separately because they need different
 * things from the user: a missing price is the app's problem, a missing cost
 * basis is a field they can fill in.
 */
export function actualWeightsFromPortfolio(
  portfolio: Portfolio,
  prices: Record<string, number>,
): ActualWeights {
  const computed = computeHoldings(portfolio, prices)

  const markable = computed.filter(
    (h) => h.currentPrice != null && h.entryPrice != null && h.entryPrice > 0 && h.currentValue != null,
  )
  const unpriced = computed.filter((h) => h.currentPrice == null)
  const noBasis = computed.filter(
    (h) => h.currentPrice != null && (h.entryPrice == null || h.entryPrice <= 0),
  )

  const valueUsd = sum(markable.map((h) => h.currentValue!))
  const weights: Record<string, number> = {}
  if (valueUsd > 0) {
    for (const h of markable) {
      const symbol = h.symbol.toUpperCase()
      weights[symbol] = round1((weights[symbol] ?? 0) + (h.currentValue! / valueUsd) * 100)
    }
  }

  return {
    weights,
    valueUsd: Math.round(valueUsd),
    pricedPct: round1(sum(markable.map((h) => h.targetAlloc))),
    unpricedPct: round1(sum(unpriced.map((h) => h.targetAlloc))),
    noCostBasisPct: round1(sum(noBasis.map((h) => h.targetAlloc))),
  }
}

// ─── Ongoing suitability monitoring ───────────────────────────────────────────

// A plan doesn't fail all at once. It rots in four specific ways, and each one
// is checkable: the horizon shortens while the allocation stands still, the
// market pushes the mix riskier than intended, costs creep in through holdings
// the plan never chose, and one winner grows into a single point of failure.

export type ReviewFindingId =
  | 'glide-path' | 'risk-drift' | 'fee-creep' | 'concentration' | 'off-plan' | 'stale-review'

export interface ReviewFinding {
  id: ReviewFindingId
  level: 'info' | 'warn'
  title: string
  message: string
}

/** Weights of what the user actually holds, plus the portfolio's live value. */
export interface ActualPosition {
  weights: Record<string, number>
  valueUsd?: number
}

// What counts as "growth" for risk-drift purposes: anything that can lose a
// third of its value in a bad year. Commodities belong here despite being
// diversifiers — gold has had 30% drawdowns. Foreign currency does not: it
// moves like cash, so it sits on the defensive side.
const GROWTH_CLASSES: BuilderAssetClass[] = ['us-equity', 'intl-equity', 'sector-tilt', 'crypto', 'commodity']
const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0)

function growthSharePct(plan: BuiltPortfolio): number {
  return round1(sum(plan.classMix.filter((c) => GROWTH_CLASSES.includes(c.assetClass)).map((c) => c.pct)))
}

/** Weight-averaged expense ratio over whatever weights we can price. */
export function blendedErOf(weights: Record<string, number>): { pct: number; coveragePct: number } {
  const priced = Object.entries(weights)
    .map(([symbol, w]) => ({ w, er: expenseRatio(symbol) }))
    .filter((x): x is { w: number; er: number } => x.er != null && x.w > 0)
  const covered = sum(priced.map((x) => x.w))
  if (covered <= 0) return { pct: 0, coveragePct: 0 }
  return {
    pct: Math.round((sum(priced.map((x) => x.w * x.er)) / covered) * 1000) / 1000,
    coveragePct: round1(covered),
  }
}

/**
 * Check whether a saved plan still fits — and, when actual holdings are
 * supplied, whether the portfolio still resembles the plan.
 *
 * Findings that need real holdings are simply skipped without them, rather
 * than guessed at.
 */
export function reviewPlan(saved: SavedPlan, actual?: ActualPosition, now = Date.now()): ReviewFinding[] {
  const findings: ReviewFinding[] = []
  const plan = saved.plan

  // 1. Aging glide path — the horizon shrinks whether or not anyone rebuilds.
  const elapsedYears = (now - new Date(saved.createdAt).getTime()) / (365.25 * 86_400_000)
  if (elapsedYears >= 1) {
    const aged = buildPortfolio({
      ...plan.inputs,
      yearsToFirstUse: Math.max(0, plan.inputs.yearsToFirstUse - elapsedYears),
      yearsToRetirement: Math.max(0, plan.inputs.yearsToRetirement - elapsedYears),
    })
    const then = growthSharePct(plan)
    const nowPct = growthSharePct(aged)
    if (Math.abs(then - nowPct) >= 5) {
      findings.push({
        id: 'glide-path', level: 'warn', title: 'Glide path has aged',
        message: `Built ${Math.floor(elapsedYears)} year${Math.floor(elapsedYears) === 1 ? '' : 's'} ago for a ${plan.inputs.yearsToFirstUse}-year horizon, now ${Math.max(0, Math.round(plan.inputs.yearsToFirstUse - elapsedYears))} years out. Rebuilding today would hold ${nowPct}% in growth assets rather than ${then}%.`,
      })
    }
  }

  if (actual && Object.keys(actual.weights).length > 0) {
    const { weights } = actual

    // 2. Risk drift — has the market made the portfolio bolder than the plan?
    const planGrowth = growthSharePct(plan)
    const growthSymbols = new Set(plan.holdings.filter((h) => GROWTH_CLASSES.includes(h.assetClass)).map((h) => h.symbol))
    const actualGrowth = round1(sum(Object.entries(weights).filter(([s]) => growthSymbols.has(s)).map(([, w]) => w)))
    const growthGap = round1(actualGrowth - planGrowth)
    if (Math.abs(growthGap) >= 5) {
      findings.push({
        id: 'risk-drift',
        level: growthGap > 0 ? 'warn' : 'info',
        title: growthGap > 0 ? 'Riskier than planned' : 'More defensive than planned',
        message: `Growth assets are ${actualGrowth}% of the portfolio against a ${planGrowth}% target — ${Math.abs(growthGap)} points ${growthGap > 0 ? 'above' : 'below'} plan. ${growthGap > 0 ? 'A drawdown would hit harder than the plan assumed.' : 'Returns will likely trail the plan.'}`,
      })
    }

    // 3. Fee creep — measured here, not at build time, because the builder can
    //    only reach cheap index funds while a real portfolio can hold anything.
    const actualEr = blendedErOf(weights)
    if (actualEr.coveragePct >= 50) {
      const gap = Math.round((actualEr.pct - plan.fees.blendedExpenseRatioPct) * 1000) / 1000
      if (gap >= 0.1) {
        const value = actual.valueUsd ?? plan.inputs.amount
        findings.push({
          id: 'fee-creep', level: 'warn', title: 'Fees above plan',
          message: `Holdings cost ${actualEr.pct.toFixed(2)}% a year against the plan's ${plan.fees.blendedExpenseRatioPct.toFixed(2)}% — about $${Math.round(value * gap / 100).toLocaleString()} extra per year at today's value.`,
        })
      }
    }

    // 4. Concentration — but only what the plan didn't ask for. A 55% total-market
    //    fund is 3,500 companies held on purpose; flagging it would teach the user
    //    to ignore this check. The signal is a big position well above its target.
    const largest = Object.entries(weights).sort((a, b) => b[1] - a[1])[0]
    if (largest) {
      const [symbol, actualPct] = largest
      const targetPct = plan.holdings.find((h) => h.symbol === symbol)?.weightPct ?? 0
      if (actualPct >= 50 && actualPct - targetPct >= 10) {
        findings.push({
          id: 'concentration', level: 'warn', title: 'Concentrated position',
          message: `${symbol} is ${round1(actualPct)}% of the portfolio against a ${targetPct}% target. Whatever happens to that one holding decides the outcome.`,
        })
      }
    }

    // 5. Off-plan holdings — the plan stops describing the portfolio.
    const planned = new Set(plan.holdings.map((h) => h.symbol))
    const offPlan = Object.entries(weights).filter(([s, w]) => !planned.has(s) && w > 0)
    const offPlanPct = round1(sum(offPlan.map(([, w]) => w)))
    if (offPlanPct >= 10) {
      findings.push({
        id: 'off-plan', level: 'warn', title: 'Holdings outside the plan',
        message: `${offPlanPct}% sits in ${offPlan.length} position${offPlan.length === 1 ? '' : 's'} the plan never called for (${offPlan.map(([s]) => s).slice(0, 4).join(', ')}${offPlan.length > 4 ? '…' : ''}).`,
      })
    }
  }

  // 6. Review cadence.
  if (reviewDue(saved, now)) {
    const days = Math.floor((now - new Date(saved.lastReviewedAt).getTime()) / 86_400_000)
    findings.push({
      id: 'stale-review', level: 'info', title: 'Review overdue',
      message: `Last reviewed ${days} days ago; this plan asks for a check every ${plan.reviewIntervalDays}.`,
    })
  }

  return findings
}
