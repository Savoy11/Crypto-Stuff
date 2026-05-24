'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'
import { StatusBar } from '@/components/layout/StatusBar'
import { useWebSocket } from '@/lib/websocket/hooks'
import { useAuthStore } from '@/store/useAuthStore'
import { useRecentAlerts } from '@/hooks/useAlerts'
import { USE_MOCK } from '@/lib/constants'

function DashboardInner({ children }: { children: React.ReactNode }) {
  // Initialize WebSocket
  useWebSocket()

  // Pre-fetch recent alerts into store on mount
  useRecentAlerts(20)

  // Mobile navigation drawer state (hidden on lg+ where the sidebar is always visible)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const pathname = usePathname()

  // Auto-close the mobile drawer whenever the route changes
  useEffect(() => {
    setMobileNavOpen(false)
  }, [pathname])

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
        <main
          className="flex-1 mt-topbar mb-statusbar overflow-y-auto p-4 sm:p-6"
          role="main"
        >
          {children}
        </main>
        <StatusBar />
      </div>
    </div>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()

  useEffect(() => {
    if (!USE_MOCK && !isAuthenticated) {
      router.push('/login')
    }
  }, [isAuthenticated, router])

  if (!USE_MOCK && !isAuthenticated) return null

  return <DashboardInner>{children}</DashboardInner>
}
