# Transfer-fee refresh — agent draft, 2026-08-20 (S3)

**Status: NO VALUES VERIFIED — this pass produced a re-check queue, not a diff.**

The owner chose agent-drafted + owner-approved refreshes. Four research agents
swept the 16 highest-traffic exchanges in parallel. The result is uniform and
worth stating plainly: **this session's egress proxy hard-blocks every exchange
domain and every fee aggregator** — not exchange geo-blocking, which was the
expected failure; nothing was even reachable enough to be geo-blocked. Under
the never-from-memory rule, zero rows could be marked CONFIRMED or CHANGED.
All 396 in-scope rows are UNVERIFIABLE from this environment.

**Consequence:** the verification pass runs on the owner's machine — the same
conclusion the IP-dependence rule already reaches for data-availability audits.
`npm run fee-worksheet` generates the checklist (withdrawals + the new
trading-fee section). The agents' work below is still valuable: it structured
the job and surfaced a prioritized re-check queue from search snippets.

**Nothing in `transferFees.ts` was changed and `TRANSFER_FEES_LAST_VERIFIED`
was not bumped.**

## Priority re-check queue (search-snippet leads — NOT observations)

| Priority | Exchange | Lead | Our value at risk |
|---|---|---|---|
| 1 | Bitfinex | Reportedly moved to **0% / 0% trading fees on 2025-12-17** | Seeded 0.1/0.2 — if true, badly wrong |
| 2 | Hyperliquid | Our maker/taker looks like a **$25M+ volume tier, not base** | Seeded 0.01/0.035 |
| 3 | Coinbase | Entry tier may now be **0.60/1.20% (Intro 1)** | Seeded 0.4/0.6 |
| 4 | Gate.io | Fee-structure update dated **2026-04-09** | Whole fee section |
| 5 | Kraken | ERC-20 withdrawal fees may be **dynamic**, no note in table | Static values |
| 6 | Binance + others | **MATIC → POL migration** | Table still says `matic` |
| 7 | KuCoin | USDT/USDC ERC-20 withdrawal fees flagged | Two rows |
| 8 | Gemini | 4 "legacy free-tier" caveat rows still open | Withdrawal rows |

## Owner-machine shortcuts the agents found

- **Bybit:** `GET api.bybit.com/v5/asset/coin/query-info` returns the complete
  withdrawal-fee table, keyless — one request verifies all 36 rows.

## Per-exchange agent reports (verbatim)

---

# Fee-Verification Report — Group A (Binance, Coinbase, Kraken)

Subproject S3 transfer-fee refresh. Date: 2026-08-20.
Table source: `frontend/src/lib/data/transferFees.ts` (EXCHANGES + SPOT_TRADING_FEES).

**Environment finding (applies to all three exchanges):** this session egresses through a
network proxy that **hard-blocks every fee-schedule host attempted** — the block is at the
proxy (`EGRESS_BLOCKED`), not an exchange geo-block, so no HTTP status from the exchanges
themselves was ever observed. Blocked hosts, all returning `EGRESS_BLOCKED` from the proxy:

- `www.binance.com` (fee/cryptoFee)
- `www.coinbase.com` (advanced-fees), `help.coinbase.com`, `docs.cloud.coinbase.com`
- `www.kraken.com` (features/fee-schedule), `support.kraken.com`, `api.kraken.com`
- Secondary aggregators: `withdrawalfees.com`, `coinmarketfees.com`

WebSearch worked, but per the hard rules its AI-summarized snippets are not fetched pages,
so **no value below is marked CONFIRMED or CHANGED**. Every row is UNVERIFIABLE with reason
"egress proxy blocks host". Search corroboration is recorded in Notes only, clearly labeled
as secondhand. **This verification must be re-run from the owner's machine** (same rule as
the data audits: availability results are IP/network-dependent).

---

## Binance

Reachability: `https://www.binance.com/en/fee/cryptoFee` → `EGRESS_BLOCKED` at the proxy (the documented 451 geo-block was never even reached). No Binance host reachable.

| Coin | Network | Table value (fee / min, enabled W/D, note) | Observed value | Source URL | Verdict |
|---|---|---|---|---|---|
| BTC | bitcoin | 0.0002 / 0.001, W✓ D✓ | — | — | UNVERIFIABLE (proxy blocks host) |
| BTC | bep20 | 0.000017 / 0.0001, W✓ D✓ | — | — | UNVERIFIABLE |
| ETH | erc20 | 0.0008 / 0.003, W✓ D✓, "Dynamic fee — adjusts with gas (re-verified 2026-07)" | — | — | UNVERIFIABLE |
| ETH | arbitrum | 0.00025 / 0.001, W✓ D✓ | — | — | UNVERIFIABLE |
| ETH | optimism | 0.00025 / 0.001, W✓ D✓ | — | — | UNVERIFIABLE |
| ETH | bep20 | 0.00025 / 0.001, W✓ D✓ | — | — | UNVERIFIABLE |
| USDT | erc20 | 3.5 / 20, W✓ D✓, "Dynamic — gas-dependent, $3.5–5 typical (re-verified 2026-07)" | — | — | UNVERIFIABLE |
| USDT | trc20 | 1.0 / 10, W✓ D✓ | — | — | UNVERIFIABLE |
| USDT | bep20 | 0.8 / 10, W✓ D✓ | — | — | UNVERIFIABLE |
| USDT | solana | 1.0 / 10, W✓ D✓ | — | — | UNVERIFIABLE |
| USDT | polygon | 1.0 / 10, W✓ D✓ | — | — | UNVERIFIABLE |
| USDT | arbitrum | 0.8 / 10, W✓ D✓ | — | — | UNVERIFIABLE |
| USDT | avalanche | 1.0 / 10, W✓ D✓ | — | — | UNVERIFIABLE |
| USDC | erc20 | 0.26 / 20, W✓ D✓ | — | — | UNVERIFIABLE |
| USDC | bep20 | 0.29 / 10, W✓ D✓ | — | — | UNVERIFIABLE |
| USDC | solana | 0.29 / 10, W✓ D✓ | — | — | UNVERIFIABLE |
| USDC | polygon | 0.29 / 10, W✓ D✓ | — | — | UNVERIFIABLE |
| USDC | arbitrum | 0.26 / 10, W✓ D✓ | — | — | UNVERIFIABLE |
| USDC | avalanche | 0.29 / 10, W✓ D✓ | — | — | UNVERIFIABLE |
| BNB | bep20 | 0.0008 / 0.01, W✓ D✓ | — | — | UNVERIFIABLE |
| SOL | solana | 0.01 / 0.1, W✓ D✓ | — | — | UNVERIFIABLE |
| DAI | erc20 | 3.5 / 30, W✓ D✓ | — | — | UNVERIFIABLE |
| DAI | bep20 | 1.0 / 10, W✓ D✓ | — | — | UNVERIFIABLE |
| DAI | polygon | 1.0 / 10, W✓ D✓ | — | — | UNVERIFIABLE |
| XRP | xrpl | 0.25 / 10, W✓ D✓, "Destination tag required" | — | — | UNVERIFIABLE |
| LTC | litecoin | 0.001 / 0.002, W✓ D✓ | — | — | UNVERIFIABLE |
| TRX | trc20 | 1.0 / 2, W✓ D✓ | — | — | UNVERIFIABLE |
| DOGE | dogecoin | 5.0 / 10, W✓ D✓ | — | — | UNVERIFIABLE |
| MATIC | polygon | 0.1 / 20, W✓ D✓ | — | — | UNVERIFIABLE |
| MATIC | erc20 | 0.8 / 20, W✓ D✓ | — | — | UNVERIFIABLE |
| MATIC | bep20 | 0.8 / 20, W✓ D✓ | — | — | UNVERIFIABLE |
| AVAX | avalanche | 0.01 / 0.1, W✓ D✓ | — | — | UNVERIFIABLE |
| AVAX | erc20 | 0.25 / 0.5, W✓ D✓ | — | — | UNVERIFIABLE |
| AVAX | bep20 | 0.01 / 0.1, W✓ D✓ | — | — | UNVERIFIABLE |
| ADA | cardano | 1.0 / 2, W✓ D✓ | — | — | UNVERIFIABLE |
| DOT | polkadot | 0.1 / 1, W✓ D✓ | — | — | UNVERIFIABLE |
| DOT | bep20 | 0.05 / 0.5, W✓ D✓ | — | — | UNVERIFIABLE |
| ATOM | cosmos | 0.005 / 0.1, W✓ D✓, "Memo required" | — | — | UNVERIFIABLE |
| ATOM | bep20 | 0.005 / 0.1, W✓ D✓ | — | — | UNVERIFIABLE |
| LINK | erc20 | 0.27 / 0.5, W✓ D✓ | — | — | UNVERIFIABLE |
| LINK | bep20 | 0.01 / 0.2, W✓ D✓ | — | — | UNVERIFIABLE |
| TON | ton_network | 0.01 / 0.1, W✓ D✓ | — | — | UNVERIFIABLE |
| TON | bep20 | 0.01 / 0.1, W✓ D✓ | — | — | UNVERIFIABLE |
| SHIB | erc20 | 200,000 / 400,000, W✓ D✓ | — | — | UNVERIFIABLE |
| SHIB | bep20 | 100,000 / 200,000, W✓ D✓ | — | — | UNVERIFIABLE |
| UNI | erc20 | 0.14 / 0.2, W✓ D✓ | — | — | UNVERIFIABLE |
| UNI | bep20 | 0.05 / 0.1, W✓ D✓ | — | — | UNVERIFIABLE |
| NEAR | near_network | 0.01 / 0.1, W✓ D✓ | — | — | UNVERIFIABLE |
| NEAR | bep20 | 0.01 / 0.1, W✓ D✓ | — | — | UNVERIFIABLE |
| ARB | arbitrum | 0.5 / 1, W✓ D✓ | — | — | UNVERIFIABLE |
| ARB | erc20 | 0.79 / 1.5, W✓ D✓ | — | — | UNVERIFIABLE |

