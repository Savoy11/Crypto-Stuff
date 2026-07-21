import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { getCurrentUserId, isLocalUserModeAllowed } from '@/lib/auth/session'
import { isDbConfigured } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Who owns the data for this request?
//
// Every DB-backed feature resolves an owner through getCurrentUserId(), and
// when rows go missing the first question is always "which user did that write
// land under?". This answers it directly rather than making you guess.
//
// Returns no personal data beyond the caller's own id and email.

export async function GET() {
  if (!isDbConfigured) {
    return NextResponse.json(
      { error: 'Database is not configured. See DATABASE_URL in frontend/.env.local.' },
      { status: 503 }
    )
  }

  const session = await auth()
  const userId = await getCurrentUserId()

  if (!userId) {
    return NextResponse.json(
      {
        userId: null,
        mode: 'unauthenticated',
        localUserModeAllowed: false,
        detail: 'No session, and local-user mode is disabled in this environment.',
      },
      { status: 401 }
    )
  }

  return NextResponse.json({
    userId,
    // 'session' = a real logged-in user. 'local' = the shared local-mode owner
    // used while the auth wall is off (see lib/auth/session.ts).
    mode: session?.user?.id ? 'session' : 'local',
    email: session?.user?.email ?? null,
    localUserModeAllowed: isLocalUserModeAllowed(),
  })
}
