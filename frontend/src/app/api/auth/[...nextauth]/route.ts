import { handlers } from '@/lib/auth/config'

// Auth.js route handler — serves /api/auth/session, /api/auth/csrf,
// /api/auth/callback/credentials and friends. The /login page's signIn() call
// posts through here.
//
// (This comment used to claim the login page posted here while it actually
// posted to the legacy Python backend. It does now.)
export const { GET, POST } = handlers