### Spot trading fees
| | Table value | Observed value | Source URL | Verdict |
|---|---|---|---|---|
| Maker | 0.1% | — | — | UNVERIFIABLE (proxy blocks host) |
| Taker | 0.1% | — | — | UNVERIFIABLE |

### Notes
- No delistings or new networks could be checked — no Binance page was reachable.
- Structural: table still uses `matic` (MATIC); Binance completed the MATIC→POL migration industry-wide in 2024–25 — the refresh should check whether Binance now lists POL only, which would make this row a rename, not just a fee update. Could not verify from here.
- ERC-20 rows carry "Dynamic" notes — on re-run, record the displayed value and mark CONFIRMED-DYNAMIC if within the noted $3.5–5 range (USDT) / gas-tracking behavior (ETH).

---

## Coinbase

Reachability: `www.coinbase.com/advanced-fees`, `help.coinbase.com/.../fees`, `docs.cloud.coinbase.com/exchange/docs/fees` — all `EGRESS_BLOCKED` at the proxy. No Coinbase host reachable.

| Coin | Network | Table value (fee / min, enabled W/D, note) | Observed value | Source URL | Verdict |
|---|---|---|---|---|---|
| BTC | bitcoin | 0.000025 / 0.0001, W✓ D✓, "Network-fee pass-through (no Coinbase markup)" | — | — | UNVERIFIABLE (proxy blocks host) |
| ETH | erc20 | 0.001 / 0.001, W✓ D✓, "Network-fee pass-through — varies with gas" | — | — | UNVERIFIABLE |
| ETH | base | 0.0001 / 0.001, W✓ D✓ | — | — | UNVERIFIABLE |
| ETH | polygon | 0.0003 / 0.001, W✓ D✓ | — | — | UNVERIFIABLE |
| USDC | erc20 | 0 / 1, W✓ D✓, "No exchange fee — you pay only the network gas" | — | — | UNVERIFIABLE |
| USDC | polygon | 0 / 1, W✓ D✓, "No exchange fee" | — | — | UNVERIFIABLE |
| USDC | solana | 0 / 1, W✓ D✓, "No exchange fee" | — | — | UNVERIFIABLE |
| USDC | arbitrum | 0 / 1, W✓ D✓, "No exchange fee" | — | — | UNVERIFIABLE |
| USDC | base | 0 / 1, W✓ D✓, "No exchange fee" | — | — | UNVERIFIABLE |
| USDC | avalanche | 0 / 1, W✓ D✓, "No exchange fee" | — | — | UNVERIFIABLE |
| USDT | erc20 | 2.5 / 25, W✓ D✓ | — | — | UNVERIFIABLE |
| USDT | trc20 | 1.0 / 10, W✓ D✓ | — | — | UNVERIFIABLE |
| USDT | solana | 1.0 / 10, W✓ D✓ | — | — | UNVERIFIABLE |
| SOL | solana | 0.01 / 0.05, W✓ D✓ | — | — | UNVERIFIABLE |
| DAI | erc20 | 3.0 / 20, W✓ D✓ | — | — | UNVERIFIABLE |
| DAI | polygon | 1.0 / 10, W✓ D✓ | — | — | UNVERIFIABLE |
| XRP | xrpl | 0.25 / 1, W✓ D✓, "Destination tag required" | — | — | UNVERIFIABLE |
| LTC | litecoin | 0.001 / 0.001, W✓ D✓ | — | — | UNVERIFIABLE |
| DOGE | dogecoin | 1.0 / 1, W✓ D✓ | — | — | UNVERIFIABLE |
| MATIC | polygon | 0.1 / 1, W✓ D✓ | — | — | UNVERIFIABLE |
| MATIC | erc20 | 0.5 / 1, W✓ D✓ | — | — | UNVERIFIABLE |
| AVAX | avalanche | 0.01 / 0.1, W✓ D✓ | — | — | UNVERIFIABLE |
| ADA | cardano | 0.1 / 1, W✓ D✓ | — | — | UNVERIFIABLE |
| ATOM | cosmos | 0.01 / 0.1, W✓ D✓, "Memo required" | — | — | UNVERIFIABLE |
| LINK | erc20 | 0.3 / 0.5, W✓ D✓ | — | — | UNVERIFIABLE |
| UNI | erc20 | 0.3 / 0.5, W✓ D✓ | — | — | UNVERIFIABLE |
| NEAR | near_network | 0.01 / 0.5, W✓ D✓ | — | — | UNVERIFIABLE |
| ARB | arbitrum | 0.1 / 1, W✓ D✓ | — | — | UNVERIFIABLE |

### Spot trading fees
| | Table value | Observed value | Source URL | Verdict |
|---|---|---|---|---|
| Maker | 0.4% ("Advanced Trade, entry tier") | — | — | UNVERIFIABLE (proxy blocks host) |
| Taker | 0.6% | — | — | UNVERIFIABLE |

### Notes
- Coinbase's model is largely **network-fee pass-through** — most "withdrawFee" rows are estimates of a dynamic gas cost, not a published flat fee. On re-run, mark these CONFIRMED-DYNAMIC against the currently displayed estimate rather than expecting an exact match.
- Secondhand (WebSearch summary, NOT a fetched page, not used for any verdict): 2026 sources describe Coinbase Advanced entry tiers as "Intro 1: 0.60% maker / 1.20% taker, Intro 2: 0.40%/0.80%" while others state "0.40% maker / 0.60% taker at $0–$10K". If the Intro-1 1.20% taker figure is real, the table's 0.4/0.6 may understate the true entry tier — **flag for priority verification on the owner's machine** (potential CHANGED).
- Coinbase does not restrict deposits/withdrawals per the table's W✓ D✓ flags in any observable way from here; asset-status page unreachable.

---

## Kraken

Reachability: `www.kraken.com/features/fee-schedule`, `support.kraken.com/.../Cryptocurrency-withdrawal-fees-and-minimums`, `api.kraken.com` — all `EGRESS_BLOCKED` at the proxy. No Kraken host reachable.

