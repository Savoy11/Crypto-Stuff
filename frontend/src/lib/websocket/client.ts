import type { WebSocketMessage } from '@/types/api'
import { WS_BASE_URL, WS_RECONNECT_INITIAL, WS_RECONNECT_MAX, WS_HEARTBEAT_INTERVAL } from '@/lib/constants'

type MessageHandler = (message: WebSocketMessage) => void

export type WsStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

interface WsClientOptions {
  onStatusChange?: (status: WsStatus) => void
  onError?: (err: Event) => void
  getToken?: () => string | null
}

export class WebSocketClient {
  private ws: WebSocket | null = null
  private handlers: Map<string, Set<MessageHandler>> = new Map()
  private reconnectDelay = WS_RECONNECT_INITIAL
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private manualClose = false
  private status: WsStatus = 'disconnected'
  private subscriptions: Set<string> = new Set()
  private options: WsClientOptions

  constructor(options: WsClientOptions = {}) {
    this.options = options
  }

  get currentStatus(): WsStatus {
    return this.status
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return
    }

    this.manualClose = false
    this.setStatus('connecting')

    const token = this.options.getToken?.()
    const url = token ? `${WS_BASE_URL}?token=${encodeURIComponent(token)}` : WS_BASE_URL

    try {
      this.ws = new WebSocket(url)
    } catch {
      this.setStatus('error')
      this.scheduleReconnect()
      return
    }

    this.ws.onopen = () => {
      this.reconnectDelay = WS_RECONNECT_INITIAL
      this.setStatus('connected')
      this.startHeartbeat()
      // Re-subscribe to channels after reconnect
      this.subscriptions.forEach((channel) => {
        this.sendRaw({ type: 'subscribe', channel, data: null, timestamp: new Date().toISOString() })
      })
    }

    this.ws.onmessage = (event: MessageEvent<string>) => {
      try {
        const msg = JSON.parse(event.data) as WebSocketMessage
        if (msg.type === 'pong') return
        this.dispatch(msg)
      } catch {
        // ignore malformed messages
      }
    }

    this.ws.onerror = (err) => {
      this.setStatus('error')
      this.options.onError?.(err)
    }

    this.ws.onclose = () => {
      this.stopHeartbeat()
      if (!this.manualClose) {
        this.setStatus('disconnected')
        this.scheduleReconnect()
      }
    }
  }

  disconnect() {
    this.manualClose = true
    this.stopHeartbeat()
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.setStatus('disconnected')
  }

  subscribe(channel: string, assetId?: string) {
    const channelKey = assetId ? `${channel}:${assetId}` : channel
    this.subscriptions.add(channelKey)
    if (this.status === 'connected') {
      this.sendRaw({ type: 'subscribe', channel: channelKey, data: { assetId }, timestamp: new Date().toISOString() })
    }
  }

  unsubscribe(channel: string, assetId?: string) {
    const channelKey = assetId ? `${channel}:${assetId}` : channel
    this.subscriptions.delete(channelKey)
    if (this.status === 'connected') {
      this.sendRaw({ type: 'unsubscribe', channel: channelKey, data: null, timestamp: new Date().toISOString() })
    }
  }

  on(messageType: string, handler: MessageHandler): () => void {
    if (!this.handlers.has(messageType)) {
      this.handlers.set(messageType, new Set())
    }
    this.handlers.get(messageType)!.add(handler)
    return () => {
      this.handlers.get(messageType)?.delete(handler)
    }
  }

  private dispatch(message: WebSocketMessage) {
    const handlers = this.handlers.get(message.type)
    handlers?.forEach((h) => h(message))
    // Also dispatch to wildcard '*' listeners
    const wildcardHandlers = this.handlers.get('*')
    wildcardHandlers?.forEach((h) => h(message))
  }

  private sendRaw(message: WebSocketMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message))
    }
  }

  private startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      this.sendRaw({ type: 'ping', channel: 'system', data: null, timestamp: new Date().toISOString() })
    }, WS_HEARTBEAT_INTERVAL)
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private scheduleReconnect() {
    this.reconnectTimer = setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, WS_RECONNECT_MAX)
      this.connect()
    }, this.reconnectDelay)
  }

  private setStatus(status: WsStatus) {
    this.status = status
    this.options.onStatusChange?.(status)
  }
}

// Singleton
let globalClient: WebSocketClient | null = null

export function getWsClient(options?: WsClientOptions): WebSocketClient {
  if (!globalClient) {
    globalClient = new WebSocketClient(options)
  }
  return globalClient
}
