export interface ApiResponse<T> {
  data: T
  success: boolean
  message?: string
  timestamp: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  hasNext: boolean
  hasPrev: boolean
}

export interface ApiError {
  message: string
  code: string
  statusCode: number
  details?: Record<string, string[]>
}

export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  accessToken: string
  refreshToken: string
  user: UserProfile
  expiresIn: number
}

export interface RefreshTokenRequest {
  refreshToken: string
}

export interface RefreshTokenResponse {
  accessToken: string
  expiresIn: number
}

export interface UserProfile {
  id: string
  email: string
  name: string
  role: 'admin' | 'analyst' | 'viewer'
  organization: string
  avatar?: string
  createdAt: string
  lastLoginAt: string
}

export interface WebSocketMessage<T = unknown> {
  type: string
  channel: string
  data: T
  timestamp: string
  requestId?: string
}

export interface WebSocketSubscription {
  channel: string
  assetId?: string
}

export type TimeRange = '1h' | '24h' | '7d' | '30d' | '90d' | '1y'

export interface QueryParams {
  page?: number
  pageSize?: number
  sortBy?: string
  sortDirection?: 'asc' | 'desc'
  search?: string
  [key: string]: string | number | boolean | undefined
}
