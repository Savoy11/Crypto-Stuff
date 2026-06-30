'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Activity, Eye, EyeOff, Loader2, AlertTriangle } from 'lucide-react'
import { useAuthStore } from '@/store/useAuthStore'
import { APP_NAME, APP_FULL_NAME } from '@/lib/constants'
import { clsx } from 'clsx'

export default function LoginPage() {
  const router = useRouter()
  const { login, isLoading, error, clearError } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      clearError()
      try {
        await login({ email, password })
        router.push('/dashboard')
      } catch {
        // error already set in store
      }
    },
    [email, password, login, router, clearError]
  )

  return (
    <div className="flex flex-col gap-8">
      {/* Logo */}
      <div className="flex flex-col items-center gap-3">
        <div className="size-14 rounded-xl bg-accent-blue/20 border border-accent-blue/30 flex items-center justify-center">
          <Activity size={28} className="text-accent-blue" aria-hidden />
        </div>
        <div className="text-center">
          <h1 className="font-mono font-bold text-2xl text-text-primary tracking-wider">{APP_NAME}</h1>
          <p className="text-xs text-text-muted mt-1">{APP_FULL_NAME}</p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="text-center mb-2">
          <h2 className="text-base font-semibold text-text-primary">Institutional Sign In</h2>
          <p className="text-xs text-text-muted mt-1">
            Access restricted to authorized personnel
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded bg-red-500/10 border border-red-500/30 text-sm text-red-400">
            <AlertTriangle size={14} aria-hidden />
            {error}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label htmlFor="email" className="block text-xs font-medium text-text-secondary mb-1.5">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2.5 bg-bg-secondary border border-border rounded text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-blue/60 focus:ring-1 focus:ring-accent-blue/30 transition-colors"
              placeholder="analyst@institution.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-xs font-medium text-text-secondary mb-1.5">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-3 py-2.5 pr-10 bg-bg-secondary border border-border rounded text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-blue/60 focus:ring-1 focus:ring-accent-blue/30 transition-colors"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
              </button>
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className={clsx(
            'flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded font-medium text-sm transition-all',
            'bg-accent-blue hover:bg-accent-blue-dim text-white',
            'disabled:opacity-60 disabled:cursor-not-allowed',
            'focus:outline-none focus:ring-2 focus:ring-accent-blue/50'
          )}
        >
          {isLoading ? (
            <>
              <Loader2 size={14} className="animate-spin" aria-hidden />
              Authenticating...
            </>
          ) : (
            'Sign In'
          )}
        </button>

      </form>

      {/* Footer */}
      <div className="text-center text-[10px] text-text-muted">
        <p>Authorized personnel only. All access is logged.</p>
        <p className="mt-1">© 2025 CAEP. Institutional Analytics Platform.</p>
      </div>
    </div>
  )
}