| Coin | Network | Table value (fee / min, enabled W/D, note) | Observed value | Source URL | Verdict |
|---|---|---|---|---|---|
| BTC | bitcoin | 0.00015 / 0.0004, W✓ D✓ | — | — | UNVERIFIABLE (proxy blocks host) |
| ETH | erc20 | 0.0035 / 0.01, W✓ D✓ | — | — | UNVERIFIABLE |
| ETH | arbitrum | 0.0035 / 0.01, W✓ D✓ | — | — | UNVERIFIABLE |
| ETH | optimism | 0.0035 / 0.01, W✓ D✓ | — | — | UNVERIFIABLE |
| USDT | erc20 | 2.5 / 5, W✓ D✓ | — | — | UNVERIFIABLE |
| USDT | trc20 | 1.0 / 5, W✓ D✓ | — | — | UNVERIFIABLE |
| USDT | solana | 1.0 / 5, W✓ D✓ | — | — | UNVERIFIABLE |
| USDC | erc20 | 2.5 / 5, W✓ D✓ | — | — | UNVERIFIABLE |
| USDC | solana | 1.0 / 5, W✓ D✓ | — | — | UNVERIFIABLE |
| USDC | polygon | 1.0 / 5, W✓ D✓ | — | — | UNVERIFIABLE |
| USDC | base | 1.0 / 5, W✓ D✓ | — | — | UNVERIFIABLE |
| SOL | solana | 0.01 / 0.1, W✓ D✓ | — | — | UNVERIFIABLE |
| DAI | erc20 | 3.0 / 10, W✓ D✓ | — | — | UNVERIFIABLE |
| XRP | xrpl | 0.02 / 25, W✓ D✓, "Destination tag required" | — | — | UNVERIFIABLE |
| LTC | litecoin | 0.001 / 0.002, W✓ D✓ | — | — | UNVERIFIABLE |
| DOGE | dogecoin | 2.0 / 2, W✓ D✓ | — | — | UNVERIFIABLE |
| ADA | cardano | 0.35 / 1, W✓ D✓ | — | — | UNVERIFIABLE |
| DOT | polkadot | 0.05 / 1, W✓ D✓ | — | — | UNVERIFIABLE |
| ATOM | cosmos | 0.0001 / 0.1, W✓ D✓, "Memo required" | — | — | UNVERIFIABLE |
| LINK | erc20 | 0.31 / 1, W✓ D✓ | — | — | UNVERIFIABLE |
| UNI | erc20 | 0.31 / 1, W✓ D✓ | — | — | UNVERIFIABLE |
| NEAR | near_network | 0.1 / 1, W✓ D✓ | — | — | UNVERIFIABLE |
| ARB | arbitrum | 0.5 / 1, W✓ D✓ | — | — | UNVERIFIABLE |

### Spot trading fees
| | Table value | Observed value | Source URL | Verdict |
|---|---|---|---|---|
| Maker | 0.25% ("Kraken Pro, entry tier") | — | — | UNVERIFIABLE (proxy blocks host) |
| Taker | 0.4% | — | — | UNVERIFIABLE |

### Notes
- Secondhand (WebSearch summary, NOT a fetched page, not used for any verdict): 2026 sources quote Kraken BTC withdrawal at 0.00015 BTC, ETH at ~0.0035 ETH, USDT-TRC20 at ~1 USDT — all consistent with the table — but ERC-20 USDT "can reach 10 USDT or higher depending on congestion", vs the table's flat 2.5. Kraken's ERC-20 fees appear to be dynamic; the table rows carry no "Dynamic" note. **Flag: on re-run, check whether Kraken publishes dynamic ERC-20 fees and add notes accordingly** (potential CHANGED / note-gap).
- Table lacks BEP-20 rows for Kraken — correct historically (Kraken does not support BSC); re-confirm on re-run.
- No delisting checks possible from here.

---

## Re-run instructions
Run this verification from the owner's machine (or any residential network): fetch
`binance.com/en/fee/cryptoFee`, `coinbase.com/advanced-fees` + Coinbase help fee pages,
`kraken.com/features/fee-schedule` + the Kraken support withdrawal-fee article, and fill
the Observed/Source/Verdict columns. Priority items: Coinbase entry-tier maker/taker
(possible Intro-tier restructure) and Kraken ERC-20 dynamic-fee notes.

---

# Fee Verification Report — Batch B (OKX, Bybit, Gemini, Crypto.com)

Subproject S3 transfer-fee refresh. Date: 2026-08-20.
Source of table values: `frontend/src/lib/data/transferFees.ts` (EXCHANGES + SPOT_TRADING_FEES).

**Environment finding (applies to all four exchanges):** every attempted exchange domain is blocked at the network egress proxy of this environment (`EGRESS_BLOCKED`), not geo-blocked by the exchange:

- `www.okx.com` — EGRESS_BLOCKED
- `www.gemini.com`, `support.gemini.com` — EGRESS_BLOCKED
- `www.bybit.com`, `api.bybit.com` — EGRESS_BLOCKED
- `crypto.com` — EGRESS_BLOCKED

Web search returns only third-party aggregator pages (cryptsy.com, bitdegree.org, tradersunion.com, etc.), which do not meet the verification standard (official pages / official support-docs). Per the hard rules — no observed value without a fetched page — **every row below is UNVERIFIABLE**. This matches the CLAUDE.md audit rule: data-availability verification must run on the owner's machine. Re-run this batch there.

Reason string used throughout: *egress-blocked — official fee page unreachable from this environment*.

---

## OKX

**Reachability:** UNREACHABLE — `www.okx.com` blocked by egress proxy (okx.com/fees not fetchable). No official alternative reachable.

| Coin | Network | Table value (fee / min / W / D) | Observed value | Source URL | Verdict |
|------|---------|--------------------------------|----------------|------------|---------|
| BTC | bitcoin | 0.0001 / 0.001 / on / on (note: dynamic, re-verified 2026-07) | — | — | UNVERIFIABLE (egress-blocked) |
| BTC | bep20 | 0.000017 / 0.0001 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| ETH | erc20 | 0.0001 / 0.005 / on / on (note: dynamic, re-verified 2026-07) | — | — | UNVERIFIABLE (egress-blocked) |
| ETH | arbitrum | 0.0001 / 0.001 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| ETH | optimism | 0.0001 / 0.001 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| ETH | base | 0.0001 / 0.001 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| USDT | erc20 | 1.0 / 20 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| USDT | trc20 | 1.0 / 10 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| USDT | bep20 | 0.8 / 10 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| USDT | solana | 1.0 / 10 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| USDT | polygon | 1.0 / 10 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| USDT | arbitrum | 0.8 / 10 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| USDT | avalanche | 1.0 / 10 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| USDC | erc20 | 1.0 / 20 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| USDC | bep20 | 0.5 / 10 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| USDC | solana | 0.5 / 10 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| USDC | polygon | 0.5 / 10 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| USDC | arbitrum | 0.5 / 10 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| BNB | bep20 | 0.001 / 0.01 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| SOL | solana | 0.01 / 0.1 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| DAI | erc20 | 5.0 / 40 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| DAI | bep20 | 1.0 / 10 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| DAI | polygon | 1.0 / 10 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| XRP | xrpl | 0.1 / 5 / on / on (dest tag) | — | — | UNVERIFIABLE (egress-blocked) |
| LTC | litecoin | 0.001 / 0.001 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| TRX | trc20 | 1.0 / 10 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| DOGE | dogecoin | 5.0 / 50 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| MATIC | polygon | 0.1 / 10 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| MATIC | erc20 | 0.5 / 10 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| MATIC | bep20 | 0.5 / 10 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| AVAX | avalanche | 0.01 / 0.1 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| AVAX | erc20 | 0.1 / 0.5 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| AVAX | bep20 | 0.01 / 0.1 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| ADA | cardano | 1.0 / 5 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| DOT | polkadot | 0.1 / 1 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| DOT | bep20 | 0.05 / 0.5 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| ATOM | cosmos | 0.005 / 0.1 / on / on (memo) | — | — | UNVERIFIABLE (egress-blocked) |
| ATOM | bep20 | 0.005 / 0.1 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| LINK | erc20 | 0.25 / 0.5 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| LINK | bep20 | 0.01 / 0.2 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| TON | ton_network | 0.01 / 1 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| SHIB | erc20 | 210,000 / 500,000 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| SHIB | bep20 | 100,000 / 200,000 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| UNI | erc20 | 0.16 / 0.3 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| UNI | bep20 | 0.05 / 0.1 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| NEAR | near_network | 0.01 / 1 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| NEAR | bep20 | 0.01 / 0.5 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| ARB | arbitrum | 0.5 / 1 / on / on | — | — | UNVERIFIABLE (egress-blocked) |

### Spot trading fees
Table: maker 0.08% / taker 0.10% (SPOT_TRADING_FEES.okx). Official page (okx.com/fees) unreachable → **UNVERIFIABLE**. A web-search summary of third-party aggregators repeated 0.08/0.10 for the Lv1 tier (e.g. cryptsy.com/okx-fees, bitdegree.org/crypto/tutorials/okx-fees), which is corroboration only, not verification — no official page was fetched.

### Notes
- Nothing observed; verify dynamic BTC/ETH fee notes and MATIC→POL migration naming on the owner's machine.

---

## Bybit

**Reachability:** UNREACHABLE — `www.bybit.com` and `api.bybit.com` (public `v5/asset/coin/query-info`) both blocked by egress proxy.

