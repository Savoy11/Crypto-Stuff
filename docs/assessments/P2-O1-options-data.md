# P2-O1 — Options & futures data-source audit

**Status: PRELIMINARY — awaiting owner-machine probe results.** This document was
scaffolded from a container session (2026-08-05), which can legitimately do two of the
audit's three parts: build the measurement tooling and research provider terms. It
cannot produce the reachability/field baseline — every probe from the container 403s at
the egress proxy (including `CL=F`, which the app demonstrably serves in production),
which is the IP-dependence rule doing exactly what it exists to do.

## How to produce the measurements (owner machine)

```bash
cd frontend
node scripts/audit-options-data.mjs            # human-readable
node scripts/audit-options-data.mjs --json > options-probe.json   # paste back
```

The script probes, read-only and keyless:
1. **CBOE delayed-quotes JSON** — chains for AAPL (equity), SPY (ETF), _SPX (index):
   option count, greeks/IV/OI field coverage, quote timestamps.
2. **Yahoo v7 options** — same symbols on both query hosts: expiries, strikes, field
   coverage, whether OI/IV are actually populated (Yahoo zeroes OI on some symbols
   outside market hours). A 401/403 here is itself a finding — Yahoo has been
   tightening cookie/crumb requirements on v-APIs.
3. **Individual futures contract months** (the P2-O4 gate) — CLZ26.NYM-style symbols
   across NYMEX/COMEX/CBOT via the same v8 chart API the app already uses for
   continuous front-months, with `CL=F` as a known-good control.

## Terms of use — researched 2026-08-05 (verify the exact page text owner-side)

**CBOE: reachable-keyless is NOT the same as permitted.** Per Cboe's own pages and
data-licensing materials (via web search; the container cannot open cboe.com directly):

- Cboe's delayed-quotes pages state that downloading delayed quote data **"by using
  auto-extraction programs/queries and/or software" is strictly prohibited**, that Cboe
  **blocks IPs** that attempt it, and that the data is property of Cboe
  Livevol/its providers — permitted access is manual ticker entry on their site.
- The sanctioned programmatic path is the **[Cboe All Access
  API](https://datashop.cboe.com/cboe-all-access-api)** — a licensed, paid product
  whose redistribution license covers putting real-time/delayed/historical non-SIP
  data into client-facing applications. External redistributors of even *delayed*
  data are required to sign a Data Agreement (see [Cboe delayed
  quotes](https://www.cboe.com/delayed_quotes/cboe) and licensed resellers such as
  [Intrinio's delayed Cboe One feed](https://intrinio.com/financial-market-data/cboe-one-delayed)).

**Preliminary consequence:** the "free CBOE delayed JSON" candidate should be treated
as **not usable** for Finance Now regardless of what the probe measures — the project
treats licensing as first-class (CUSIP note on /macro/rates; News Charts EOD-only
rule), and a source whose terms prohibit exactly this access pattern fails that bar
even if the endpoint answers. If the probe shows it reachable, that changes nothing;
Cboe's stated enforcement is IP blocking, which for a server-side route means the
app's own egress going dark without warning.

**Yahoo options:** unofficial and undocumented — there are no API terms to satisfy
because there is no published API. This is the **same standing situation as the
spark/chart/quoteSummary endpoints the app already relies on** for equity quotes,
OHLCV, and fund holdings fallbacks. Whatever position the project takes on Yahoo
options should be consistent with that existing practice rather than a new,
stricter one invented here. The probe determines whether it even works keyless
(cookie/crumb tightening may have closed v7), and whether OI/IV are populated well
enough to be worth rendering.

**Key-gated tiers** (not testable keyless; plan pricing as published, verify before
committing): Tradier (developer sandbox includes delayed options chains on a free
account; production API is account-gated), Polygon (options are a paid plan),
Finnhub (options on paid tiers), Alpha Vantage (options in premium). If chains
become a product priority and Yahoo fails the probe, a Tradier-style keyed
integration through the provider registry is the honest path — key-gated rows that
report `configured: false` when absent, like FMP does today.

## The decision this audit must end with (owner call, framed not made)

The live-only policy has never had to classify **delayed** data. If the only viable
chain source is delayed:

- **Option A — admit an explicit "delayed" category.** New convention: every surface
  showing a delayed number renders the delay in the ProvenanceNotice pattern (always
  visible, never only-when-stale), and the delay metadata travels through
  `/api/v1` verbatim so external consumers cannot mistake delayed for live.
- **Option B — chains stay not-available** until a properly licensed/keyed source is
  configured. Consistent with the existing "no free real-time source → explicit
  notice" stance; costs the chain browser until then.

## Verdicts (to be filled from the probe results)

| Surface | Verdict | Basis |
|---|---|---|
| P2-O3 options chain browser | **pending probe** | Yahoo probe results + delayed-data decision. CBOE keyless path already fails on terms regardless of probe. |
| P2-O4 futures term structure | **pending probe** | Individual-month probe vs the CL=F control. |
| Provider ladder if GO | **pending** | — |

`DATA-AVAILABILITY.md` update: pending the same results.
