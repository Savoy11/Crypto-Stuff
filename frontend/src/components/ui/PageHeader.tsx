'use client'

import { useState, useRef } from 'react'
import { Info } from 'lucide-react'
import { clsx } from 'clsx'

interface PageHeaderProps {
  title: string
  subtitle?: string
  icon?: React.ReactNode
  description?: string
  /** Extra detail shown below the description — e.g. trigger conditions, data sources */
  details?: Array<{ label: string; text: string }>
}

export function PageHeader({ title, subtitle, icon, description, details }: PageHeaderProps) {
  const [visible, setVisible] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasTooltip = !!description

  const show = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setVisible(true)
  }
  const hide = () => {
    timeoutRef.current = setTimeout(() => setVisible(false), 120)
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2.5">
        {icon && <span className="text-accent-blue">{icon}</span>}

        <div className="relative">
          {/* Title — hoverable if tooltip present */}
          <h1
            className={clsx(
              'text-xl font-semibold text-text-primary leading-tight',
              hasTooltip && 'cursor-default'
            )}
            onMouseEnter={hasTooltip ? show : undefined}
            onMouseLeave={hasTooltip ? hide : undefined}
          >
            {title}
            {hasTooltip && (
              <Info
                size={13}
                className="inline ml-1.5 mb-0.5 text-text-muted opacity-60 hover:opacity-100 transition-opacity"
                aria-hidden
              />
            )}
          </h1>

          {/* Tooltip */}
          {hasTooltip && visible && (
            <div
              className="absolute left-0 top-full mt-2 z-50 w-80 rounded-xl border border-border bg-bg-card shadow-xl shadow-black/30 p-4 text-sm"
              onMouseEnter={show}
              onMouseLeave={hide}
            >
              <p className="text-text-secondary leading-relaxed">{description}</p>

              {details && details.length > 0 && (
                <div className="mt-3 space-y-2 border-t border-border pt-3">
                  {details.map(({ label, text }) => (
                    <div key={label}>
                      <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-0.5">{label}</p>
                      <p className="text-xs text-text-muted leading-relaxed">{text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {subtitle && (
        <p className="text-sm text-text-muted">{subtitle}</p>
      )}
    </div>
  )
}