| Coin | Network | Table value (fee / min / W / D) | Observed value | Source URL | Verdict |
|------|---------|--------------------------------|----------------|------------|---------|
| BTC | bitcoin | 0.0003 / 0.001 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| BTC | bep20 | 0.000017 / 0.0001 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| ETH | erc20 | 0.005 / 0.005 / on / on (note: free via Mantle, re-verified 2026-07) | — | — | UNVERIFIABLE (egress-blocked) |
| ETH | arbitrum | 0.0001 / 0.001 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| ETH | optimism | 0.0001 / 0.001 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| USDT | erc20 | 3.0 / 20 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| USDT | trc20 | 1.0 / 10 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| USDT | bep20 | 1.0 / 10 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| USDT | solana | 1.0 / 10 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| USDT | polygon | 1.0 / 10 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| USDT | arbitrum | 1.0 / 10 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| USDC | erc20 | 3.0 / 20 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| USDC | bep20 | 1.0 / 10 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| USDC | solana | 1.0 / 10 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| USDC | polygon | 1.0 / 10 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| USDC | arbitrum | 1.0 / 10 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| SOL | solana | 0.01 / 0.1 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| XRP | xrpl | 0.25 / 20 / on / on (dest tag) | — | — | UNVERIFIABLE (egress-blocked) |
| LTC | litecoin | 0.001 / 0.001 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| TRX | trc20 | 1.0 / 10 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| DOGE | dogecoin | 5.0 / 10 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| MATIC | polygon | 0.1 / 10 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| MATIC | erc20 | 0.5 / 10 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| AVAX | avalanche | 0.01 / 0.1 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| ADA | cardano | 1.0 / 2 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| DOT | polkadot | 0.1 / 1 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| ATOM | cosmos | 0.005 / 0.1 / on / on (memo) | — | — | UNVERIFIABLE (egress-blocked) |
| LINK | erc20 | 0.28 / 0.5 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| LINK | bep20 | 0.01 / 0.2 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| TON | ton_network | 0.01 / 1 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| SHIB | erc20 | 200,000 / 400,000 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| UNI | erc20 | 0.15 / 0.3 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| UNI | bep20 | 0.05 / 0.1 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| NEAR | near_network | 0.01 / 1 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| ARB | arbitrum | 0.5 / 1 / on / on | — | — | UNVERIFIABLE (egress-blocked) |

### Spot trading fees
Table: maker 0.10% / taker 0.10% (SPOT_TRADING_FEES.bybit). Official fee-rate announcement page unreachable → **UNVERIFIABLE**.

### Notes
- On the owner's machine, `GET https://api.bybit.com/v5/asset/coin/query-info` (public, keyless) returns per-coin per-chain `withdrawFee`/`withdrawMin` and would confirm this entire table in one request — recommend using it for the re-run.
- Bybit's "free ETH via Mantle" note and the ERC20 ETH 0.005 fee should be specifically re-checked; Bybit revises withdrawal fees via announcements frequently.

---

## Gemini

**Reachability:** UNREACHABLE — `www.gemini.com` and `support.gemini.com` blocked by egress proxy.

| Coin | Network | Table value (fee / min / W / D) | Observed value | Source URL | Verdict |
|------|---------|--------------------------------|----------------|------------|---------|
| BTC | bitcoin | 0.000025 / 0.001 / on / on (note: network-fee pass-through, re-verified 2026-07) | — | — | UNVERIFIABLE (egress-blocked) |
| ETH | erc20 | 0.001 / 0.001 / on / on (note: network-fee pass-through, re-verified 2026-07) | — | — | UNVERIFIABLE (egress-blocked) |
| USDC | erc20 | 0 / 1 / on / on (note: legacy free-tier value — confirm current schedule) | — | — | UNVERIFIABLE (egress-blocked) |
| USDC | polygon | 0 / 1 / on / on (note: legacy free-tier value — confirm current schedule) | — | — | UNVERIFIABLE (egress-blocked) |
| LTC | litecoin | 0 / 0.001 / on / on (note: legacy free-tier value — confirm current schedule) | — | — | UNVERIFIABLE (egress-blocked) |
| DOGE | dogecoin | 0 / 1 / on / on (note: legacy free-tier value — confirm current schedule) | — | — | UNVERIFIABLE (egress-blocked) |

### Spot trading fees
Table: maker 0.20% / taker 0.40%, note "ActiveTrader; the simple interface costs more" (SPOT_TRADING_FEES.gemini). gemini.com/fees unreachable → **UNVERIFIABLE**.

### Notes
- Four of six rows already carry the in-file caveat "Legacy free-tier value — Gemini has moved to network-fee pass-through; confirm current schedule". This batch could not close that caveat; it remains the top-priority item for the owner-machine re-run (gemini.com/fees and the transfer-fee support article).

---

## Crypto.com

**Reachability:** UNREACHABLE — `crypto.com` blocked by egress proxy (crypto.com/exchange/document/fees-limits not fetchable).

| Coin | Network | Table value (fee / min / W / D) | Observed value | Source URL | Verdict |
|------|---------|--------------------------------|----------------|------------|---------|
| BTC | bitcoin | 0.0004 / 0.001 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| ETH | erc20 | 0.0043 / 0.01 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| ETH | arbitrum | 0.001 / 0.01 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| USDT | erc20 | 4.0 / 40 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| USDT | trc20 | 2.0 / 20 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| USDT | bep20 | 1.0 / 10 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| USDC | erc20 | 4.0 / 40 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| USDC | solana | 1.0 / 10 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| USDC | polygon | 1.0 / 10 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| SOL | solana | 0.01 / 0.1 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| XRP | xrpl | 0.25 / 20 / on / on (dest tag) | — | — | UNVERIFIABLE (egress-blocked) |
| DOGE | dogecoin | 5.0 / 10 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| MATIC | polygon | 0.5 / 10 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| MATIC | erc20 | 1.0 / 10 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| AVAX | avalanche | 0.01 / 0.5 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| ADA | cardano | 0.5 / 5 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| DOT | polkadot | 0.1 / 1 / on / on | — | — | UNVERIFIABLE (egress-blocked) |
| ATOM | cosmos | 0.01 / 0.1 / on / on (memo) | — | — | UNVERIFIABLE (egress-blocked) |

### Spot trading fees
Table: maker 0.25% / taker 0.50%, note "Entry tier before CRO staking discounts" (SPOT_TRADING_FEES.cryptocom). Official fees-limits document unreachable → **UNVERIFIABLE**.

### Notes
- Distinguish App vs Exchange schedules on the re-run — the table appears to mix Exchange-style withdrawal fees with entry-tier Exchange trading fees; the fees-limits document covers the Exchange.

---

## Batch summary
| Exchange | Reachable | Confirmed | Changed | Unverifiable |
|---|---|---|---|---|
| OKX | No (egress-blocked) | 0 | 0 | 48 rows + spot fees |
| Bybit | No (egress-blocked) | 0 | 0 | 36 rows + spot fees |
| Gemini | No (egress-blocked) | 0 | 0 | 6 rows + spot fees |
| Crypto.com | No (egress-blocked) | 0 | 0 | 18 rows + spot fees |

Do **not** downgrade any table value based on this run — same rule as the source-terms probe: "couldn't read it" is not a finding about the data. Re-run on the owner's machine.

---

# Fee-Verification Report — Group C (Bitget, Gate.io, MEXC, HTX)

Subproject S3 transfer-fee refresh. Date: 2026-08-20.
Table source: `frontend/src/lib/data/transferFees.ts` (Bitget lines 964–1023, Gate.io 1025–1088, MEXC 1090–1149, HTX 1151–1209; `SPOT_TRADING_FEES` lines 103–134).

**Environment finding (applies to every verdict below):** this session's network egress proxy hard-blocks every exchange domain attempted — `www.bitget.com`, `www.gate.io`, `www.gate.com`, `www.mexc.com`, `mexcdevelop.github.io`, `www.htx.com` — and every third-party fee aggregator tried (`tradersunion.com`, `cryptsy.com`), all returning `EGRESS_BLOCKED`. No fee page could be opened, so **no observed value exists for any row**. Per the hard rules (observed values only from fetched pages, never memory or search snippets), every row is UNVERIFIABLE. This matches the CLAUDE.md warning that data-availability checks are IP-dependent and must be re-run on the owner's machine. Search-result corroboration, where a result snippet named a figure, is recorded in Notes only — it is not an observation and changes no verdict.

