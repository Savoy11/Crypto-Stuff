#!/usr/bin/env node
// Reports whether Postgres is reachable, and what it contains.
//
// Postgres runs as a native Windows service here (no Docker), so it normally
// starts with the machine. This is the "is it actually up?" check when
// something looks wrong.

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postgres from 'postgres'

// Read .env.local directly so this works without --env-file.
try {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
  for (const line of raw.split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i.exec(line)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
} catch {}

console.log('— Windows service —')
try {
  const out = execSync(
    'powershell -NoProfile -Command "Get-Service -Name postgresql* | Select-Object -ExpandProperty Status"',
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
  ).trim()
  console.log(out ? `  ${out}` : '  no postgresql service found')
} catch {
  console.log('  could not query services')
}

const url = process.env.DATABASE_URL
if (!url) {
  console.log('\nDATABASE_URL is not set.')
  process.exit(1)
}

console.log('\n— Connection —')
const sql = postgres(url, { max: 1, connect_timeout: 5 })
try {
  const [{ version }] = await sql`SELECT version()`
  console.log(`  ${version.split(',')[0]}`)
  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' ORDER BY table_name
  `
  console.log(`\n— Tables (${tables.length}) —`)
  console.log(tables.length ? tables.map((t) => `  ${t.table_name}`).join('\n') : '  none — run `npm run db:migrate`')
} catch (err) {
  console.log(`  ✖ ${err.message}`)
  process.exitCode = 1
} finally {
  await sql.end()
}
