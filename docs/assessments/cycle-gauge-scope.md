# Market Cycle Gauge — scope (Coins page)

**Status:** Phases 1–2 BUILT (2026-08-29, owner go-ahead) · Phase 3 (Pi Cycle) scoped, awaiting decision
**Origin:** owner request following the crypto-cycle research briefing (artifact
`41f5795c`, 2026-08-29). Related history: RP-3 / RP-4 (rejected-proposals.md),
item 4 (ranking-vs-explanation line), NT11 (fear-greed already feeds the TA
Market Structure panel).

## What it is

A descriptive panel on `/assets` showing **where past-cycle metrics currently
read** — halving clock, drawdown vs. prior cycles, BTC dominance and rotation,
sentiment. It explains the market the reader is already looking at; it makes no
call. The October 2025 top is a documented case of every classic cycle
indicator failing at once, and that fact is rendered ON the panel, not buried
here.

## The line it must not cross (RP-3, item 4)

- **No composite.** A single blended "cycle score" is a verdict in indicator's
  clothing — the exact shape item 4 removed. Each metric renders separately,
  with what it measures and where it currently reads.
- **Descriptive vocabulary only.** "18 months since halving", "−52% from ATH,
  vs −77% at the same point in 2022" — never "top is in", "accumulation zone",
  "buy zone". Enforce like `assetClassProfiles`: a test that fails the suite on
  advice vocabulary in the panel's copy tables.
- **Indicator provenance includes failure.** Any metric with a 2025 miss on its
  record says so at the point of display.

## Components, by data source

| # | Component | Source | Status |
|---|-----------|--------|--------|
| 1 | **Halving clock** — blocks/date to next halving, months since last, position on the 4-year dial | `/live-data/btc-stats` | **Already computed** (`blocksUntilHalving`, `estimatedHalvingDate`) — render only |
| 2 | **Drawdown vs. prior cycles** — BTC's current % from ATH beside each prior bear's max | markets feed (`athChangePct`, live) + new static `cycleHistory.ts` | Live value exists; history table is new hand-maintained reference data → **needs provenance** per house pattern (`*_LAST_VERIFIED`, `ProvenanceNotice`, injectable `now`) |
| 3 | **BTC dominance** | CoinGecko `/global` (keyless; host already `conditional` in sourceTerms — new *path*, no new registry entry needed, but confirm the entry's conditions cover it) | New thin route `/live-data/global` |
| 4 | **Rotation read (30-day variant)** — % of top-50 coins outperforming BTC over 30d | markets feed (already carries 24h/7d/30d changes) | Pure function. **Must be labeled "30-day variant"** — the standard Altcoin Season Index uses 90d, which the feed does not carry; presenting a 30d figure under the standard name would be a different number wearing a known label |
| 5 | **Fear & Greed + 1y sparkline** | `/live-data/fear-greed` | Route exists (NT11); render only |
| 6 | *(optional)* **Pi Cycle Top state** — 111DMA vs 2×350DMA gap | `/live-data/ohlcv?range=BT` (~2.7y daily, keyless) | Computable. If included, it MUST carry: "did not fire at the Oct 2025 top" |

**Out of scope, and why (rendered as an on-panel note, same posture as the
scanner's absent-filters note):** MVRV, NUPL, SOPR need realized-cap data
(Glassnode-tier, paid — this is RP-4's cost objection again); long-term-holder
supply and exchange flows have no free source. An absent metric with a stated
reason beats a proxy wearing its name.

## Build shape

- `lib/data/cycleHistory.ts` — prior cycle peaks/troughs/drawdowns/durations,
  provenance block, pure, tested.
- `lib/utils/cycleMetrics.ts` — rotation-30d %, drawdown comparison, (optional)
  Pi Cycle MAs. Pure, injectable inputs, tested. Vocabulary guard test.
- `/live-data/global/route.ts` — dominance + total mcap, `force-dynamic`,
  failure boundary, typed response.
- `CycleContext` component under `components/assets/`, rendered as a **third
  tab on `/assets`** (`?tab=cycle`, alongside the registry and Reserve
  Monitor) — keeps the registry table clean, deep-linkable, inherits the
  ModuleGate. (Alternative considered: a strip above the table — rejected
  as permanent vertical cost for context users need occasionally.)

## Effort

- **Phase 1** (halving clock, drawdown vs. history, dominance, F&G): ~1–1.5 days.
- **Phase 2** (rotation-30d + cycle history table with provenance): ~0.5–1 day.
- **Phase 3** (optional Pi Cycle): ~0.5 day.

## Owner decisions needed

1. Go/no-go on the tab itself.
2. Include Pi Cycle with its failure disclosure, or omit (my recommendation:
   include — a famous indicator's documented miss is exactly the education
   this panel exists to give).
3. Panel name. Recommendation: **"Cycle Context"** — "context" states the
   posture; "gauge" implies a needle pointing at an answer.
