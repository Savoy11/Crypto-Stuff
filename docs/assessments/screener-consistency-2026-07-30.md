# Screener Consistency Pass — 2026-07-30

Owner-backlog item ("Fine-tune all screeners — consistency of filters, defaults, and
result quality"). Scope: Stock Registry (`/equities`), Fund Registry (`/funds`),
Coin Registry (`/assets`), coin discovery, and the two TA screeners. Findings were
verified in source; code changes are limited to the one capability gap found.

## Verified consistent (no change needed)

| Dimension | Finding |
|-----------|---------|
| Null semantics in range filters | Identical by design across Stock and Fund registries: a row with a null value is **excluded** when a range on that dimension is active, included otherwise. Equities inlines the checks (`e.peRatio != null && …`); Funds centralizes them (`inRange()` returns false on null when active). Same observable behavior — a blank P/E can never satisfy a P/E screen, matching the documented negative-P/E→null decision. |
| Clear/reset affordance | All three registries have one (equities "Clear all", funds `clearFilters`, coins `resetFilters` from the store). |
| Empty-result state | Identical copy pattern on all three: "No {equities\|funds\|coins} match the current filters." |
| Pagination interaction | All three reset to page 0 on any filter/sort change and clamp `safePage`; quotes fetch for the visible page only. |
| Filter persistence | Consistent in effect: none is durable. Coins holds filters in `useAssetStore` (in-memory Zustand, no `persist` middleware — survives in-app navigation but not reload); equities/funds hold local state. Not unified further on purpose: the store buys coins nothing durable, and adding localStorage persistence to screeners is a product decision (stale hidden filters confuse more than they help). |

## Gap found and fixed: URL deep-linking

No registry screener could be linked in a filtered state (T7's wish list flagged this
for equities; the coins page already deep-links only its `?tab=`). Fixed with one
shared hook, `src/lib/hooks/useScreenerUrl.ts`, wired into both:

- `/equities?sector=technology&peMax=20&sort=pe&dir=asc` — sector, search, sort,
  and all six range bounds.
- `/funds?type=etf&cat=sector&r_expense=:0.2&sort=expense` — all seven selects,
  curated toggle, search, sort, and each of the nine range dimensions as one
  compact `r_<key>=min:max` param.

Design constraints the hook encodes (they are why this isn't `useSearchParams`):
- **No `useSearchParams`** — it demands a Suspense boundary at build time, the exact
  failure class that once broke `next build` on the TA page. The hook reads
  `location.search` once on mount and writes with `history.replaceState` (no
  navigation, no Suspense requirement).
- **Read-in-effect, not in initial state** — first paint renders defaults and params
  apply one tick later, avoiding SSR hydration mismatches on prerendered pages.
- **Untouched foreign params** — only keys the screener declares are written or
  deleted, so page-owned params like `/assets?tab=reserves` survive.
- **Minimal URLs** — values equal to their default are removed, so an unfiltered
  screen has a clean URL.
- Incoming values are validated against the known unions (sector ids, sort keys,
  category ids…) before being applied; junk params are ignored.

Coins was deliberately left on its store: its `?tab=` handling already uses
`useSearchParams` inside the existing component structure, and moving its store
state into URLs is a larger refactor than the consistency win justifies. If wanted
later, the same hook applies.

## Noted, not changed

- **TA screeners differ by design.** Crypto TA scans every tracked asset on a
  selectable timeframe with auto-refresh; equity TA screens a bounded 24-large-cap
  list (one OHLCV fetch per symbol — the bound is a fan-out budget, documented in
  code). Unifying them means either unbounded equity fetches or crippling the
  crypto side; neither is a consistency win.
- **Coin discovery** is a scored-candidate surface, not a range screener — its
  filters (store-backed) follow the coins pattern.
- **Verification limit:** URL application is client-side; this container verified
  the pages render (200) with deep-link params and that types/lint/build pass, but
  a real browser click-through should confirm filter application end-to-end on the
  owner's machine.
