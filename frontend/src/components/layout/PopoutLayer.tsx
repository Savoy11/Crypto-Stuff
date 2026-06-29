'use client'

import { usePopoutStore } from '@/store/usePopoutStore'
import { PopoutWindow } from '@/components/ui/PopoutWindow'

export function PopoutLayer() {
  const { popouts } = usePopoutStore()
  if (popouts.length === 0) return null

  return (
    <>
      {popouts.map((popout) => (
        <PopoutWindow key={popout.id} popout={popout} />
      ))}
    </>
  )
}
