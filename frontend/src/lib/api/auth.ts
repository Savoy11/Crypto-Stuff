import apiClient from './client'
import type { LoginRequest, LoginResponse, RefreshTokenResponse, UserProfile } from '@/types/api'

export const authApi = {
  login: async (credentials: LoginRequest): Promise<LoginResponse> => {
    const { data } = await apiClient.post<LoginResponse>('/auth/login', credentials)
    return data
  },

  logout: async (): Promise<void> => {
    await apiClient.post('/auth/logout')
  },

  refresh: async (refreshToken: string): Promise<RefreshTokenResponse> => {
    const { data } = await apiClient.post<RefreshTokenResponse>('/auth/refresh', { refreshToken })
    return data
  },

  me: async (): Promise<UserProfile> => {
    const { data } = await apiClient.get<UserProfile>('/auth/me')
    return data
  },
}
