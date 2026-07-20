# Authentication & data ownership

_Last updated: 2026-07-19._

This describes how CAEP decides **who owns a row**, what is built and verified
today, and exactly what remains for multi-user auth when commercialization
starts (see `docs/ROADMAP.md` Phase 6 and the Sell-Readiness Plan).

---

## Current state: the auth wall is intentionally OFF

Three separate switches keep login out of the way. They were set deliberately
by the owner, not left half-finished:

| Location | Switch | Effect |
|---|---|---|
| `src/app/(dashboard)/layout.tsx` | `REQUIRE_AUTH = false` | Dashboard never redirects to `/login` |
| `src/app/(auth)/login/page.tsx` | `LOGIN_DISABLED = true` | `/login` redirects to `/headlines`, renders `null` |
| `src/store/useAuthStore.ts` | — | Still points at the **dormant** legacy FastAPI backend, not Auth.js |

**Do not re-enable these without asking.** They are a product decision, not a bug.

---

## How ownership actually resolves

Every user-owned table carries `user_id`. Server code resolves it through one
function — `getCurrentUserId()` in `src/lib/auth/session.ts`:

```
session present            → that user's id          (mode: 'session')
no session, local allowed  → shared local user's id  (mode: 'local')
no session, local denied   → null → caller returns 401
```

Local-user mode exists because the auth wall is off: rows still need an owner,
and re-enabling login to get one would override the owner's decision. It
resolves to a single account, `local@caep.local`, created on first use. That
account has `password_hash = NULL` and **cannot be logged into** — it only owns
rows.

`isLocalUserModeAllowed()` returns true in development, and in production
**only** when `CAEP_ALLOW_LOCAL_USER=true`. That default is load-bearing:
without it, a public deploy would silently hand every anonymous visitor the
same shared account, and with it everyone's portfolio and budget.

Inspect the resolved owner at any time via `GET /api/auth/me`.

---

## What is built and verified (2026-07-19)

Auth.js v5, credentials provider, JWT sessions (credentials providers cannot
use database sessions). `users` already carries Auth.js-shaped columns
(`email_verified`, `image`), so adding `@auth/drizzle-adapter` + OAuth later is
additive rather than a rewrite.

Exercised against the real database, not just type-checked:

| Behaviour | Result |
|---|---|
| Signup creates a user, returns id + email only | 201 |
| Duplicate email rejected | 409 |
| Duplicate with different casing rejected | 409 |
| Password shorter than 10 chars rejected | 400 |
| Invalid email / malformed body rejected | 400 |
| Login with correct password issues a session | 302 + session |
| Login with **wrong** password issues none | 302 to error, `session: null` |
| Login as a **nonexistent** user | identical response (no user enumeration) |
| Login with different-case email resolves to the same user | 302 + session |
| `/api/auth/me` flips `local` → `session` when signed in | confirmed |
| No cookie → local fallback returns a stable id | confirmed |

### One real bug this caught

`next.config.mjs` proxies `/api/*` to the legacy backend. Next.js rewrites run
in the `afterFiles` phase — **after** concrete file routes but **before**
dynamic ones. So `/api/auth/signup` (a literal file) reached its handler while
`/api/auth/csrf` and `/api/auth/callback/*` (served by the `[...nextauth]`
catch-all) were proxied to a backend that isn't running, and 500'd. Login was
completely broken while signup appeared to work.

Fixed by excluding Auth.js paths: `source: '/api/:path((?!auth/).*)'`.

> **Still outstanding in that rule:** `NEXT_PUBLIC_API_URL` is
> `http://localhost:8000/api/v1`, and the destination appends `/api/:path`,
> producing a doubled `http://localhost:8000/api/v1/api/...`. Any `/api/*` path
> without a concrete route file 500s. Harmless while the backend is dormant,
> but it will bite whoever revives it.

---

## Goal B — full multi-user auth (do this when selling)

Not built. Deliberately deferred: nothing in the app consumes multi-user auth
yet, and building it now means maintaining a login system with no users.

1. **Wire the login page to Auth.js.** Replace `useAuthStore.login()` (legacy
   backend) with `signIn('credentials', …)`. Remove `LOGIN_DISABLED`.
2. **Add `SessionProvider`** to `src/app/providers.tsx` and make
   `useAuthStore` read from `useSession()` rather than holding its own tokens —
   or delete the store entirely, since Auth.js already owns this state.
3. **Restore the wall:** `REQUIRE_AUTH = true`. Prefer Next.js middleware over
   the current client-side effect, so protected pages never render before the
   redirect.
4. **Move entitlements to the database.** `useEntitlementStore` is
   localStorage-backed and trivially editable by the user — fine for a personal
   tool, unacceptable when modules are paid SKUs. The `entitlements` table
   already exists; read through a server route and treat missing rows as
   "denied" rather than the current "granted".
5. **Turn off local-user mode** in production (`CAEP_ALLOW_LOCAL_USER=false`)
   and add a signup UI.
6. **Then** billing (Stripe → writes `entitlements`), password reset, and
   OAuth via `@auth/drizzle-adapter`.

Steps 1–3 are a few hours. Step 4 is the one with real security weight — it is
what makes a module boundary a *paywall* instead of a UI preference.
