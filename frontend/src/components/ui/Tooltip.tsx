'use client'

import { type ReactNode, useState, useRef, useCallback } from 'react'
import { clsx } from 'clsx'

type TooltipPosition = 'top' | 'bottom' | 'left' | 'right'

interface TooltipProps {
  content: ReactNode
  children: ReactNode
  position?: TooltipPosition
  className?: string
  delay?: number
}

const POSITION_CLASSES: Record<TooltipPosition, { tooltip: string; arrow: string }> = {
  top: {
    tooltip: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    arrow: 'top-full left-1/2 -translate-x-1/2 border-t-bg-elevated border-transparent border-4 border-t-4',
  },
  bottom: {
    tooltip: 'top-full left-1/2 -translate-x-1/2 mt-2',
    arrow: 'bottom-full left-1/2 -translate-x-1/2 border-b-bg-elevated border-transparent border-4 border-b-4',
  },
  left: {
    tooltip: 'right-full top-1/2 -translate-y-1/2 mr-2',
    arrow: 'left-full top-1/2 -translate-y-1/2 border-l-bg-elevated border-transparent border-4 border-l-4',
  },
  right: {
    tooltip: 'left-full top-1/2 -translate-y-1/2 ml-2',
    arrow: 'right-full top-1/2 -translate-y-1/2 border-r-bg-elevated border-transparent border-4 border-r-4',
  },
}

export function Tooltip({ content, children, position = 'top', className, delay = 300 }: TooltipProps) {
  const [visible, setVisible] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = useCallback(() => {
    timer.current = setTimeout(() => setVisible(true), delay)
  }, [delay])

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    setVisible(false)
  }, [])

  const pos = POSITION_CLASSES[position]

  return (
    <div className={clsx('relative inline-flex', className)} onMouseEnter={show} onMouseLeave={hide}>
      {children}
      {visible && (
        <div
          role="tooltip"
          className={clsx(
            'absolute z-50 whitespace-nowrap px-2.5 py-1.5 rounded text-xs text-text-primary bg-bg-elevated border border-border shadow-card-hover animate-fade-in pointer-events-none',
            pos.tooltip
          )}
        >
          {content}
        </div>
      )}
    </div>
  )
}
