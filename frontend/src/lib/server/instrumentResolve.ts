import 'server-only'

import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { instrumentCrypto, instruments, type AssetClass, type PriceSource } from '@/lib/db/schema'
import { INSTRUMENT_BY_KEY, isSecurityKey, securitySymbol } from '@/lib/data/instruments'

// ─── Client key ⇄ instrument row resolution ──────────────────────────────────
//
// The UI identifies positions by a catalog key: a CoinGecko id ('bitcoin') or
// a security key ('sec:VTI'). The DB identifies them by instruments.id, with
// the class-specific external id living in the extension tables. This module
// is the only place that translation happens.
//
// Resolution upserts GLOBAL catalog rows (user_id IS NULL) — a user holding
// BTC references the same instrument row as every other user. The partial
// unique index instruments_global_unique makes the upsert race-safe.

export interface ResolvedInstrument {
  id: string
  key: string
}

function classify(key: string, symbol: string, name: string): {
  assetClass: AssetClass; priceSource: PriceSource; symbol: string; name: string; coingeckoId: string | null
} {
  const catalog = INSTRUMENT_BY_KEY[key]
  if (isSecurityKey(key)) {
    const cls = catalog?.class === 'etf' ? 'etf' : catalog?.class === 'mutual' ? 'mutual' : 'equity'
    return { assetClass: cls, priceSource: 'yahoo', symbol: securitySymbol(key).toUpperCase(), name: catalog?.name ?? name, coingeckoId: null }
  }
  // Everything else is a CoinGecko id. The symbol column stores the ticker
  // (BTC); the coingecko id ('bitcoin') goes to the extension table because
  // that's what the price routes query by.
  return {
    assetClass: 'crypto',
    priceSource: 'coingecko',
    symbol: (catalog?.symbol ?? symbol ?? key).toUpperCase(),
    name: catalog?.name ?? name,
    coingeckoId: key,
  }
}

/**
 * Resolve client keys to global instrument ids, creating catalog rows the
 * first time an instrument is ever held. Returns a key→id map.
 */
export async function resolveInstruments(
  entries: Array<{ key: string; symbol: string; name: string }>,
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  for (const entry of entries) {
    if (out.has(entry.key)) continue
    const meta = classify(entry.key, entry.symbol, entry.name)

    // Upsert the global row. onConflictDoNothing + reselect rather than
    // returning() because a concurrent request may win the insert.
    await db.insert(instruments)
      .values({
        symbol: meta.symbol,
        name: meta.name,
        assetClass: meta.assetClass,
        priceSource: meta.priceSource,
      })
      .onConflictDoNothing()
    const [row] = await db.select({ id: instruments.id }).from(instruments)
      .where(and(
        isNull(instruments.userId),
        eq(instruments.assetClass, meta.assetClass),
        eq(instruments.symbol, meta.symbol),
      ))
      .limit(1)
    if (!row) throw new Error(`Could not resolve instrument for ${entry.key}`)

    if (meta.coingeckoId) {
      await db.insert(instrumentCrypto)
        .values({ instrumentId: row.id, coingeckoId: meta.coingeckoId })
        .onConflictDoUpdate({
          target: instrumentCrypto.instrumentId,
          set: { coingeckoId: meta.coingeckoId },
        })
    }
    out.set(entry.key, row.id)
  }
  return out
}

/**
 * Reconstruct the client key for a holdings row. Inverse of classify():
 * crypto rows read the CoinGecko id back from the extension table; securities
 * are always 'sec:' + symbol.
 */
export function clientKeyFor(assetClass: AssetClass, symbol: string, coingeckoId: string | null): string {
  if (assetClass === 'crypto') return coingeckoId ?? symbol.toLowerCase()
  return `sec:${symbol}`
}
