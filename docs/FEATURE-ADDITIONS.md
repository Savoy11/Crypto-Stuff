# Feature Additions — Equities & Funds Build (2026-07-07)

Per the standing instruction ("if you determine there is a feature worth adding
you have permission to add it and provide a document noting the addition"),
this documents everything added beyond the explicitly requested Equities and
ETF/Mutual-Fund modules, and why.

---

## 1. Suite module registry + entitlement system (Phase 0, brought forward)

**What:** `src/lib/modules/registry.ts` defines the module contract from
docs/ROADMAP.md (core / crypto / equities / funds). The sidebar now renders
from this registry in labelled sections, drag-reorder works per section, and
`useEntitlementStore` + `ModuleGate` let modules be switched off — a disabled
module disappears from navigation and its pages show an unlock notice.
A **Suite Modules** panel at the top of Integrations toggles them.

**Why:** The whole "sold together or separately" strategy hangs on modules
being real boundaries, not just folders. Building Equities/Funds *inside* the
module system from day one means they never need retrofitting. Entitlements
are client-side placeholders that become license-driven when auth/billing land
(Phase 6).

## 2. Fee Drag Analyzer (fund detail pages)

**What:** Every fund page projects what its expense ratio costs over 10/20/30
years versus a 0.03% index fund, with adjustable investment amount and gross
return. Pure client-side math (`computeFeeDrag` in `fundCatalog.ts`).

**Why:** Expense-ratio compounding is the single most decision-relevant fact
about a fund and the one every issuer page buries. It turns the Fund Registry
from a quote table into an advice tool — the same educational stance as the
Celsius warning on the Staking page.

## 3. 52-Week Range indicator (equity & fund detail pages)

**What:** A gradient bar showing where the current price sits between the
52-week low and high, computed from the same 1-year history the chart already
fetches (no extra request).

**Why:** Cheap to derive, high information density, standard on institutional
terminals.

## 4. Market news with sentiment tagging (`/live-data/market-news`)

**What:** Multi-feed RSS route (Yahoo Finance per-ticker + Yahoo/MarketWatch/
CNBC general) with keyword sentiment scoring and dedupe, mirroring the crypto
news route's architecture. Surfaced on both detail page types.

**Why:** News-with-sentiment is a core CAEP feature in the crypto module;
the equities module would feel like a different product without it.

## 5. Multi-source quote ladder with honest fallbacks

**What:** `/live-data/security-quotes` tries FMP (if `FMP_API_KEY` is set) →
Yahoo Finance spark (keyless) → Stooq CSV (keyless) → static catalog reference
prices. Reference-sourced numbers are always labelled `ref` in the UI, and
KPIs that need live data say "requires live quotes" instead of faking values.

**Why:** Follows the repo's strict-live convention (`LiveUnavailable`): never
fabricate, always render. Also means the pages work offline and get better
automatically when the user adds a free FMP key.

## 6. Production build fix (pre-existing bug)

**What:** `/technical-analysis` used `useSearchParams()` without a Suspense
boundary, which made `next build` fail (dev mode never surfaces this). Wrapped
the page body in `<Suspense>`.

**Why:** Blocking — a clean production build was needed to validate this work,
and it will block any future deployment (Roadmap Phase 6).

---

## Deliberately NOT added yet (candidates for next session)

- **Live fundamentals** (P/E, market cap, dividend yield from a feed) — the
  catalogs carry labelled reference values; a free FMP key upgrades market cap
  via the quote ladder today. A fundamentals route is the natural next step.
- **Equity screener metrics** (YTD %, 52-week % in the registry table) —
  needs one history call per symbol; wants a small server-side cache first.
- **`/api/v1` + MCP tools for equities/funds** — the agent surface should
  cover the new modules (`/api/v1/equities`, `get_stock_quotes`, …). Straight-
  forward, but left out to keep this changeset reviewable.
- **Watchlist/portfolio integration** — cross-module holdings need the
  Phase 0 database work (`instruments` core) from docs/ROADMAP.md; wiring
  equities into the current crypto-shaped watchlist would create the exact
  coupling the module rules forbid.
