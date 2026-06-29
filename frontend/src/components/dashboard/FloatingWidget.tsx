'use client'

import { useRef, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Minus, Maximize2, LayoutDashboard, GripHorizontal } from 'lucide-react'

interface Props {
  title: string
  children: React.ReactNode
  initialX?: number
  initialY?: number
  onDock: () => void
  onClose: () => void
}

export function FloatingWidget({ title, children, initialX = 140, initialY = 120, onDock, onClose }: Props) {
  const [pos, setPos]         = useState({ x: initialX, y: initialY })
  const [minimized, setMin]   = useState(false)
  const [expanded, setExp]    = useState(false)
  const [mounted, setMounted] = useState(false)
  const dragging = useRef(false)
  const offset   = useRef({ x: 0, y: 0 })

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current) return
      setPos({
        x: Math.max(0, e.clientX - offset.current.x),
        y: Math.max(0, e.clientY - offset.current.y),
      })
    }
    function onUp() { dragging.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  function startDrag(e: React.MouseEvent) {
    dragging.current = true
    offset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }
    e.preventDefault()
  }

  if (!mounted) return null

  const width  = expanded ? '90vw' : 520
  const height = expanded ? '90vh' : undefined

  return createPortal(
    <div
      style={{
        position: 'fixed',
        left: expanded ? '5vw' : pos.x,
        top:  expanded ? '5vh' : pos.y,
        width,
        maxHeight: height,
        zIndex: 1000,
      }}
      className="flex flex-col bg-bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
    >
      {/* Title bar — drag handle */}
      <div
        onMouseDown={expanded ? undefined : startDrag}
        className={`flex items-center gap-2 px-3 py-2 border-b border-border bg-bg-elevated select-none ${!expanded ? 'cursor-move' : ''}`}
      >
        {!expanded && <GripHorizontal size={13} className="text-text-muted shrink-0" />}
        <span className="flex-1 text-xs font-semibold text-text-primary truncate">{title}</span>

        <button
          onClick={() => setMin((v) => !v)}
          title={minimized ? 'Restore' : 'Minimise'}
          className="text-text-muted hover:text-text-primary transition-colors p-0.5 rounded"
        >
          <Minus size={12} />
        </button>
        <button
          onClick={() => setExp((v) => !v)}
          title={expanded ? 'Restore size' : 'Expand'}
          className="text-text-muted hover:text-text-primary transition-colors p-0.5 rounded"
        >
          <Maximize2 size={12} />
        </button>
        <button
          onClick={onDock}
          title="Dock back to dashboard"
          className="text-text-muted hover:text-accent-blue transition-colors p-0.5 rounded"
        >
          <LayoutDashboard size={12} />
        </button>
        <button
          onClick={onClose}
          title="Hide widget"
          className="text-text-muted hover:text-red-400 transition-colors p-0.5 rounded"
        >
          <X size={12} />
        </button>
      </div>

      {/* Content */}
      {!minimized && (
        <div className="overflow-y-auto flex-1">
          {children}
        </div>
      )}
    </div>,
    document.body,
  )
}
