'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
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

  return (
    <div className="flex min-h-screen bg-bg-primary">
      <Sidebar />
      <div className="flex-1 ml-sidebar flex flex-col min-h-screen">
        <TopBar />
        <main
          className="flex-1 mt-topbar mb-statusbar overflow-y-auto p-6"
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
