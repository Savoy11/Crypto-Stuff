import { pgTable, text, timestamp, uuid, boolean, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { ModuleId } from '@/lib/modules/registry'

// ─── Identity & entitlements ─────────────────────────────────────────────────
// Multi-tenant from day one (docs/ROADMAP.md): every user-owned row elsewhere
// carries user_id referencing users.id.

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  // bcrypt hash. Null for users who only ever sign in through OAuth — that path
  // doesn't exist yet (credentials-only for now) but the column shouldn't have
  // to change when it lands.
  passwordHash: text('password_hash'),
  name: text('name'),
  // Auth.js-shaped columns so adding @auth/drizzle-adapter later is additive
  // (it brings its own accounts/sessions tables) rather than a users rewrite.
  emailVerified: timestamp('email_verified', { withTimezone: true }),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // Indexed on lower(email), not email. A plain unique index would happily let
  // Foo@x.com and foo@x.com both exist and then let either one shadow the
  // other at login. Application code lowercases on signup too, but this is the
  // constraint that actually holds the line.
  emailUnique: uniqueIndex('users_email_unique').on(sql`lower(${t.email})`),
}))

// One row per (user, module) that has been explicitly granted or revoked.
// Absence of a row means "use the default" — which in local dev is granted.
// This is what billing writes to in Phase 6.
export const entitlements = pgTable('entitlements', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  moduleId: text('module_id').$type<ModuleId>().notNull(),
  enabled: boolean('enabled').notNull().default(true),
  // Set when a license has a term; null = perpetual.
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userModuleUnique: uniqueIndex('entitlements_user_module_unique').on(t.userId, t.moduleId),
}))

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Entitlement = typeof entitlements.$inferSelect
