'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'
import { StatusBar } from '@/components/layout/StatusBar'
import { DataStatusBanner } from '@/components/layout/DataStatusBanner'
import { PopoutLayer } from '@/components/layout/PopoutLayer'
import { CommandPalette } from '@/components/layout/CommandPalette'
import { AssistantWidget } from '@/components/agents/AssistantWidget'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { useSession }       from 'next-auth/react'
import { useFeedStatus }    from '@/lib/feed/useFeedStatus'
import { useRecentAlerts }  from '@/hooks/useAlerts'
import { useGlobalRefresh } from '@/hooks/useGlobalRefresh'
import { usePriceAlertMonitor } from '@/hooks/usePriceAlertMonitor'
import { PullToRefresh }    from '@/components/ui/PullToRefresh'
// LOGIN TEMPORARILY DISABLED (by request). The auth wall is fully off so it
// cannot affect the build or block access.
//
// The original condition — "until the risk framework is done" — was satisfied
// on 2026-07-19 when R2 landed. Turning the wall back on is now an owner
// decision, not a blocked one.
//
// To RE-ENABLE: set REQUIRE_AUTH = true here, set LOGIN_DISABLED = false in
// (auth)/login/page.tsx, and set AUTH_SECRET in the environment (Auth.js reads
// it straight from env, so it appears in no source file and grep won't find it).
//
// This comment previously prescribed `const REQUIRE_AUTH = !LIVE_DATA`, which
// was a broken recipe: LIVE_DATA is hardcoded `true` in lib/constants.ts, so
// following it left the wall permanently off while looking deliberate. The
// login page has always carried the correct version — keep the two in sync.
const REQUIRE_AUTH = false

function DashboardInner({ children }: { children: React.ReactNode }) {
  useFeedStatus()                          // drives the Sidebar/StatusBar feed dot
  useRecentAlerts(20)
  const { refresh } = useGlobalRefresh()   // registers auto-refresh interval
  usePriceAlertMonitor()                   // user price alerts, app-wide

  // Mobile navigation drawer (hidden on lg+ where the sidebar is always visible)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const pathname = usePathname()
  useEffect(() => { setMobileNavOpen(false) }, [pathname])

  return (
    <div className="flex min-h-screen bg-bg-primary">
      <Sidebar open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />

      {/* Backdrop for the mobile drawer */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/60 backdrop-blur-sm lg:hidden"
          aria-hidden
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <div className="flex-1 min-w-0 lg:ml-sidebar flex flex-col min-h-screen">
        <TopBar onMenuClick={() => setMobileNavOpen(true)} />
        <PullToRefresh
          onRefresh={refresh}
          className="flex-1 mt-topbar mb-statusbar"
        >
          <main role="main">
            <DataStatusBanner />
            <div className="p-4 sm:p-6"><ErrorBoundary>{children}</ErrorBoundary></div>
          </main>
        </PullToRefresh>
        <StatusBar />
      </div>
      <PopoutLayer />
      <CommandPalette />
      <AssistantWidget />
    </div>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { status } = useSession()

  // 'loading' is deliberately not treated as unauthenticated: the session is
  // fetched after mount, so redirecting on it would bounce a signed-in user to
  // /login on every page load.
  const blocked = REQUIRE_AUTH && status === 'unauthenticated'

  useEffect(() => {
    if (blocked) router.push('/login')
  }, [blocked, router])

  if (REQUIRE_AUTH && status !== 'authenticated') return null

  return <DashboardInner>{children}</DashboardInner>
}
