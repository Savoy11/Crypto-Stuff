// Pure helpers for the Macro Markets news route (`/live-data/macro-news`).
//
// These live here, not in the route file, for one hard reason: a Next.js
// App Router `route.ts` may only export recognised route fields (`GET`,
// `dynamic`, …). Exporting a plain function from it makes `next build` fail
// type validation ("… is not a valid Route export field") — even though a
// bare `tsc --noEmit` accepts it, because the route-export rule is enforced
// only by Next's generated route types. Both functions are also unit-tested,
// so they need a stable, importable home outside the route.

export type MacroPillar = 'commodities' | 'currencies' | 'bonds'

// ─── pubDate parsing ─────────────────────────────────────────────────────────

/** `2026-07-22 13:16:28` or `2026-07-22T13:16:28` with no trailing zone. */
const TZLESS_DATETIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/

/**
 * Parse an RSS pubDate to an epoch, defaulting a missing timezone to UTC.
 *
 * Investing.com (3 of the 8 feeds) emits `<pubDate>2026-07-22 13:16:28</pubDate>`
 * with no zone, and `new Date()` reads a zone-less string as LOCAL time. On a
 * UTC−4 host that stamps every article 4 hours in the FUTURE — so the previous
 * clamp-to-now pinned the whole block to the fetch instant, which made every
 * one of them render as "just now", flagged them all Breaking (`now - published
 * < 1h` is trivially true after clamping), and floated them above genuinely
 * newer stories from the other feeds. It also meant the same feed produced
 * different timestamps depending on the server's timezone.
 *
 * Treating a zone-less stamp as UTC fixes the offset at the source. The clamp
 * stays as a backstop for feeds that really are ahead, but it should now be
 * rare rather than routine.
 */
export function parsePubDate(raw: string, now: number): number {
  const s = raw.trim()
  if (!s) return now
  const normalized = TZLESS_DATETIME.test(s) ? `${s.replace(' ', 'T')}Z` : s
  const t = new Date(normalized).getTime()
  if (!Number.isFinite(t)) return now
  return Math.min(t, now)
}

// ─── Pillar classification ───────────────────────────────────────────────────
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
