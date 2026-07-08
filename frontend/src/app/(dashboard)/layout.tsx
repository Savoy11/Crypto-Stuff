'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'
import { StatusBar } from '@/components/layout/StatusBar'
import { DataStatusBanner } from '@/components/layout/DataStatusBanner'
import { PopoutLayer } from '@/components/layout/PopoutLayer'
import { CommandPalette } from '@/components/layout/CommandPalette'
import { AssistantWidget } from '@/components/agents/AssistantWidget'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { useWebSocket }     from '@/lib/websocket/hooks'
import { useAuthStore }     from '@/store/useAuthStore'
import { useRecentAlerts }  from '@/hooks/useAlerts'
import { useGlobalRefresh } from '@/hooks/useGlobalRefresh'
import { usePriceAlertMonitor } from '@/hooks/usePriceAlertMonitor'
import { PullToRefresh }    from '@/components/ui/PullToRefresh'
// LOGIN TEMPORARILY DISABLED (by request, until the risk framework is done).
// The auth wall is fully off so it cannot affect the build or block access.
// To RE-ENABLE later: restore `import { LIVE_DATA } from '@/lib/constants'`
// and `const REQUIRE_AUTH = !LIVE_DATA`, and revert the /login redirect.
const REQUIRE_AUTH = false

function DashboardInner({ children }: { children: React.ReactNode }) {
  useWebSocket()
  useRecentAlerts(20)
  const { refresh } = useGlobalRefresh()   // registers auto-refresh interval
  usePriceAlertMonitor()                   // user price alerts, app-wide

  return (
    <div className="flex min-h-screen bg-bg-primary">
      <Sidebar />
      <div className="flex-1 ml-sidebar flex flex-col min-h-screen">
        <TopBar />
        <PullToRefresh
          onRefresh={refresh}
          className="flex-1 mt-topbar mb-statusbar"
        >
          <main role="main">
            <DataStatusBanner />
            <div className="p-6"><ErrorBoundary>{children}</ErrorBoundary></div>
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
  const { isAuthenticated } = useAuthStore()

  useEffect(() => {
    if (REQUIRE_AUTH && !isAuthenticated) {
      router.push('/login')
    }
  }, [isAuthenticated, router])

  if (REQUIRE_AUTH && !isAuthenticated) return null

  return <DashboardInner>{children}</DashboardInner>
}
