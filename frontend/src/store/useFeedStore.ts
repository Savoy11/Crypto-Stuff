import { create } from 'zustand'

// The app is live-only over the /live-data REST routes and opens no socket.
// This store used to be `useStreamStore` and carried a websocket vocabulary
// (heartbeat, subscribed channels, stream errors) left over from the backend
// socket that the M8 sweep removed. Every one of those fields was dead, and the
// one surviving field — connection status — was written by a shim that set
// 'connected' unconditionally, so the Sidebar and StatusBar indicators were
// green on every screen and could never report a degraded feed.
//
// What replaces it: status derived from React Query's cache, which is the thing
// that actually fetches data. See lib/feed/useFeedStatus.ts.

/**
 * How the app's data feeds are doing right now, across every query the user's
 * current screen has mounted.
 *
 * - `connecting` — queries are in flight and none has returned yet.
 * - `live`       — everything mounted has data.
 * - `degraded`   — some feeds have data, others are failing. This is the state
 *                  the old shim could never express, and it is the common one:
 *                  a single geo-blocked or rate-limited provider does not take
 *                  the whole app down.
 * - `offline`    — everything mounted is failing.
 */
export type FeedStatus = 'connecting' | 'live' | 'degraded' | 'offline'

interface FeedState {
  status: FeedStatus
  /** Mounted queries currently holding data. */
  okCount: number
  /** Mounted queries currently in an error state. */
  failedCount: number
}

interface FeedActions {
  setFeedState: (next: FeedState) => void
}

export const useFeedStore = create<FeedState & FeedActions>()((set) => ({
  status: 'connecting',
  okCount: 0,
  failedCount: 0,

  setFeedState: (next) =>
    set((prev) =>
      // Cheap equality guard: the query cache emits on every fetch transition,
      // and re-setting an identical object would re-render both indicators
      // several times a second on a busy page.
      prev.status === next.status &&
      prev.okCount === next.okCount &&
      prev.failedCount === next.failedCount
        ? prev
        : next,
    ),
}))
