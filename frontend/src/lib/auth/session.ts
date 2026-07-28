import 'server-only'

import { eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { auth } from './config'

// ─── Resolving the owning user for a request ─────────────────────────────────
//
// The dashboard's auth wall is currently OFF by the owner's explicit request
// (src/app/(dashboard)/layout.tsx). That leaves DB-backed features with a
// problem: every user-owned table requires a user_id, but nobody has logged in.
//
// Rather than re-enable a login wall the owner deliberately disabled, the app
// runs in "local single-user mode" when there is no session: all data is owned
// by one well-known local user, created on first use. Behaviour:
//
//   session present  → that user's id (the real multi-tenant path)
//   no session       → the local user's id, if local mode is allowed
//   no session, and
//   local mode off   → null, and callers must return 401
//
// Local mode is allowed in development, and in production only when
// FN_ALLOW_LOCAL_USER=true is set explicitly (legacy CAEP_ALLOW_LOCAL_USER is
// still honored). That default matters: without it, deploying this app to a
// public host would silently hand every anonymous visitor the same shared
// account and everyone's portfolio and budget with it.
//
// When the auth wall is switched back on, nothing here needs to change — real
// sessions simply start winning, and setting FN_ALLOW_LOCAL_USER=false turns
// the fallback off entirely.

// Deliberately NOT renamed in the Finance Now rebrand: this sentinel keys the
// local user's DB row, and every portfolio/watchlist/builder-plan hangs off
// that row. Changing the string would find-or-create a fresh user and orphan
// all existing data. It is never shown in the UI.
const LOCAL_USER_EMAIL = 'local@caep.local'

function localUserFlag(): string | undefined {
  return process.env.FN_ALLOW_LOCAL_USER ?? process.env.CAEP_ALLOW_LOCAL_USER
}

export function isLocalUserModeAllowed(): boolean {
  if (localUserFlag() === 'true') return true
  if (localUserFlag() === 'false') return false
  return process.env.NODE_ENV !== 'production'
}

/**
 * Find or create the shared local-mode user. Concurrent first requests race
 * here, so the insert tolerates the conflict rather than assuming it wins.
 */
async function getOrCreateLocalUser(): Promise<string> {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(sql`lower(${users.email})`, LOCAL_USER_EMAIL))
    .limit(1)
  if (existing) return existing.id

  const [created] = await db
    .insert(users)
    .values({ email: LOCAL_USER_EMAIL, name: 'Local User' })
    // passwordHash stays null — this account cannot be logged into, it only
    // exists to own rows while the auth wall is down.
    .onConflictDoNothing()
    .returning({ id: users.id })
  if (created) return created.id

  // Lost the race: another request inserted it between our select and insert.
  const [raced] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(sql`lower(${users.email})`, LOCAL_USER_EMAIL))
    .limit(1)
  if (!raced) throw new Error('Could not resolve the local user')
  return raced.id
}

/**
 * The user id that owns data for this request, or null when the caller must be
 * treated as unauthenticated.
 */
export async function getCurrentUserId(): Promise<string | null> {
  const session = await auth()
  const sessionUserId = session?.user?.id
  if (typeof sessionUserId === 'string' && sessionUserId) return sessionUserId

  if (!isLocalUserModeAllowed()) return null
  return getOrCreateLocalUser()
}

/**
 * Same as getCurrentUserId but throws, for routes that have no meaningful
 * anonymous behaviour. Callers should map UnauthorizedError to a 401.
 */
export class UnauthorizedError extends Error {
  constructor() {
    super('Not authenticated')
    this.name = 'UnauthorizedError'
  }
}

export async function requireUserId(): Promise<string> {
  const id = await getCurrentUserId()
  if (!id) throw new UnauthorizedError()
  return id
}
