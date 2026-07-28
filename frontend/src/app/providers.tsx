'use client'

import { type ReactNode, useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SessionProvider } from 'next-auth/react'
import { Toaster } from 'react-hot-toast'
import { GC_TIME, STALE_TIME_SHORT } from '@/lib/constants'
import { useEntitlementStore } from '@/store/useEntitlementStore'
import { useFeedBiasStore } from '@/store/useFeedBiasStore'

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: STALE_TIME_SHORT,
        gcTime: GC_TIME,
        retry: 2,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: 1,
      },
    },
  })
}

let browserQueryClient: QueryClient | undefined

function getQueryClient() {
  if (typeof window === 'undefined') {
    return makeQueryClient()
  }
  if (!browserQueryClient) browserQueryClient = makeQueryClient()
  return browserQueryClient
}

export function Providers({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient()

  // The entitlement store is created with `skipHydration` so the first client
  // render matches the server's. Pull the saved bundle in once hydration has
  // committed — effects run after that, so this can't reintroduce a mismatch.
  // Consumers (Sidebar, ModuleGate) re-render with the real state immediately
  // after.
  useEffect(() => {
    void useEntitlementStore.persist.rehydrate()
    void useFeedBiasStore.persist.rehydrate()
  }, [])

  // Purge the auth blob that builds before mid-2026 persisted. This used to run
  // at module scope in the deleted legacy auth store; it is kept because the
  // blob could contain legacy-backend access/refresh tokens, and stale
  // credentials should not outlive the stack that issued them.
  useEffect(() => {
    try { window.localStorage.removeItem('caep-auth') } catch { /* storage unavailable */ }
  }, [])

  // Auth.js session context. Needed because the components that read the
  // session (Sidebar, the dashboard layout's auth wall) are client components.
  // While the auth wall is off this resolves to `null` for every visitor and
  // DB-backed features fall through to local-user mode — see
  // lib/auth/session.ts.
  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: '#1a1d26',
              color: '#e2e8f0',
              border: '1px solid #1e2433',
              fontSize: '13px',
            },
            success: {
              iconTheme: { primary: '#10b981', secondary: '#1a1d26' },
            },
            error: {
              iconTheme: { primary: '#ef4444', secondary: '#1a1d26' },
            },
          }}
        />
      </QueryClientProvider>
    </SessionProvider>
  )
}
