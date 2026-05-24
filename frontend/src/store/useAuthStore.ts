import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { UserProfile, LoginRequest } from '@/types/api'
import { authApi } from '@/lib/api/auth'
import { configureApiClient } from '@/lib/api/client'

interface AuthState {
  user: UserProfile | null
  accessToken: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
}

interface AuthActions {
  login: (credentials: LoginRequest) => Promise<void>
  logout: () => void
  refresh: () => Promise<void>
  setTokens: (accessToken: string, refreshToken?: string) => void
  clearError: () => void
  _initApiClient: () => void
}

export const useAuthStore = create<AuthState & AuthActions>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (credentials: LoginRequest) => {
        set({ isLoading: true, error: null })
        try {
          const response = await authApi.login(credentials)
          set({
            user: response.user,
            accessToken: response.accessToken,
            refreshToken: response.refreshToken,
            isAuthenticated: true,
            isLoading: false,
          })
          get()._initApiClient()
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Login failed'
          set({ isLoading: false, error: message, isAuthenticated: false })
          throw err
        }
      },

      logout: () => {
        authApi.logout().catch(() => {})
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          error: null,
        })
      },

      refresh: async () => {
        const { refreshToken } = get()
        if (!refreshToken) throw new Error('No refresh token')
        try {
          const response = await authApi.refresh(refreshToken)
          set({ accessToken: response.accessToken })
        } catch {
          get().logout()
        }
      },

      setTokens: (accessToken: string, refreshToken?: string) => {
        set((state) => ({
          accessToken,
          refreshToken: refreshToken ?? state.refreshToken,
          isAuthenticated: true,
        }))
      },

      clearError: () => set({ error: null }),

      _initApiClient: () => {
        configureApiClient({
          getAccessToken: () => get().accessToken,
          getRefreshToken: () => get().refreshToken,
          onRefreshSuccess: (token) => get().setTokens(token),
          onLogout: () => get().logout(),
        })
      },
    }),
    {
      name: 'caep-auth',
      // Only persist tokens, not user object (refetch on load)
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)
