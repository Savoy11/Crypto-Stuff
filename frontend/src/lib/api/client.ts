import axios, { type AxiosInstance, type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { API_BASE_URL } from '@/lib/constants'

// Axios client for the remaining legacy-backend calls (assets, market-data,
// alerts, risk-scores). It carries no auth: the bearer-token and refresh-queue
// interceptors that used to live here were driven entirely by the legacy auth
// store's in-memory tokens, and both are gone now that Auth.js owns sign-in.
// Auth.js keeps its session in an HttpOnly cookie, which the browser attaches
// on its own — there is nothing for an interceptor to inject.
//
// Whether this client should exist at all is a separate question: see the
// dead-weight sweep in docs/assessments (M8). `assetsApi` is the one live
// consumer, via the Coin Registry's market-breadth KPIs.

const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15_000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
})

// Request interceptor — request ID + client tag for server-side correlation
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (config.headers) {
    config.headers['X-Request-ID'] = crypto.randomUUID()
    config.headers['X-Client'] = 'fn-web/1.0'
  }
  return config
})

// Response interceptor — normalize errors into a consistent shape
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
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
