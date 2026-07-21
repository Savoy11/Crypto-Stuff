import 'server-only'

import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { holdings, instrumentCrypto, instruments, portfolios } from '@/lib/db/schema'
import { clientKeyFor, resolveInstruments } from './instrumentResolve'
import type { Portfolio, PortfolioHolding } from '@/lib/data/portfolioUtils'

// ─── Portfolio persistence helpers ───────────────────────────────────────────
// Shared by /api/user/portfolios and /api/user/portfolios/[id]. Route files
// can only export HTTP methods, so the real logic lives here.

export const PORTFOLIO_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const MAX_BULK_PORTFOLIOS = 20
export const MAX_HOLDINGS = 60

/** Load a user's portfolios in the client's wire shape. */
export async function loadPortfolios(userId: string): Promise<Portfolio[]> {
  const pRows = await db.select().from(portfolios)
    .where(eq(portfolios.userId, userId))
    .orderBy(desc(portfolios.createdAt))
  if (pRows.length === 0) return []

  const hRows = await db.select({
    portfolioId: holdings.portfolioId,
    targetAllocPct: holdings.targetAllocPct,
    avgCostBasis: holdings.avgCostBasis,
    createdAt: holdings.createdAt,
    symbol: instruments.symbol,
    name: instruments.name,
    assetClass: instruments.assetClass,
    coingeckoId: instrumentCrypto.coingeckoId,
  }).from(holdings)
    .innerJoin(instruments, eq(holdings.instrumentId, instruments.id))
    .leftJoin(instrumentCrypto, eq(instrumentCrypto.instrumentId, instruments.id))
    .where(eq(holdings.userId, userId))

  const byPortfolio = new Map<string, PortfolioHolding[]>()
  for (const h of hRows) {
    const list = byPortfolio.get(h.portfolioId) ?? []
    list.push({
      cgId: clientKeyFor(h.assetClass, h.symbol, h.coingeckoId),
      symbol: h.symbol,
      name: h.name,
      // numeric comes back as a string (precision guarantee); the UI's wire
      // shape wants numbers. Percents and per-unit prices survive a float —
      // these are not summed money columns.
      targetAlloc: h.targetAllocPct != null ? parseFloat(h.targetAllocPct) : 0,
      entryPrice: h.avgCostBasis != null ? parseFloat(h.avgCostBasis) : null,
      addedAt: h.createdAt.toISOString(),
    })
    byPortfolio.set(h.portfolioId, list)
  }

  return pRows.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    startingCapital: p.startingCapital != null ? parseFloat(p.startingCapital) : 0,
    holdings: byPortfolio.get(p.id) ?? [],
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }))
}

// ─── Validation ──────────────────────────────────────────────────────────────

interface IncomingHolding {
  cgId?: unknown; symbol?: unknown; name?: unknown
  targetAlloc?: unknown; entryPrice?: unknown; addedAt?: unknown
}
export interface IncomingPortfolio {
  id?: unknown; name?: unknown; description?: unknown; startingCapital?: unknown
  holdings?: unknown; createdAt?: unknown; updatedAt?: unknown
}

export interface ValidatedPortfolio {
  id?: string
  name: string
  description: string
  startingCapital: string | null
  createdAt?: Date
  updatedAt?: Date
  holdings: Array<{ key: string; symbol: string; name: string; targetAlloc: number; entryPrice: number | null; addedAt?: Date }>
}

function parseDate(v: unknown): Date | undefined {
  if (typeof v !== 'string') return undefined
  const t = new Date(v)
  return Number.isFinite(t.getTime()) ? t : undefined
}

