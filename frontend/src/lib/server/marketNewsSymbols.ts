import 'server-only'

// Symbol matching for the market-news route. Company names match
// case-insensitively; tickers require $SYM or an exact uppercase word.

import { EQUITY_CATALOG } from '@/lib/data/equityCatalog'
import { FUND_CATALOG } from '@/lib/data/fundCatalog'


// Symbols that are common English words false-positive as bare uppercase
// matches — require an explicit $cashtag for these.
const CASHTAG_ONLY = new Set(['NOW', 'LOW', 'CAT', 'COST', 'ALL', 'SO', 'ON'])

export interface SymbolMatcher { symbol: string; name: RegExp | null; ticker: RegExp }

function buildMatcher(symbol: string, name?: string): SymbolMatcher {
  return {
    symbol,
    name: name ? new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i') : null,
    ticker: symbol.length >= 3 && !CASHTAG_ONLY.has(symbol)
      ? new RegExp(`(\\$${symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b|\\b${symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b(?=[^a-z]|$))`)
      : new RegExp(`\\$${symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`),
  }
}

const NAME_MATCHERS: SymbolMatcher[] = EQUITY_CATALOG.map((e) => buildMatcher(e.symbol, e.name))

/**
 * A matcher for the one symbol this request asked about, when the equity
 * catalog doesn't already carry it. Two tiers of evidence:
 *   · A fund from the catalog matches on its full name too ("Vanguard S&P 500
 *     ETF") — same rules as a catalog stock.
 *   · A symbol from neither catalog matches on $CASHTAG / bare-uppercase-word
 *     only, because we have no name to look for. That is detection, not
 *     force-tagging: an article that never prints the ticker still won't match.
 * Symbol-shape guard so arbitrary query text can't become a regex.
 */
export function requestedMatcher(symbol: string, name?: string | null): SymbolMatcher | null {
  if (NAME_MATCHERS.some((m) => m.symbol === symbol)) return null
  if (!/^[A-Z0-9.\-]{1,6}$/.test(symbol)) return null
  const fund = FUND_CATALOG.find((f) => f.symbol === symbol)
  // Name preference: the catalog's vetted name, else a caller-supplied one
  // (the news page passes the official listing-directory name for a fund or
  // stock outside the catalogs — without it, a mutual fund whose ticker never
  // appears in headlines could only ever match on that ticker). The name is
  // used as an escaped literal, and length-capped so a crafted query cannot
  // turn the matcher into a pathological regex.
  const callerName = name?.trim() && name.trim().length <= 80 ? name.trim() : undefined
  return buildMatcher(symbol, fund?.name ?? callerName)
}

export function detectSymbols(text: string, extra?: SymbolMatcher | null): string[] {
  const found: string[] = []
  for (const m of extra ? [extra, ...NAME_MATCHERS] : NAME_MATCHERS) {
    if (m.name?.test(text) || m.ticker.test(text)) found.push(m.symbol)
    if (found.length >= 6) break
  }
  return found
}

