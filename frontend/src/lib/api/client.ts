import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { API_BASE_URL } from '@/lib/constants'

let _getAccessToken: (() => string | null) | null = null
let _getRefreshToken: (() => string | null) | null = null
let _onRefreshSuccess: ((token: string) => void) | null = null
let _onLogout: (() => void) | null = null

export function configureApiClient(opts: {
  getAccessToken: () => string | null
  getRefreshToken: () => string | null
  onRefreshSuccess: (token: string) => void
  onLogout: () => void
}) {
  _getAccessToken = opts.getAccessToken
  _getRefreshToken = opts.getRefreshToken
  _onRefreshSuccess = opts.onRefreshSuccess
  _onLogout = opts.onLogout
}

const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15_000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
})

// Request interceptor — attach auth token + request ID
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = _getAccessToken?.()
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`
  }
  if (config.headers) {
    config.headers['X-Request-ID'] = crypto.randomUUID()
    config.headers['X-Client'] = 'fn-web/1.0'
  }
  return config
})

let isRefreshing = false
let refreshQueue: Array<{
  resolve: (token: string) => void
  reject: (err: unknown) => void
}> = []

function processRefreshQueue(token: string | null, error: unknown) {
  refreshQueue.forEach(({ resolve, reject }) => {
    if (token) resolve(token)
    else reject(error)
  })
  refreshQueue = []
}

// Response interceptor — handle 401 with token refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean }

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          refreshQueue.push({
            resolve: (token: string) => {
              if (originalRequest.headers) {
                originalRequest.headers.Authorization = `Bearer ${token}`
              }
              resolve(apiClient(originalRequest))
            },
            reject,
          })
        })
      }

      originalRequest._retry = true
      isRefreshing = true

      const refreshToken = _getRefreshToken?.()
      if (!refreshToken) {
        _onLogout?.()
        return Promise.reject(error)
      }

      try {
        const { data } = await axios.post(`${API_BASE_URL}/auth/refresh`, {
          refreshToken,
        })
        const newToken: string = data.accessToken
        _onRefreshSuccess?.(newToken)
        processRefreshQueue(newToken, null)

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`
        }
        return apiClient(originalRequest)
      } catch (refreshError) {
        processRefreshQueue(null, refreshError)
        _onLogout?.()
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }

    // Normalize error
    const apiError = {
      message: (error.response?.data as { message?: string })?.message ?? error.message ?? 'An unexpected error occurred',
      code: (error.response?.data as { code?: string })?.code ?? 'UNKNOWN_ERROR',
      statusCode: error.response?.status ?? 0,
      details: (error.response?.data as { details?: Record<string, string[]> })?.details,
    }

    return Promise.reject(apiError)
  }
)

export default apiClient
