import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { eq, sql } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'

// ─── Auth.js configuration ───────────────────────────────────────────────────
// Credentials-only for now (docs/ROADMAP.md Phase 0: "credentials now, OAuth
// later"). The users table already carries Auth.js-shaped columns, so adding
// @auth/drizzle-adapter + an OAuth provider later is additive.
//
// Session strategy is JWT rather than database sessions because the credentials
// provider does not support database sessions — Auth.js only persists a session
// row for providers it brokers itself.
//
// NOTE: the dashboard's auth wall is currently OFF by the owner's explicit
// request (see src/app/(dashboard)/layout.tsx). Everything here works, and
// /login will authenticate against the database, but nothing forces a user
// through it. See getCurrentUserId() in ./session.ts for how DB-backed features
// resolve an owner while the wall is down.

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email = typeof credentials?.email === 'string' ? credentials.email.trim().toLowerCase() : ''
        const password = typeof credentials?.password === 'string' ? credentials.password : ''
        if (!email || !password) return null

        const [user] = await db
          .select()
          .from(users)
          // Match the lower(email) unique index rather than comparing raw
          // strings, so a user who signed up as Foo@x.com can log in as
          // foo@x.com.
          .where(eq(sql`lower(${users.email})`, email))
          .limit(1)

        if (!user?.passwordHash) return null

        const ok = await bcrypt.compare(password, user.passwordHash)
        if (!ok) return null

        return { id: user.id, email: user.email, name: user.name ?? undefined, image: user.image ?? undefined }
      },
    }),
  ],
  callbacks: {
    // Persist the database user id into the token, then surface it on the
    // session. Without this, session.user.id is undefined and every
    // tenant-scoped query would have nothing to filter on.
    async jwt({ token, user }) {
      if (user?.id) token.uid = user.id
      return token
    },
    async session({ session, token }) {
      if (session.user && typeof token.uid === 'string') session.user.id = token.uid
      return session
    },
  },
})
