'use client'

import { Component, type ReactNode, type ErrorInfo } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, info: ErrorInfo) => void
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info)
    this.props.onError?.(error, info)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div className="flex flex-col items-center justify-center gap-4 p-8 rounded-card border border-border bg-bg-card text-center">
          <div className="size-12 rounded-full bg-red-500/10 flex items-center justify-center">
            <AlertTriangle size={24} className="text-red-400" aria-hidden />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary mb-1">Component Error</h3>
            <p className="text-xs text-text-muted max-w-xs">
              {this.state.error?.message ?? 'An unexpected error occurred in this component.'}
            </p>
          </div>
          <button
            onClick={this.handleReset}
            className="flex items-center gap-2 px-3 py-1.5 rounded text-xs bg-bg-elevated border border-border text-text-secondary hover:text-text-primary hover:border-border-strong transition-colors"
          >
            <RefreshCw size={12} aria-hidden />
            Try Again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

interface QueryErrorProps {
  message?: string
  onRetry?: () => void
}

export function QueryError({ message = 'Failed to load data', onRetry }: QueryErrorProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-6 rounded-card border border-border bg-bg-card text-center">
      <AlertTriangle size={20} className="text-amber-400" aria-hidden />
      <div>
        <p className="text-xs text-text-secondary">{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-1.5 px-3 py-1 rounded text-xs bg-bg-elevated border border-border text-text-secondary hover:text-text-primary transition-colors"
          aria-label="Retry loading data"
        >
          <RefreshCw size={11} aria-hidden />
          Retry
        </button>
      )}
    </div>
  )
}