export function validatePortfolio(p: IncomingPortfolio): ValidatedPortfolio | { error: string } {
  const name = typeof p.name === 'string' ? p.name.trim().slice(0, 120) : ''
  if (!name) return { error: 'Every portfolio needs a name' }
  if (p.id !== undefined && (typeof p.id !== 'string' || !PORTFOLIO_UUID_RE.test(p.id))) {
    return { error: 'Portfolio id must be a UUID' }
  }
  const rawHoldings = Array.isArray(p.holdings) ? (p.holdings as IncomingHolding[]).slice(0, MAX_HOLDINGS) : []
  const parsed: ValidatedPortfolio['holdings'] = []
  for (const h of rawHoldings) {
    const key = typeof h.cgId === 'string' ? h.cgId.trim() : ''
    if (!key) return { error: `"${name}": every holding needs an instrument key` }
    const targetAlloc = typeof h.targetAlloc === 'number' && isFinite(h.targetAlloc)
      ? Math.max(0, Math.min(100, h.targetAlloc)) : 0
    const entryPrice = typeof h.entryPrice === 'number' && isFinite(h.entryPrice) && h.entryPrice > 0
      ? h.entryPrice : null
    parsed.push({
      key,
      symbol: typeof h.symbol === 'string' ? h.symbol.slice(0, 20) : key,
      name: typeof h.name === 'string' ? h.name.slice(0, 120) : key,
      targetAlloc,
      entryPrice,
      addedAt: parseDate(h.addedAt),
    })
  }
  const capital = typeof p.startingCapital === 'number' && isFinite(p.startingCapital) && p.startingCapital >= 0
    ? p.startingCapital : null
  return {
    id: typeof p.id === 'string' ? p.id : undefined,
    name,
    description: typeof p.description === 'string' ? p.description.slice(0, 500) : '',
    startingCapital: capital != null ? capital.toFixed(2) : null,
    createdAt: parseDate(p.createdAt),
    updatedAt: parseDate(p.updatedAt),
    holdings: parsed,
  }
}

// ─── Writes ──────────────────────────────────────────────────────────────────

async function insertHoldings(userId: string, portfolioId: string, list: ValidatedPortfolio['holdings']) {
  if (list.length === 0) return
  const keyToId = await resolveInstruments(list.map((h) => ({ key: h.key, symbol: h.symbol, name: h.name })))
  await db.insert(holdings).values(list.map((h) => ({
    userId,
    portfolioId,
    instrumentId: keyToId.get(h.key)!,
    targetAllocPct: h.targetAlloc.toFixed(4),
    avgCostBasis: h.entryPrice != null ? h.entryPrice.toFixed(8) : null,
    ...(h.addedAt ? { createdAt: h.addedAt } : {}),
  })))
}

export async function insertPortfolio(userId: string, v: ValidatedPortfolio): Promise<string> {
  const [row] = await db.insert(portfolios).values({
    ...(v.id ? { id: v.id } : {}),
    userId,
    name: v.name,
    description: v.description,
    startingCapital: v.startingCapital,
    ...(v.createdAt ? { createdAt: v.createdAt } : {}),
    ...(v.updatedAt ? { updatedAt: v.updatedAt } : {}),
  }).returning({ id: portfolios.id })
  await insertHoldings(userId, row.id, v.holdings)
  return row.id
}

/**
 * Full-document update: fields merge, holdings replace wholesale. The UI's
 * editor edits the entire holding set at once, so replace-all is the
 * semantics that cannot drift — no diffing, no orphans.
 */
export async function replacePortfolio(userId: string, portfolioId: string, v: ValidatedPortfolio): Promise<boolean> {
  // Ownership lives in the WHERE, not a check afterwards — the update must
  // never touch a row that turns out to belong to someone else.
  const [updated] = await db.update(portfolios)
    .set({
      name: v.name,
      description: v.description,
      startingCapital: v.startingCapital,
      updatedAt: new Date(),
    })
    .where(and(eq(portfolios.id, portfolioId), eq(portfolios.userId, userId)))
    .returning({ id: portfolios.id })
  if (!updated) return false

  await db.delete(holdings).where(and(eq(holdings.portfolioId, portfolioId), eq(holdings.userId, userId)))
  await insertHoldings(userId, portfolioId, v.holdings)
  return true
}
