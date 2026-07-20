#!/usr/bin/env node
// Creates the application database if it does not exist yet.
//
// `CREATE DATABASE` cannot run inside a transaction and cannot target the
// database you are connected to, so this connects to the always-present
// `postgres` maintenance database and creates the real one from there.
//
// Safe to re-run: it checks first and does nothing if the database exists.

import postgres from 'postgres'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set (expected in frontend/.env.local).')
  process.exit(1)
}

const parsed = new URL(url)
const dbName = parsed.pathname.replace(/^\//, '')
if (!dbName) {
  console.error(`DATABASE_URL has no database name: ${url}`)
  process.exit(1)
}

// Identifiers cannot be parameterised, so the name is whitelisted rather than
// interpolated blindly — this string ends up inside a CREATE DATABASE.
if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(dbName)) {
  console.error(`Refusing to create a database with an unsafe name: ${dbName}`)
  process.exit(1)
}

const adminUrl = new URL(url)
adminUrl.pathname = '/postgres'

const sql = postgres(adminUrl.toString(), { max: 1 })

try {
  const existing = await sql`SELECT 1 FROM pg_database WHERE datname = ${dbName}`
  if (existing.length > 0) {
    console.log(`• database "${dbName}" already exists`)
  } else {
    await sql.unsafe(`CREATE DATABASE "${dbName}"`)
    console.log(`✔ created database "${dbName}"`)
  }
} catch (err) {
  console.error('✖ could not create the database:', err.message)
  process.exitCode = 1
} finally {
  await sql.end()
}
