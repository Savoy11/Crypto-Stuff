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
  /**
   * Rows a screener could not evaluate because the feed lacked a value it
   * needed. Never folded into the excluded count — nobody ran the test on them.
   */
  untested?: number
  /** field key → how many rows lacked it, so the caption can name a reason. */
  missingByField?: Record<string, number>
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
// live-only over /live-data REST routes and opens no socket. What survived the
// concept is feed health, now derived from React Query's cache rather than a
// connection: see FeedStatus in store/useFeedStore.ts and lib/feed/useFeedStatus.ts.

export type TimeRange = '1h' | '24h' | '7d' | '30d' | '90d' | '1y'

export interface QueryParams {
  page?: number
  pageSize?: number
  sortBy?: string
  sortDirection?: 'asc' | 'desc'
  search?: string
  [key: string]: string | number | boolean | undefined
}
