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
- Check a box when done; add sub-bullets for notes/links as we go.

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
