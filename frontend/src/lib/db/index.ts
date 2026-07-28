import 'server-only'

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

// ─── Database client ─────────────────────────────────────────────────────────
// Server-only. The `server-only` import above turns any accidental client
// import into a build error rather than a runtime leak of DATABASE_URL.
//
// Connection reuse: Next.js dev recreates modules on every hot reload, which
// would open a new pool each time and exhaust Postgres' connection limit within
// a few edits. Stashing the client on globalThis survives HMR. In production
// the module is evaluated once and the global is just an unused indirection.

declare global {
  // eslint-disable-next-line no-var
  var __fnDbClient: ReturnType<typeof postgres> | undefined
}

export const DATABASE_URL = process.env.DATABASE_URL ?? ''

/** True when the app has been pointed at a database. */
export const isDbConfigured = DATABASE_URL.length > 0

function createClient() {
  if (!isDbConfigured) {
    throw new Error(
      'DATABASE_URL is not set. Postgres runs as a native Windows service — ' +
        'check it is running with `npm run db:status`, then set DATABASE_URL in ' +
        'frontend/.env.local.'
    )
  }
  return postgres(DATABASE_URL, {
    // Modest ceiling: this is a single-instance app, and serverless deploys
    // want a low per-instance cap anyway.
    max: 10,
    idle_timeout: 20,
    // Drizzle handles its own type parsing; postgres-js returning numerics as
    // strings is what preserves money precision (see schema/invest.ts).
  })
}

// Lazy initialization: the client is created on first query, not at import.
// `next build`'s page-data collection imports every route module — including
// ones that import this file — in an environment that may have no
// DATABASE_URL (CI). Creating the client eagerly made the BUILD throw; lazily,
// the throw only happens if an unconfigured deployment actually runs a query,
// and every route already guards with `isDbConfigured` before doing that.

type Db = ReturnType<typeof drizzle<typeof schema>>

let _db: Db | undefined

function getDb(): Db {
  if (!_db) {
    const client = globalThis.__fnDbClient ?? createClient()
    if (process.env.NODE_ENV !== 'production') globalThis.__fnDbClient = client
    _db = drizzle(client, { schema })
  }
  return _db
}

export const db: Db = new Proxy({} as Db, {
  get(_target, prop, _receiver) {
    const value = Reflect.get(getDb() as object, prop)
    return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(getDb()) : value
  },
})

export { schema }
export * from './schema'
