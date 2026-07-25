# CAEP (Crypto-Stuff) — Master Checklist

The governing checklist for the **CAEP** project: a single place to track initiatives,
priorities, and progress. Add to it, check things off, re-prioritise. This is a living doc.

**Last updated:** 2026-07-25

## Scope & independence

- **This checklist governs CAEP (Crypto-Stuff) only.** Chronolens is a **separate project with
  its own master checklist**; the two are developed **independently** — no shared code, no
  runtime coupling. Any future cross-project connection would be a separate, explicit decision,
  not something assumed or tracked here.
- **Related CAEP docs:** `docs/ROADMAP.md`, `docs/TASK-QUEUE.md`, `DATA-AVAILABILITY.md`,
  and the project guide in `CLAUDE.md`. This checklist tracks *initiative-level work*; those hold
  the detailed roadmap, task queue, and data-status source of truth.

## Legend

- **Priority:** `P0` = do first / unblocks others · `P1` = core value · `P2` = later / nice-to-have
- Each backlog item is rated on three lenses: **Importance** (impact if done / cost if not),
  **Efficiency** (ROI — value ÷ effort), **Practicality** (readiness — dependencies, risk, is it
  already built). Priority is the net of the three.
- Check a box when done; add sub-bullets for notes/links as we go.

---

## Project state & prioritized backlog (from PR review — 2026-07-25)

**Where CAEP stands.** Phase-1 task queue (`docs/TASK-QUEUE.md`: T1–T12, R1/R2) has **landed**
— live-data audit, shared TA/backtest math verified, canonical risk scale, Coins registry,
accuracy audits. The **Macro Markets module** (commodities / currencies / bonds & rates) shipped
2026-07-21, which covers most of Phase-2 item 1. Live-data audit baseline: **60 REAL / 8 FALLBACK
/ 3 UNCONFIGURED / 1 EMPTY / 0 FAIL**. Of 39 PRs, only three are open: **#38, #21, #39 (this doc)**.

Prioritized outstanding work, most-important first:

- [ ] `P0` **Merge #38 — fix the red Frontend Check CI build.** *Importance:* critical — `next
      build` fails on `main` (illegal route exports in `macro-news` + eager `DATABASE_URL` at
      build time), so every deploy/PR is blocked. *Efficiency:* very high — fix is written and
      verified (14/14 tests, `next build` exit 0). *Practicality:* ready to merge now. **Do this
      first.**
- [ ] `P0` **Resolve #21's status** (Wave-0 live-data audit + the task-queue doc). *Importance:*
      high — it carries the audit and 6 bug fixes. *Practicality:* its fixes may already have
      re-landed via later PRs; **check whether it's superseded → close, or still needed → merge.**
      Don't leave it dangling.
- [ ] `P1` **CI durability.** Red CI is a recurring theme (#22 "chronic CI red", #38). Add
      guardrails so the two #38 failure modes can't regress (route-export lint rule; build-time
      `DATABASE_URL` placeholder in CI). *Importance:* high · *Efficiency:* med · *Practicality:* high.
- [ ] `P1` **F3 — `fund-universe` performance** (11 s / 14 MB payload → pagination or server-side
      filtering). *Importance:* med-high (user-facing latency) · *Efficiency:* med · *Practicality:*
      high (self-contained).
- [ ] `P1` **F4 — dead `chart` route** that fabricates OHLC (`open==high==low==close`).
      **Verify consumers first** (Compare may reference `/live-data/chart`), then delete or replace.
      *Importance:* med (data integrity) · *Efficiency:* high · *Practicality:* high after the consumer check.
- [ ] `P2` **F2 — `stock-social` recency starvation** (Reddit gets 0 slots at `limit ≤ 30`).
      **Product decision on the real-time-vs-forum blend comes before code.** *Importance:* low-med ·
      *Practicality:* blocked on the decision.
- [ ] `P2` **F1 — `Promise.allSettled` convention audit.** Mostly resolved — the 2026-07-22 pass
      found 7 of 8 flagged routes were already correct as sequential fallback ladders. *Reduce to:*
      document the classification; only `config`/`wallet/exchange` may warrant a real change.
- [ ] `P2` **Phase 2 — Options & futures support.** The larger remaining roadmap item (commodities/
      bonds/fiat already shipped via Macro). New primitives the app has never modeled (Greeks, IV,
      expiries, chains); `lib/risk/profiles/optionsTrade.ts` is an existing foundation to review.
      *Importance:* med (roadmap) · *Efficiency:* low (large) · *Practicality:* low — **needs scoping first.**

> The **On-chain event data** initiative below is a new P1 that slots alongside F3/F4 — a
> discrete, mostly-free build rather than debt cleanup.

---

## Initiative: On-chain event data in CAEP · `P1`

**Idea.** CAEP already surfaces crypto risk, reserves, staking, and network fees from live
sources. This initiative adds native **on-chain *event* data** — network milestones, governance,
stablecoin mints/burns, exploits — as first-class CAEP data, surfaced on existing pages and via
the `/api/v1/` agent API. Built entirely inside CAEP using its existing patterns; it does not
depend on any other project.

**Fit with CAEP architecture.**
- New route handler `src/app/live-data/onchain-events/route.ts` following the house rules:
  `export const dynamic = 'force-dynamic'`, `next: { revalidate: N }` per fetch, a typed exported
  interface, and a failure boundary that preserves partial results (`Promise.allSettled` for
  independent fetches, per-leg try/catch for fallback ladders).
- Events reuse CAEP's live-data → React Query pattern; no new client-side fetching.
- Keyless/free sources first, consistent with the existing `/live-data/*` ethos (CoinGecko,
  mempool.space, DefiLlama are already in use).

### Open decisions

- [ ] `P0` **Surface(s):** a dedicated events view vs. enriching existing pages (Reserves,
      Alerts, Coin Detail) vs. both. (Leaning: enrich existing pages first — lower lift, higher
      context.)
- [ ] `P0` **Source set:** which keyless/free providers for v1 (mempool.space, Etherscan free,
      Snapshot, DefiLlama). Confirm none require a paid tier for the chosen event classes.
- [ ] `P1` **Address label source:** hand-maintained provenance file (matches CAEP's existing
      hand-maintained data-file discipline, e.g. `transferFees.ts`) vs. Etherscan labels.
- [ ] `P1` **Finality policy:** confirmation lag before an event is shown, to avoid reorg
      orphans.

### Phase 0 — Live-data route + free spike · `P0`

- [ ] `P0` Add `src/app/live-data/onchain-events/route.ts` with a typed `OnChainEvent` interface,
      `force-dynamic`, and a resilient multi-fetch boundary.
- [ ] `P0` **BTC halvings + ETH milestones** (keyless: mempool.space / Blockstream Esplora) as the
      first event classes — long-finalized, zero reorg risk.
- [ ] `P0` **One stablecoin's mints/burns** (USDC `Transfer` via Etherscan free key), curated to
      material sizes.
- [ ] `P0` Run `npm run audit` and read the **REAL vs FALLBACK** classification — confirm the
      route serves real data, not a static catalog.

### Phase 1 — Surface in the UI · `P1`

- [ ] `P1` **Coin Detail** (`/assets/[id]`): plot on-chain event markers on the existing OHLCV
      price chart (halving/mint/burn/exploit pins).
- [ ] `P1` **Reserves** (`/reserves`): show stablecoin mint/burn events alongside DefiLlama supply.
- [ ] `P1` **Alerts** (TopBar bell): add on-chain triggers (large mint/burn, exploit) to the
      existing depeg/price-move alert stream.
- [ ] `P1` **Address labeling** map (provenance-tracked, `lib/data/` style) for issuers/treasuries.
- [ ] `P2` **Reorg safety:** ingest/display only finalized blocks.

### Phase 2 — Agent API + MCP · `P1`/`P2`

- [ ] `P1` Expose events via `GET /api/v1/onchain-events` with CORS + `updatedAt`/`source`
      metadata (CAEP's v1 conventions; import from `src/app/api/_cors.ts`).
- [ ] `P1` Add an `get_onchain_events` tool in `src/lib/agents/tools.ts` (crypto toolset) so the
      research agents can read the same route the UI reads — one source of truth.
- [ ] `P2` Add a matching tool to the standalone `mcp-server/` (calls the new v1 endpoint).
- [ ] `P2` Update `DATA-AVAILABILITY.md` with the new route's live/partial status.

### Cross-cutting for this initiative

- [ ] `P0` **Licensing:** raw chain facts + public explorers only; avoid paid-aggregator TOS
      (Dune/Nansen) in any surface. Keep the free-tier posture the rest of `/live-data/*` uses.
- [ ] `P1` **Cost monitoring:** respect free-tier limits (Etherscan 5/s, 100k/day) with the
      route's revalidate windows; no per-pageview external calls.
- [ ] `P1` **Audit honesty:** every new route must pass `npm run audit` as REAL, not FALLBACK —
      a 200 carrying static data is the failure mode to catch.

### Reference — historical depth (how far back)

| Chain / data | Reaches back to | Notes |
| --- | --- | --- |
| Bitcoin (genesis) | **2009-01-03** | Absolute floor — nothing on-chain predates this |
| Ethereum (genesis) | **2015-07-30** | Frontier launch |
| Most DeFi / governance | **~2020+** | Protocol-dependent |

Within these bounds data is complete and gap-free (immutable chain); the constraint is backfill
throughput, not missing data.

### Reference — cost (target: $0 recurring for v1)

| Source | Depth | Cost | Key |
| --- | --- | --- | --- |
| mempool.space / Blockstream Esplora (BTC) | 2009 | free | keyless |
| Etherscan API family (ETH + L2s) | 2015 | free tier 5/s, 100k/day | free key |
| Blockscout | per-chain genesis | free/open | keyless |
| Snapshot GraphQL (governance) | ~2020+ | free | keyless |
| DefiLlama | protocol-dependent | free | keyless (already used) |
| Dune / Nansen / Alchemy paid | genesis, decoded | **$$** | paid — later only |

---

## Backlog / later ideas

- [ ] Governance events (Snapshot/Tally) surfaced on a per-protocol basis.
- [ ] Exploit/hack timeline correlated with price drops on Coin Detail.
- [ ] Whale / large-transfer events (needs strong relevance filtering to avoid noise).
- [ ] Staking on-chain milestones (beacon deposits, validator counts) — ties into `/staking`.
- [ ] Multi-chain expansion (L2s, Solana) once the EVM pattern is proven.

## Other initiatives

_Add new CAEP initiatives here as they come up — this doc is meant to govern the whole project.
For detailed roadmap items and the task queue, see `docs/ROADMAP.md` and `docs/TASK-QUEUE.md`._