Verdict key: CONFIRMED / CHANGED / UNVERIFIABLE. Reason for all UNVERIFIABLE rows: source domain blocked by egress proxy (`EGRESS_BLOCKED`), page not fetched.

---

## Bitget

Reachability: **UNREACHABLE** — `https://www.bitget.com/fee` blocked by egress proxy (`EGRESS_BLOCKED`). Support-center fee article (`https://www.bitget.com/support/articles/12560603820584`, found via search) on the same blocked domain.

Table values below include `withdrawEnabled: true, depositEnabled: true` on every row (notes shown inline).

| Coin | Network | Table value | Observed value | Source URL | Verdict |
|---|---|---|---|---|---|
| BTC | bitcoin | fee 0.0002, min 0.001 | — | https://www.bitget.com/fee (blocked) | UNVERIFIABLE |
| BTC | bep20 | fee 0.000017, min 0.0001 | — | https://www.bitget.com/fee (blocked) | UNVERIFIABLE |
| ETH | erc20 | fee 0.0006, min 0.01 | — | https://www.bitget.com/fee (blocked) | UNVERIFIABLE |
| ETH | arbitrum | fee 0.0001, min 0.001 | — | https://www.bitget.com/fee (blocked) | UNVERIFIABLE |
| ETH | bep20 | fee 0.0003, min 0.001 | — | https://www.bitget.com/fee (blocked) | UNVERIFIABLE |
| USDT | erc20 | fee 5.0, min 10 | — | https://www.bitget.com/fee (blocked) | UNVERIFIABLE |
| USDT | trc20 | fee 1.0, min 10 | — | https://www.bitget.com/fee (blocked) | UNVERIFIABLE |
| USDT | bep20 | fee 1.0, min 10 | — | https://www.bitget.com/fee (blocked) | UNVERIFIABLE |
| USDT | solana | fee 1.0, min 10 | — | https://www.bitget.com/fee (blocked) | UNVERIFIABLE |
| USDT | arbitrum | fee 1.0, min 10 | — | https://www.bitget.com/fee (blocked) | UNVERIFIABLE |
| USDC | erc20 | fee 5.0, min 10 | — | https://www.bitget.com/fee (blocked) | UNVERIFIABLE |
| USDC | trc20 | fee 1.0, min 10 | — | https://www.bitget.com/fee (blocked) | UNVERIFIABLE |
| USDC | bep20 | fee 1.0, min 10 | — | https://www.bitget.com/fee (blocked) | UNVERIFIABLE |
| USDC | solana | fee 1.0, min 10 | — | https://www.bitget.com/fee (blocked) | UNVERIFIABLE |
| USDC | arbitrum | fee 1.0, min 10 | — | https://www.bitget.com/fee (blocked) | UNVERIFIABLE |
| SOL | solana | fee 0.01, min 0.1 | — | https://www.bitget.com/fee (blocked) | UNVERIFIABLE |
| XRP | xrpl | fee 0.5, min 10 (note: destination tag required) | — | https://www.bitget.com/fee (blocked) | UNVERIFIABLE |
| LTC | litecoin | fee 0.001, min 0.01 | — | https://www.bitget.com/fee (blocked) | UNVERIFIABLE |
| TRX | trc20 | fee 1.0, min 10 | — | https://www.bitget.com/fee (blocked) | UNVERIFIABLE |
| DOGE | dogecoin | fee 5.0, min 10 | — | https://www.bitget.com/fee (blocked) | UNVERIFIABLE |
| MATIC | polygon | fee 0.1, min 10 | — | https://www.bitget.com/fee (blocked) | UNVERIFIABLE |
| MATIC | erc20 | fee 0.8, min 10 | — | https://www.bitget.com/fee (blocked) | UNVERIFIABLE |
| AVAX | avalanche | fee 0.01, min 0.1 | — | https://www.bitget.com/fee (blocked) | UNVERIFIABLE |
| ADA | cardano | fee 1.0, min 5 | — | https://www.bitget.com/fee (blocked) | UNVERIFIABLE |
| DOT | polkadot | fee 0.1, min 1 | — | https://www.bitget.com/fee (blocked) | UNVERIFIABLE |
| ATOM | cosmos | fee 0.005, min 0.1 (note: memo required) | — | https://www.bitget.com/fee (blocked) | UNVERIFIABLE |

### Spot trading fees
Table: maker 0.1% / taker 0.1%. Observed: — (fee page blocked). **UNVERIFIABLE.** Search-result snippets (WebSearch, 2026-08-20) describe Bitget's base spot rate as 0.1%/0.1% — corroboration only, not an observation.

### Notes
- Verify on the owner's machine: `https://www.bitget.com/fee` and support article 12560603820584 ("Spot Trading Fees, Limits, and Rules").
- Search snippets mention a 20% BGB fee-pay discount; base rate unaffected.

---

## Gate.io

