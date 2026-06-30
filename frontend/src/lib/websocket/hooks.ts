'use client'

import { useEffect, useRef, useCallback } from 'react'
import { getWsClient, type WsStatus } from './client'
import type { WebSocketMessage } from '@/types/api'
import { useStreamStore } from '@/store/useStreamStore'
import { LIVE_DATA } from '@/lib/constants'

export function useWebSocket() {
  const { setConnectionStatus } = useStreamStore()

  useEffect(() => {
    // Live-only mode has no backend WebSocket — data is served over the
    // /live-data REST routes via React Query. Mark connected and skip the socket.
    if (LIVE_DATA) {
      setConnectionStatus('connected')
      return
    }

    const client = getWsClient({
      onStatusChange: (status: WsStatus) => {
        setConnectionStatus(status)
      },
    })

    client.connect()

    return () => {
      // Don't disconnect on unmount — keep alive globally
    }
  }, [setConnectionStatus])
}

export function useWsChannel(
  channel: string,
  handler: (msg: WebSocketMessage) => void,
  assetId?: string
) {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    if (LIVE_DATA) return

    const client = getWsClient()
    client.subscribe(channel, assetId)

    const off = client.on(channel, (msg) => handlerRef.current(msg))

    return () => {
      off()
      client.unsubscribe(channel, assetId)
    }
  }, [channel, assetId])
}

export function useWsMessage<T = unknown>(
  messageType: string,
  handler: (data: T, msg: WebSocketMessage<T>) => void
) {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    if (LIVE_DATA) return

    const client = getWsClient()
    const off = client.on(messageType, (msg) => {
      handlerRef.current(msg.data as T, msg as WebSocketMessage<T>)
    })

    return off
  }, [messageType])
}
