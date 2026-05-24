import { create } from 'zustand'
import type { Alert, AlertSeverity, AlertType } from '@/types/alert'

interface AlertState {
  alerts: Alert[]
  unreadCount: number
  filters: {
    severity: AlertSeverity | 'all'
    alertType: AlertType | 'all'
    isRead: boolean | null
  }
}

interface AlertActions {
  addAlert: (alert: Alert) => void
  addAlerts: (alerts: Alert[]) => void
  markRead: (id: string) => void
  markAllRead: () => void
  acknowledge: (id: string, acknowledgedBy: string) => void
  removeAlert: (id: string) => void
  setAlerts: (alerts: Alert[]) => void
  setFilter: (key: keyof AlertState['filters'], value: AlertState['filters'][keyof AlertState['filters']]) => void
  resetFilters: () => void
}

const DEFAULT_FILTERS: AlertState['filters'] = {
  severity: 'all',
  alertType: 'all',
  isRead: null,
}

export const useAlertStore = create<AlertState & AlertActions>()((set) => ({
  alerts: [],
  unreadCount: 0,
  filters: DEFAULT_FILTERS,

  addAlert: (alert) =>
    set((state) => {
      const exists = state.alerts.some((a) => a.id === alert.id)
      if (exists) return state
      const alerts = [alert, ...state.alerts].slice(0, 200) // Cap at 200
      return {
        alerts,
        unreadCount: alerts.filter((a) => !a.isRead).length,
      }
    }),

  addAlerts: (newAlerts) =>
    set((state) => {
      const existingIds = new Set(state.alerts.map((a) => a.id))
      const fresh = newAlerts.filter((a) => !existingIds.has(a.id))
      const alerts = [...fresh, ...state.alerts].slice(0, 200)
      return {
        alerts,
        unreadCount: alerts.filter((a) => !a.isRead).length,
      }
    }),

  markRead: (id) =>
    set((state) => {
      const alerts = state.alerts.map((a) =>
        a.id === id ? { ...a, isRead: true } : a
      )
      return { alerts, unreadCount: alerts.filter((a) => !a.isRead).length }
    }),

  markAllRead: () =>
    set((state) => ({
      alerts: state.alerts.map((a) => ({ ...a, isRead: true })),
      unreadCount: 0,
    })),

  acknowledge: (id, acknowledgedBy) =>
    set((state) => ({
      alerts: state.alerts.map((a) =>
        a.id === id
          ? { ...a, isAcknowledged: true, acknowledgedAt: new Date().toISOString(), acknowledgedBy }
          : a
      ),
    })),

  removeAlert: (id) =>
    set((state) => {
      const alerts = state.alerts.filter((a) => a.id !== id)
      return { alerts, unreadCount: alerts.filter((a) => !a.isRead).length }
    }),

  setAlerts: (alerts) =>
    set({
      alerts,
      unreadCount: alerts.filter((a) => !a.isRead).length,
    }),

  setFilter: (key, value) =>
    set((state) => ({
      filters: { ...state.filters, [key]: value },
    })),

  resetFilters: () => set({ filters: DEFAULT_FILTERS }),
}))