Reachability: **UNREACHABLE** — `https://www.gate.io/fee` and `https://www.gate.com/fee` (Gate's newer domain) both blocked by egress proxy (`EGRESS_BLOCKED`).

| Coin | Network | Table value | Observed value | Source URL | Verdict |
|---|---|---|---|---|---|
| BTC | bitcoin | fee 0.001, min 0.001 | — | https://www.gate.io/fee (blocked) | UNVERIFIABLE |
| BTC | bep20 | fee 0.000017, min 0.0001 | — | https://www.gate.io/fee (blocked) | UNVERIFIABLE |
| ETH | erc20 | fee 0.0021, min 0.01 | — | https://www.gate.io/fee (blocked) | UNVERIFIABLE |
| ETH | arbitrum | fee 0.0001, min 0.001 | — | https://www.gate.io/fee (blocked) | UNVERIFIABLE |
| ETH | optimism | fee 0.0001, min 0.001 | — | https://www.gate.io/fee (blocked) | UNVERIFIABLE |
| ETH | bep20 | fee 0.0003, min 0.001 | — | https://www.gate.io/fee (blocked) | UNVERIFIABLE |
| USDT | erc20 | fee 1.5, min 20 | — | https://www.gate.io/fee (blocked) | UNVERIFIABLE |
| USDT | trc20 | fee 1.0, min 10 | — | https://www.gate.io/fee (blocked) | UNVERIFIABLE |
| USDT | bep20 | fee 1.0, min 10 | — | https://www.gate.io/fee (blocked) | UNVERIFIABLE |
| USDT | solana | fee 1.0, min 10 | — | https://www.gate.io/fee (blocked) | UNVERIFIABLE |
| USDT | polygon | fee 1.0, min 10 | — | https://www.gate.io/fee (blocked) | UNVERIFIABLE |
| USDT | arbitrum | fee 1.0, min 10 | — | https://www.gate.io/fee (blocked) | UNVERIFIABLE |
| USDT | avalanche | fee 1.0, min 10 | — | https://www.gate.io/fee (blocked) | UNVERIFIABLE |
| USDC | erc20 | fee 2.0, min 20 | — | https://www.gate.io/fee (blocked) | UNVERIFIABLE |
| USDC | trc20 | fee 1.0, min 10 | — | https://www.gate.io/fee (blocked) | UNVERIFIABLE |
| USDC | bep20 | fee 1.0, min 10 | — | https://www.gate.io/fee (blocked) | UNVERIFIABLE |
| USDC | solana | fee 1.0, min 10 | — | https://www.gate.io/fee (blocked) | UNVERIFIABLE |
| USDC | polygon | fee 1.0, min 10 | — | https://www.gate.io/fee (blocked) | UNVERIFIABLE |
| USDC | arbitrum | fee 1.0, min 10 | — | https://www.gate.io/fee (blocked) | UNVERIFIABLE |
| SOL | solana | fee 0.01, min 0.1 | — | https://www.gate.io/fee (blocked) | UNVERIFIABLE |
| XRP | xrpl | fee 0.1, min 5 (note: destination tag required) | — | https://www.gate.io/fee (blocked) | UNVERIFIABLE |
| LTC | litecoin | fee 0.001, min 0.002 | — | https://www.gate.io/fee (blocked) | UNVERIFIABLE |
| TRX | trc20 | fee 1.0, min 10 | — | https://www.gate.io/fee (blocked) | UNVERIFIABLE |
| DOGE | dogecoin | fee 5.0, min 50 | — | https://www.gate.io/fee (blocked) | UNVERIFIABLE |
| MATIC | polygon | fee 0.1, min 10 | — | https://www.gate.io/fee (blocked) | UNVERIFIABLE |
| MATIC | erc20 | fee 0.5, min 10 | — | https://www.gate.io/fee (blocked) | UNVERIFIABLE |
| AVAX | avalanche | fee 0.01, min 0.1 | — | https://www.gate.io/fee (blocked) | UNVERIFIABLE |
| ADA | cardano | fee 1.0, min 2 | — | https://www.gate.io/fee (blocked) | UNVERIFIABLE |
| DOT | polkadot | fee 0.1, min 1 | — | https://www.gate.io/fee (blocked) | UNVERIFIABLE |
| ATOM | cosmos | fee 0.005, min 0.1 (note: memo required) | — | https://www.gate.io/fee (blocked) | UNVERIFIABLE |

### Spot trading fees
Table: maker 0.2% / taker 0.2%. Observed: — (fee pages blocked). **UNVERIFIABLE.** Search snippets (WebSearch, 2026-08-20) report 0.20%/0.20% base as of July 2026, and mention a **fee-structure update effective 2026-04-09** — priority re-check on the owner's machine; the table's flat 0.2/0.2 may be stale post-update.

### Notes
- Gate has been migrating branding from gate.io to **gate.com** — confirm which fee page is canonical when re-verifying.
- Search snippets describe a 16-tier VIP ladder (VIP1 spot maker 0.185%); base-tier figure is the one that matters for `SPOT_TRADING_FEES`.

---

## MEXC

Reachability: **UNREACHABLE** — `https://www.mexc.com/fee` blocked by egress proxy (`EGRESS_BLOCKED`); `mexcdevelop.github.io` (API docs) also blocked.

| Coin | Network | Table value | Observed value | Source URL | Verdict |
|---|---|---|---|---|---|
| BTC | bitcoin | fee 0.0005, min 0.001 | — | https://www.mexc.com/fee (blocked) | UNVERIFIABLE |
| BTC | bep20 | fee 0.000017, min 0.0001 | — | https://www.mexc.com/fee (blocked) | UNVERIFIABLE |
| ETH | erc20 | fee 0.004, min 0.01 | — | https://www.mexc.com/fee (blocked) | UNVERIFIABLE |
| ETH | arbitrum | fee 0.0001, min 0.001 | — | https://www.mexc.com/fee (blocked) | UNVERIFIABLE |
| ETH | bep20 | fee 0.0003, min 0.001 | — | https://www.mexc.com/fee (blocked) | UNVERIFIABLE |
| USDT | erc20 | fee 5.0, min 20 | — | https://www.mexc.com/fee (blocked) | UNVERIFIABLE |
| USDT | trc20 | fee 1.0, min 10 | — | https://www.mexc.com/fee (blocked) | UNVERIFIABLE |
| USDT | bep20 | fee 1.0, min 10 | — | https://www.mexc.com/fee (blocked) | UNVERIFIABLE |
| USDT | solana | fee 1.0, min 10 | — | https://www.mexc.com/fee (blocked) | UNVERIFIABLE |
| USDT | polygon | fee 1.0, min 10 | — | https://www.mexc.com/fee (blocked) | UNVERIFIABLE |
| USDT | arbitrum | fee 1.0, min 10 | — | https://www.mexc.com/fee (blocked) | UNVERIFIABLE |
| USDC | erc20 | fee 5.0, min 20 | — | https://www.mexc.com/fee (blocked) | UNVERIFIABLE |
| USDC | trc20 | fee 1.0, min 10 | — | https://www.mexc.com/fee (blocked) | UNVERIFIABLE |
| USDC | bep20 | fee 1.0, min 10 | — | https://www.mexc.com/fee (blocked) | UNVERIFIABLE |
| USDC | solana | fee 1.0, min 10 | — | https://www.mexc.com/fee (blocked) | UNVERIFIABLE |
| SOL | solana | fee 0.01, min 0.1 | — | https://www.mexc.com/fee (blocked) | UNVERIFIABLE |
| XRP | xrpl | fee 0.25, min 10 (note: destination tag required) | — | https://www.mexc.com/fee (blocked) | UNVERIFIABLE |
| LTC | litecoin | fee 0.001, min 0.01 | — | https://www.mexc.com/fee (blocked) | UNVERIFIABLE |
| TRX | trc20 | fee 1.0, min 10 | — | https://www.mexc.com/fee (blocked) | UNVERIFIABLE |
| DOGE | dogecoin | fee 5.0, min 20 | — | https://www.mexc.com/fee (blocked) | UNVERIFIABLE |
| MATIC | polygon | fee 0.1, min 10 | — | https://www.mexc.com/fee (blocked) | UNVERIFIABLE |
| MATIC | erc20 | fee 0.8, min 10 | — | https://www.mexc.com/fee (blocked) | UNVERIFIABLE |
| AVAX | avalanche | fee 0.01, min 0.1 | — | https://www.mexc.com/fee (blocked) | UNVERIFIABLE |
| ADA | cardano | fee 1.0, min 5 | — | https://www.mexc.com/fee (blocked) | UNVERIFIABLE |
| DOT | polkadot | fee 0.1, min 1 | — | https://www.mexc.com/fee (blocked) | UNVERIFIABLE |
| ATOM | cosmos | fee 0.005, min 0.1 (note: memo required) | — | https://www.mexc.com/fee (blocked) | UNVERIFIABLE |

### Spot trading fees
Table: maker 0% / taker 0.05%. Observed: — (fee page blocked). **UNVERIFIABLE.** Search snippets (WebSearch, 2026-08-20, incl. MEXC's own learn/crypto-pulse articles on the blocked domain) consistently describe 0% maker / 0.05% taker — corroboration only.

### Notes
- MEXC runs rotating 0%-fee promotions on specific pairs (announcement pages surfaced in search); the base-tier rate is what `SPOT_TRADING_FEES` should carry.

---

## HTX (Huobi)

Reachability: **UNREACHABLE** — `https://www.htx.com/fee/` blocked by egress proxy (`EGRESS_BLOCKED`).

| Coin | Network | Table value | Observed value | Source URL | Verdict |
|---|---|---|---|---|---|
| BTC | bitcoin | fee 0.0004, min 0.005 | — | https://www.htx.com/fee/ (blocked) | UNVERIFIABLE |
| BTC | bep20 | fee 0.000017, min 0.0001 | — | https://www.htx.com/fee/ (blocked) | UNVERIFIABLE |
| ETH | erc20 | fee 0.004, min 0.02 | — | https://www.htx.com/fee/ (blocked) | UNVERIFIABLE |
| ETH | arbitrum | fee 0.001, min 0.01 | — | https://www.htx.com/fee/ (blocked) | UNVERIFIABLE |
| ETH | bep20 | fee 0.0003, min 0.001 | — | https://www.htx.com/fee/ (blocked) | UNVERIFIABLE |
| USDT | erc20 | fee 1.0, min 20 | — | https://www.htx.com/fee/ (blocked) | UNVERIFIABLE |
| USDT | trc20 | fee 1.0, min 10 | — | https://www.htx.com/fee/ (blocked) | UNVERIFIABLE |
| USDT | bep20 | fee 0.8, min 10 | — | https://www.htx.com/fee/ (blocked) | UNVERIFIABLE |
| USDT | arbitrum | fee 1.0, min 10 | — | https://www.htx.com/fee/ (blocked) | UNVERIFIABLE |
| USDT | polygon | fee 1.0, min 10 | — | https://www.htx.com/fee/ (blocked) | UNVERIFIABLE |
| USDT | avalanche | fee 1.0, min 10 | — | https://www.htx.com/fee/ (blocked) | UNVERIFIABLE |
| USDC | erc20 | fee 1.0, min 20 | — | https://www.htx.com/fee/ (blocked) | UNVERIFIABLE |
| USDC | trc20 | fee 1.0, min 10 | — | https://www.htx.com/fee/ (blocked) | UNVERIFIABLE |
| USDC | bep20 | fee 1.0, min 10 | — | https://www.htx.com/fee/ (blocked) | UNVERIFIABLE |
| SOL | solana | fee 0.01, min 0.1 | — | https://www.htx.com/fee/ (blocked) | UNVERIFIABLE |
| XRP | xrpl | fee 0.1, min 5 (note: destination tag required) | — | https://www.htx.com/fee/ (blocked) | UNVERIFIABLE |
| LTC | litecoin | fee 0.001, min 0.01 | — | https://www.htx.com/fee/ (blocked) | UNVERIFIABLE |
| TRX | trc20 | fee 1.0, min 10 | — | https://www.htx.com/fee/ (blocked) | UNVERIFIABLE |
| DOGE | dogecoin | fee 5.0, min 10 | — | https://www.htx.com/fee/ (blocked) | UNVERIFIABLE |
| MATIC | polygon | fee 0.1, min 10 | — | https://www.htx.com/fee/ (blocked) | UNVERIFIABLE |
| MATIC | erc20 | fee 0.5, min 10 | — | https://www.htx.com/fee/ (blocked) | UNVERIFIABLE |
| AVAX | avalanche | fee 0.01, min 0.1 | — | https://www.htx.com/fee/ (blocked) | UNVERIFIABLE |
| ADA | cardano | fee 1.0, min 5 | — | https://www.htx.com/fee/ (blocked) | UNVERIFIABLE |
| DOT | polkadot | fee 0.1, min 1 | — | https://www.htx.com/fee/ (blocked) | UNVERIFIABLE |
| ATOM | cosmos | fee 0.005, min 0.1 (note: memo required) | — | https://www.htx.com/fee/ (blocked) | UNVERIFIABLE |

### Spot trading fees
Table: maker 0.2% / taker 0.2%. Observed: — (fee page blocked). **UNVERIFIABLE.** Search snippets (WebSearch, 2026-08-20) describe 0.2%/0.2% base with a 25% TRX-payment discount — corroboration only.

### Notes
- HTX withdrawal fees for USDT are known historically to move with network conditions; re-check all six USDT network rows on the owner's machine.

---

## Cross-cutting notes

- **MATIC → POL migration**: all four exchanges' tables still key the coin as `matic` on `polygon`/`erc20`. When re-verifying on the owner's machine, check whether each exchange now lists withdrawals under POL and whether the ERC-20 MATIC network row has been retired — a likely delisting/rename across all four.
- **No verdict was downgraded from a blocked probe** (per the CLAUDE.md source-terms rule: "couldn't read it" is not information). Every row must be re-run from the owner's machine before `TRANSFER_FEES_LAST_VERIFIED` is advanced — this report contributes zero verified rows.
- Candidate URLs for the owner-machine pass: bitget.com/fee, bitget.com/support/articles/12560603820584, gate.io/fee (or gate.com/fee), mexc.com/fee, mexc.com/learn/article/mexc-spot-trading-fees-maker-taker-rates-calculator/1, htx.com/fee/, plus each exchange's per-coin withdrawal-fee table (usually behind the fee page's "Withdrawal fees" tab).

---

# Fee Verification Report — Group D (Upbit, Bitstamp, Hyperliquid, KuCoin, Bitfinex)

Subproject S3 transfer-fee refresh. Date: 2026-08-20.
Table source: `frontend/src/lib/data/transferFees.ts` (`EXCHANGES` + `SPOT_TRADING_FEES`).

**Environment finding (applies to every exchange below):** this session's network egress proxy blocks ALL WebFetch requests — official fee pages (bitstamp.net, bitfinex.com, support.bitfinex.com, kucoin.com, upbit.com, hyperliquid.gitbook.io) AND every third-party aggregator tried (coinmarketfees.com, cryptowisser.com, hyperliquidguide.com, eco.com) returned `EGRESS_BLOCKED`. Only WebSearch (result snippets, not fetched pages) worked. Per the hard rule that observed values come only from fetched pages, **every withdrawal-fee row is UNVERIFIABLE**. Search-snippet leads that suggest values have changed are recorded in Notes for re-verification from the owner's machine — this matches the CLAUDE.md rule that data audits must run there anyway.

---

## Upbit (`upbit`, tier 1)

Reachability: **UNREACHABLE** — `upbit.com` blocked by egress proxy (`EGRESS_BLOCKED`); no fetchable mirror found.

| Coin | Network | Table value | Observed value | Source URL | Verdict |
|------|---------|-------------|----------------|------------|---------|
| BTC | bitcoin | fee 0.0009, min 0.005, w/d✓ dep✓ (KYC note) | — | upbit.com blocked | UNVERIFIABLE (egress blocked) |
| ETH | erc20 | fee 0.01, min 0.05, w/d✓ dep✓ (KYC note) | — | upbit.com blocked | UNVERIFIABLE (egress blocked) |
| XRP | xrpl | fee 1.0, min 20, w/d✓ dep✓ (dest tag; KYC) | — | upbit.com blocked | UNVERIFIABLE (egress blocked) |
| ADA | cardano | fee 1.0, min 5, w/d✓ dep✓ | — | upbit.com blocked | UNVERIFIABLE (egress blocked) |
| DOT | polkadot | fee 0.1, min 1, w/d✓ dep✓ | — | upbit.com blocked | UNVERIFIABLE (egress blocked) |

### Spot trading fees
Table: maker 0.05% / taker 0.05% (note: "KRW market"). Verdict: **UNVERIFIABLE** — official page unreachable. Search snippets (not fetched pages) corroborate 0.05% KRW-market and add that BTC/USDT markets are 0.25% (see Notes).

### Notes
- Search-result summaries (cryptowisser.com/exchange/upbit, tradersunion.com upbit fees — pages themselves egress-blocked) suggest **BTC withdrawal fee is 0.0005 BTC, not the 0.0009 in the table** — flag for on-machine re-check.
- Same snippets corroborate ETH 0.01 (matches table).
- Table note about KRW-market-only maker/taker could be extended with the reported 0.25% BTC/USDT-market rate if verified.

---

## Bitstamp (`bitstamp`, tier 1)

Reachability: **UNREACHABLE** — `bitstamp.net/fee-schedule/` blocked by egress proxy.

| Coin | Network | Table value | Observed value | Source URL | Verdict |
|------|---------|-------------|----------------|------------|---------|
| BTC | bitcoin | fee 0.0003, min 0.001, w/d✓ dep✓ | — | bitstamp.net blocked | UNVERIFIABLE (egress blocked) |
| ETH | erc20 | fee 0.001, min 0.01, w/d✓ dep✓ | — | bitstamp.net blocked | UNVERIFIABLE (egress blocked) |
| USDT | erc20 | fee 10.0, min 50, w/d✓ dep✓ (flat + 0.1% note) | — | bitstamp.net blocked | UNVERIFIABLE (egress blocked) |
| USDC | erc20 | fee 10.0, min 50, w/d✓ dep✓ (flat + 0.1% note) | — | bitstamp.net blocked | UNVERIFIABLE (egress blocked) |
| XRP | xrpl | fee 0.02, min 25, w/d✓ dep✓ (dest tag) | — | bitstamp.net blocked | UNVERIFIABLE (egress blocked) |
| LTC | litecoin | fee 0.001, min 0.01, w/d✓ dep✓ | — | bitstamp.net blocked | UNVERIFIABLE (egress blocked) |

### Spot trading fees
Table: maker 0.30% / taker 0.40% (note: entry tier <$10k monthly). Verdict: **UNVERIFIABLE** as an observation; search snippets (tradingfinder.com/exchanges/bitstamp, thecoinomist.com — pages blocked) consistently report **0.30%/0.40% under $10k 30-day volume, matching the table**.

### Notes
- No delisting/new-network signals surfaced in search results.

---

## Hyperliquid (`hyperliquid`, DEX, tier 1)

Reachability: **UNREACHABLE** — `hyperliquid.gitbook.io/hyperliquid-docs/trading/fees` blocked; secondary sources (hyperliquidguide.com, eco.com) also blocked.

| Coin | Network | Table value | Observed value | Source URL | Verdict |
|------|---------|-------------|----------------|------------|---------|
| USDC | arbitrum | fee 1.0, min 5, w/d✓ dep✓ (bridge to Arbitrum note) | — | hyperliquid docs blocked | UNVERIFIABLE (egress blocked) |
| ETH | arbitrum | fee 0.0001, min 0.01, w/d✓ dep✓ (bridge note) | — | hyperliquid docs blocked | UNVERIFIABLE (egress blocked) |

### Spot trading fees
Table: maker 0.01% / taker 0.035% (note: DEX + builder fee). Verdict: **UNVERIFIABLE**, but **likely CHANGED / mis-tiered** — search snippets (hyperliquidguide.com/guides/fees, supa.is, perp.wiki — pages blocked) report base-tier fees of **0.015% maker / 0.045% taker (perps)** and **0.040% maker / 0.070% taker (spot)**; the table's 0.01/0.035 matches a *higher-volume tier* ($25M+ 14-day volume), not the base tier. High-priority on-machine re-check.

### Notes
- Since `SPOT_TRADING_FEES` documents entry-tier rates everywhere else, the Hyperliquid row is probably overstating how cheap a small trader's fees are. Verify against the official gitbook fees page and correct tier framing.

---

## KuCoin (`kucoin`, tier 2)

Reachability: **UNREACHABLE** — `kucoin.com/vip/privilege` blocked; coinmarketfees.com aggregator also blocked.

| Coin | Network | Table value | Observed value | Source URL | Verdict |
|------|---------|-------------|----------------|------------|---------|
| BTC | bitcoin | fee 0.0005, min 0.001 | — | kucoin.com blocked | UNVERIFIABLE (egress blocked) |
| ETH | erc20 | fee 0.0049, min 0.01 | — | kucoin.com blocked | UNVERIFIABLE (egress blocked) |
| ETH | arbitrum | fee 0.0001, min 0.01 | — | kucoin.com blocked | UNVERIFIABLE (egress blocked) |
| USDT | erc20 | fee 4.0, min 8 | — | kucoin.com blocked | UNVERIFIABLE (egress blocked) |
| USDT | trc20 | fee 1.0, min 2 | — | kucoin.com blocked | UNVERIFIABLE (egress blocked) |
| USDT | bep20 | fee 0.45, min 0.9 | — | kucoin.com blocked | UNVERIFIABLE (egress blocked) |
| USDT | solana | fee 1.0, min 2 | — | kucoin.com blocked | UNVERIFIABLE (egress blocked) |
| USDT | polygon | fee 1.0, min 2 | — | kucoin.com blocked | UNVERIFIABLE (egress blocked) |
| USDC | erc20 | fee 4.0, min 8 | — | kucoin.com blocked | UNVERIFIABLE (egress blocked) |
| USDC | trc20 | fee 1.0, min 2 | — | kucoin.com blocked | UNVERIFIABLE (egress blocked) |
| USDC | bep20 | fee 0.45, min 0.9 | — | kucoin.com blocked | UNVERIFIABLE (egress blocked) |
| USDC | solana | fee 1.0, min 2 | — | kucoin.com blocked | UNVERIFIABLE (egress blocked) |
| SOL | solana | fee 0.01, min 0.1 | — | kucoin.com blocked | UNVERIFIABLE (egress blocked) |
| DAI | erc20 | fee 4.0, min 8 | — | kucoin.com blocked | UNVERIFIABLE (egress blocked) |
| DAI | bep20 | fee 0.45, min 0.9 | — | kucoin.com blocked | UNVERIFIABLE (egress blocked) |
| XRP | xrpl | fee 0.25, min 20 (dest tag) | — | kucoin.com blocked | UNVERIFIABLE (egress blocked) |
| LTC | litecoin | fee 0.001, min 0.1 | — | kucoin.com blocked | UNVERIFIABLE (egress blocked) |
| TRX | trc20 | fee 1.0, min 10 | — | kucoin.com blocked | UNVERIFIABLE (egress blocked) |
| DOGE | dogecoin | fee 5.0, min 10 | — | kucoin.com blocked | UNVERIFIABLE (egress blocked) |
| MATIC | polygon | fee 0.1, min 10 | — | kucoin.com blocked | UNVERIFIABLE (egress blocked) |
| MATIC | erc20 | fee 0.8, min 10 | — | kucoin.com blocked | UNVERIFIABLE (egress blocked) |
| AVAX | avalanche | fee 0.01, min 0.1 | — | kucoin.com blocked | UNVERIFIABLE (egress blocked) |
| ADA | cardano | fee 1.0, min 2 | — | kucoin.com blocked | UNVERIFIABLE (egress blocked) |
| DOT | polkadot | fee 0.1, min 1 | — | kucoin.com blocked | UNVERIFIABLE (egress blocked) |
| ATOM | cosmos | fee 0.005, min 0.1 (memo) | — | kucoin.com blocked | UNVERIFIABLE (egress blocked) |
| LINK | erc20 | fee 0.3, min 0.5 | — | kucoin.com blocked | UNVERIFIABLE (egress blocked) |
| LINK | bep20 | fee 0.02, min 0.2 | — | kucoin.com blocked | UNVERIFIABLE (egress blocked) |
| TON | ton_network | fee 0.02, min 1 | — | kucoin.com blocked | UNVERIFIABLE (egress blocked) |
| SHIB | erc20 | fee 220,000, min 500,000 | — | kucoin.com blocked | UNVERIFIABLE (egress blocked) |
| UNI | erc20 | fee 0.2, min 0.3 | — | kucoin.com blocked | UNVERIFIABLE (egress blocked) |
| NEAR | near_network | fee 0.05, min 1 | — | kucoin.com blocked | UNVERIFIABLE (egress blocked) |
| ARB | arbitrum | fee 0.5, min 2 | — | kucoin.com blocked | UNVERIFIABLE (egress blocked) |

(All rows withdrawEnabled ✓ / depositEnabled ✓ in the table.)

### Spot trading fees
Table: maker 0.1% / taker 0.1%. Verdict: **UNVERIFIABLE** as an observation; search snippets (bitdegree.org, tradersunion.com — pages blocked) consistently report **0.1%/0.1% at LV0, matching the table** (0.08% with KCS-pay discount).

### Notes
- Snippets report USDT ERC-20 withdrawal ~**10 USDT** vs the table's **4.0** — possible CHANGE; USDT TRC-20 ~1 USDT matches. ETH mainnet reported as gas-variable 0.003–0.01 vs table 0.0049. Flag USDT/USDC ERC-20 rows for on-machine re-check.

---

## Bitfinex (`bitfinex`, tier 2)

Reachability: **UNREACHABLE** — `bitfinex.com/fees/` and `support.bitfinex.com` both blocked.

| Coin | Network | Table value | Observed value | Source URL | Verdict |
|------|---------|-------------|----------------|------------|---------|
| BTC | bitcoin | fee 0.0004, min 0.001 | — | bitfinex.com blocked | UNVERIFIABLE (egress blocked) |
| ETH | erc20 | fee 0.00135, min 0.1 | — | bitfinex.com blocked | UNVERIFIABLE (egress blocked) |
| USDT | erc20 | fee 5.0, min 20 | — | bitfinex.com blocked | UNVERIFIABLE (egress blocked) |
| USDT | trc20 | fee 2.0, min 10 | — | bitfinex.com blocked | UNVERIFIABLE (egress blocked) |
| USDT | bep20 | fee 2.0, min 10 | — | bitfinex.com blocked | UNVERIFIABLE (egress blocked) |
| USDC | erc20 | fee 5.0, min 20 | — | bitfinex.com blocked | UNVERIFIABLE (egress blocked) |
| XRP | xrpl | fee 0.02, min 20 (dest tag) | — | bitfinex.com blocked | UNVERIFIABLE (egress blocked) |
| TRX | trc20 | fee 1.0, min 10 | — | bitfinex.com blocked | UNVERIFIABLE (egress blocked) |
| ADA | cardano | fee 0.5, min 5 | — | bitfinex.com blocked | UNVERIFIABLE (egress blocked) |
| DOT | polkadot | fee 0.1, min 5 | — | bitfinex.com blocked | UNVERIFIABLE (egress blocked) |

(All rows withdrawEnabled ✓ / depositEnabled ✓ in the table.)

### Spot trading fees
Table: maker 0.1% / taker 0.2%. Verdict: **UNVERIFIABLE**, but **likely CHANGED** — a search snippet citing Bitfinex sources (fxempire.com, bitget.com academy — pages blocked) reports that **as of 2025-12-17 Bitfinex made all trading free (0% maker / 0% taker)** as a promotional/structural change. If confirmed on the official fee page, the entry should become 0/0 with a note (per the file's convention that 0-commission venues carry a note — "no fee with a wide spread is not free", and promos need a reviewed-by date). **Highest-priority on-machine re-check in this group.**

### Notes
- BTC withdrawal 0.0004 corroborated by a snippet (matches table), but not from a fetched page — still UNVERIFIABLE.
- No delisting/new-network signals surfaced.

---

## Re-check queue (owner's machine)
1. **Bitfinex trading fees** — reported 0%/0% since 2025-12-17 vs table 0.1/0.2.
2. **Hyperliquid tier framing** — table 0.01/0.035 appears to be a $25M+ tier, base reported 0.015/0.045 (perps), 0.04/0.07 (spot).
3. **Upbit BTC withdrawal** — reported 0.0005 vs table 0.0009.
4. **KuCoin USDT/USDC ERC-20 withdrawal** — reported ~10 USDT vs table 4.0.

