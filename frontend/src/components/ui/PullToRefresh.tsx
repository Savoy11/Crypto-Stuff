'use client'

import { useRef, useState, useCallback, type ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'
import { clsx } from 'clsx'

const PULL_THRESHOLD = 72   // px of pull required to trigger
const MAX_PULL       = 100  // px cap on visual stretch

interface Props {
  onRefresh: () => Promise<void> | void
  children: ReactNode
  className?: string
}

export function PullToRefresh({ onRefresh, children, className }: Props) {
  const [pullY,      setPullY]      = useState(0)   // 0–MAX_PULL
  const [releasing, setReleasing]   = useState(false)
  const [triggered, setTriggered]   = useState(false)

  const startY    = useRef<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const busy      = useRef(false)

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (scrollRef.current && scrollRef.current.scrollTop === 0) {
      startY.current = e.touches[0].clientY
    }
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (startY.current === null || busy.current) return
    const delta = e.touches[0].clientY - startY.current
    if (delta <= 0) { startY.current = null; return }
    // Only pull when truly at the top
    if (scrollRef.current && scrollRef.current.scrollTop > 2) {
      startY.current = null; return
    }
    setPullY(Math.min(delta * 0.5, MAX_PULL))
  }, [])

  const handleTouchEnd = useCallback(async () => {
    if (pullY >= PULL_THRESHOLD && !busy.current) {
      busy.current = true
      setReleasing(true)
      setTriggered(true)
      setPullY(40) // snap to spinner position
      await onRefresh()
      setTriggered(false)
      setReleasing(false)
      setPullY(0)
      busy.current = false
    } else {
      setReleasing(true)
      setPullY(0)
      setTimeout(() => setReleasing(false), 200)
    }
    startY.current = null
  }, [pullY, onRefresh])

  // Mouse support for desktop testing
  const mouseStart = useRef<number | null>(null)
  const mouseDown  = useRef(false)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (scrollRef.current?.scrollTop === 0) {
      mouseStart.current = e.clientY
      mouseDown.current  = true
    }
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!mouseDown.current || mouseStart.current === null || busy.current) return
    const delta = e.clientY - mouseStart.current
    if (delta <= 0 || (scrollRef.current && scrollRef.current.scrollTop > 2)) {
      mouseStart.current = null; return
    }
    setPullY(Math.min(delta * 0.5, MAX_PULL))
  }, [])

  const handleMouseUp = useCallback(async () => {
    mouseDown.current = false
    if (pullY >= PULL_THRESHOLD && !busy.current) {
      busy.current = true
      setReleasing(true)
      setTriggered(true)
      setPullY(40)
      await onRefresh()
      setTriggered(false)
      setReleasing(false)
      setPullY(0)
      busy.current = false
    } else {
      setReleasing(true)
      setPullY(0)
      setTimeout(() => setReleasing(false), 200)
    }
    mouseStart.current = null
  }, [pullY, onRefresh])

  const ready = pullY >= PULL_THRESHOLD

  return (
    <div
      ref={scrollRef}
      className={clsx('relative overflow-y-auto', className)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Pull indicator */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 flex justify-center z-10 overflow-hidden"
        style={{
          height:     pullY,
          transition: releasing ? 'height 200ms ease' : undefined,
        }}
      >
        <div className={clsx(
          'mt-auto mb-2 size-8 rounded-full bg-bg-elevated border border-border flex items-center justify-center shadow-lg transition-all',
          ready ? 'border-accent-blue' : '',
        )}>
          <RefreshCw
            size={14}
            className={clsx(
              'transition-colors',
              ready || triggered ? 'text-accent-blue' : 'text-text-muted',
              triggered && 'animate-spin',
            )}
            style={{ transform: `rotate(${Math.min(pullY / PULL_THRESHOLD, 1) * 360}deg)` }}
          />
        </div>
      </div>

      {/* Page content pushed down by pull */}
      <div
        style={{
          transform:  `translateY(${pullY}px)`,
          transition: releasing ? 'transform 200ms ease' : undefined,
        }}
      >
        {children}
      </div>
    </div>
  )
}
