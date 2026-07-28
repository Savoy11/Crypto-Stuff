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

// The legacy backend's auth DTOs (LoginRequest/LoginResponse/RefreshToken*/
// UserProfile) lived here. They described the Python API's token exchange and
// user record, which the app no longer talks to — Auth.js owns sign-in and its
// session type comes from next-auth. Removed rather than kept "just in case":
// a second user shape is exactly what let two divergent identities coexist.

// WebSocketMessage/WebSocketSubscription described the legacy backend's socket
// envelope. Both went with lib/websocket/client.ts in the M8 sweep — the app is
// live-only over /live-data REST routes and opens no socket. Connection status
// (the one surviving concept) is typed as WsStatus in store/useStreamStore.ts.

export type TimeRange = '1h' | '24h' | '7d' | '30d' | '90d' | '1y'

export interface QueryParams {
  page?: number
  pageSize?: number
  sortBy?: string
  sortDirection?: 'asc' | 'desc'
  search?: string
  [key: string]: string | number | boolean | undefined
}
