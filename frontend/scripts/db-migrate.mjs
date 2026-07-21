#!/usr/bin/env node
// Applies the checked-in migrations in drizzle/ to DATABASE_URL.
//
// Run via `npm run db:migrate`, which passes --env-file=.env.local.
// This exists instead of `drizzle-kit migrate` so that deploys can run
// migrations with plain `node` and no dev dependency on drizzle-kit.

import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

const url = process.env.DATABASE_URL
if (!url) {
  console.error(
    'DATABASE_URL is not set.\n' +
      'Start the database with `npm run db:up`, then make sure DATABASE_URL is in frontend/.env.local.'
  )
  process.exit(1)
}

// max: 1 — migrations must run on a single connection, in order.
const client = postgres(url, { max: 1 })

try {
  await migrate(drizzle(client), { migrationsFolder: './drizzle' })
  console.log('✔ migrations applied')
} catch (err) {
  console.error('✖ migration failed:', err.message)
  process.exitCode = 1
} finally {
  await client.end()
}
