// Macro news pillar classification. Lives in lib/server (not the macro-news
// route file) because Next.js route files may only export HTTP handlers and
// route config — a helper export there fails `next build`'s route validation.

export type MacroPillar = 'commodities' | 'currencies' | 'bonds'

// A named currency is the strongest signal there is — an FX story about a
// central bank ("Turkish Lira: rising inflation expectations") is a currency
// story, not a bonds one, so explicit currency names are checked FIRST.
// Bare "dollar"/"greenback" stays weak (it appears in everything) and is only
// consulted after commodities and bonds have had their chance.

// Unambiguous currency names — none of these mean anything else in a macro
// headline, so they beat every other signal.
const STRONG_CURRENCY = /\b(euro|yen|sterling|franc|yuan|renminbi|peso|rupee|rand|lira|forint|zloty|krona|koruna|loonie|aussie|kiwi|(canadian|australian|new zealand|hong kong|singapore) dollar|forex|fx\b|currency pair[s]?|dollar index|dxy|carry trade|devalu\w+)\b/i

// Currency signals that are ALSO something else in a commodities story:
//   "pound"  — the weight ("coffee climbs to 320 cents a pound")
//   "xxx/yyy" — any slashed pair ("oil/gas rig count falls")
// Checked AFTER commodities so the commodity reading wins when a commodity
// noun is present, and still catches "the pound slipped after the BoE" or
// "EUR/USD holds gains" when one isn't.
const AMBIGUOUS_CURRENCY = /\b(pound|[a-z]{3}\/[a-z]{3})\b/i
const COMMODITY_TERMS = /\b(gold|silver|platinum|palladium|copper|crude|oil|opec|brent|wti|natural gas|lng|gasoline|diesel|heating oil|wheat|corn|soybean[s]?|coffee|sugar|cocoa|cotton|cattle|hogs?|commodit(y|ies)|metals?|mining|barrel[s]?|bushel|drilling|refin(ery|ing)|shale)\b/i
const BONDS_TERMS = /\b(treasur(y|ies)|yield[s]?|bond[s]?|fed|federal reserve|fomc|rate (cut|hike|decision)[s]?|interest rate[s]?|duration|2s10s|curve (steepen|flatten|invert)\w*|coupon|t-bill[s]?|gilt[s]?|bund[s]?|jgb[s]?|inflation|cpi|ppi)\b/i
const WEAK_CURRENCY = /\b(dollar|greenback|currenc(y|ies)|exchange rate[s]?|ecb|boj|bank of (england|japan)|pboc|snb)\b/i

export function classifyPillar(text: string, fallback: MacroPillar | null): MacroPillar | null {
  if (STRONG_CURRENCY.test(text)) return 'currencies'
  if (COMMODITY_TERMS.test(text)) return 'commodities'
  if (AMBIGUOUS_CURRENCY.test(text)) return 'currencies'
  if (BONDS_TERMS.test(text)) return 'bonds'
  if (WEAK_CURRENCY.test(text)) return 'currencies'
  return fallback
}
