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
  var __caepDbClient: ReturnType<typeof postgres> | undefined
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

const client = globalThis.__caepDbClient ?? createClient()
if (process.env.NODE_ENV !== 'production') globalThis.__caepDbClient = client

export const db = drizzle(client, { schema })

export { schema }
export * from './schema'
