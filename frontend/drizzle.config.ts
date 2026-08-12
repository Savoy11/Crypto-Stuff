import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Config } from 'drizzle-kit'

// drizzle-kit runs outside Next.js, so it never sees .env.local — Next loads
// that file itself at boot. Without this, every drizzle-kit command would
// silently fall back to the default URL below and could target the wrong
// database. Kept dependency-free rather than pulling in dotenv for one read.
function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(__dirname, '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i.exec(line)
      if (!match) continue
      const [, key, rawValue] = match
      if (process.env[key]) continue // real env wins over the file
      process.env[key] = rawValue.trim().replace(/^["']|["']$/g, '')
    }
  } catch {
    // No .env.local (CI, fresh clone) — fall through to the default URL.
  }
}
loadEnvLocal()

// Schema lives in src/lib/db/schema/* (one file per domain). drizzle-kit reads
// them all and diffs against the database named by DATABASE_URL.
//
// Migrations are checked in (drizzle/) so a fresh clone can `npm run db:migrate`
// without needing drizzle-kit to re-derive them.

export default {
  schema: './src/lib/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    // Renamed caep_app → fn_app in the 2026-08 pre-production identity sweep.
    // Installs created before then have their data in caep_app: either run
    //   ALTER DATABASE caep_app RENAME TO fn_app;
    // (as a superuser, with no active connections) or set DATABASE_URL to the
    // old name. See docs/deployment/caep-db-rename.md.
    url: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/fn_app',
  },
  verbose: true,
  strict: true,
} satisfies Config
