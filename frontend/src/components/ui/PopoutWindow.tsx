'use client'

import { useCallback } from 'react'
import { X, Minus, GripHorizontal } from 'lucide-react'
import { usePopoutStore, type PopoutInstance } from '@/store/usePopoutStore'
import { PopoutContent } from './PopoutContent'

export function PopoutWindow({ popout }: { popout: PopoutInstance }) {
  const { move, resize, close, toggleMinimize, bringToFront } = usePopoutStore()

  // ── Drag title bar ────────────────────────────────────────────────────────
  const onTitleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      e.preventDefault()
      bringToFront(popout.id)

      const startX = e.clientX - popout.x
      const startY = e.clientY - popout.y

      const onMove = (ev: MouseEvent) => {
        move(
          popout.id,
          Math.max(0, ev.clientX - startX),
          Math.max(0, ev.clientY - startY)
        )
      }
      const onUp = () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [popout.id, popout.x, popout.y, move, bringToFront]
  )

  // ── Resize corner ────────────────────────────────────────────────────────
  const onResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()

      const startX = e.clientX
      const startY = e.clientY
      const startW = popout.width
      const startH = popout.height

      const onMove = (ev: MouseEvent) => {
        resize(
          popout.id,
          Math.max(280, startW + ev.clientX - startX),
          Math.max(180, startH + ev.clientY - startY)
        )
      }
      const onUp = () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [popout.id, popout.width, popout.height, resize]
  )

  return (
    <div
      style={{
        left: popout.x,
        top: popout.y,
        width: popout.width,
        height: popout.minimized ? 'auto' : popout.height,
        zIndex: popout.zIndex,
      }}
      className="fixed flex flex-col rounded-xl border border-border bg-bg-card shadow-2xl shadow-black/50 overflow-hidden"
      onMouseDown={() => bringToFront(popout.id)}
    >
      {/* Title bar */}
      <div
        className="flex items-center gap-2 px-3 py-2 bg-bg-elevated border-b border-border cursor-grab active:cursor-grabbing select-none flex-shrink-0"
        onMouseDown={onTitleMouseDown}
      >
        <GripHorizontal size={12} className="text-text-muted flex-shrink-0" aria-hidden />
        <span className="flex-1 text-xs font-semibold text-text-primary truncate">{popout.title}</span>
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => toggleMinimize(popout.id)}
          className="text-text-muted hover:text-text-secondary p-0.5 rounded transition-colors"
          title={popout.minimized ? 'Restore' : 'Minimize'}
        >
          <Minus size={12} aria-hidden />
        </button>
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => close(popout.id)}
          className="text-text-muted hover:text-red-400 p-0.5 rounded transition-colors"
          title="Close"
        >
          <X size={12} aria-hidden />
        </button>
      </div>

      {/* Content */}
      {!popout.minimized && (
        <div className="flex-1 overflow-auto relative min-h-0">
          <PopoutContent contentKey={popout.key} />

          {/* Resize handle */}
          <div
            className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize flex items-end justify-end pb-0.5 pr-0.5"
            onMouseDown={onResizeMouseDown}
          >
            <svg viewBox="0 0 10 10" className="w-3 h-3 text-text-muted opacity-40">
              <line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="9" y1="5" x2="5" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
        </div>
      )}
    </div>
  )
}
