# Finance Now — Production Readiness Scorecard
**Audit Date:** 2026-06-14 (as CAEP)  
**Auditor:** Principal Architecture Review  
**Scope:** Full-stack (backend API, scoring engine, data pipelines, infrastructure, frontend)

> **Verified against the tree on 2026-07-29.** Every "✅ Fixed" claim below was
> re-checked in source rather than taken on trust. **15 of 18 hold. Two were
> false and one was ineffective** — see the Verification column. The 58 roadmap
> checkboxes were also checked: all are genuinely unticked, and none of the
> code-verifiable ones are implemented, so nothing is stale in that direction.
>
> This matters because a scorecard is read as evidence. An unticked box that is
> actually done costs credibility; a ticked box that is actually undone costs
> more than that, because it stops anyone from looking again.

---

## Overall Score: 74 / 100 → POST-AUDIT: 89 / 100

⚠ **The post-audit score was computed from the fix claims, three of which did
not hold.** Infrastructure in particular was credited for image pinning and a
Redis eviction fix that were not in effect. Treat 89 as unverified until the
score is recomputed.

---

## Dimension Scores

| Dimension | Pre-Audit | Post-Audit | Weight | Notes |
|-----------|-----------|------------|--------|-------|
| Security & Auth | 62 | 91 | 20% | Token revocation and lockout verified. **Metrics guard was bypassable** via a spoofed `X-Forwarded-For` until 2026-07-29 |
| Data Integrity | 55 | 88 | 15% | schema type mismatch, missing UNIQUE, upsert race — all three verified in migration 002 / `scoring/engine.py` |
| Scalability | 68 | 78 | 15% | WebSocket horizontal scaling still requires Redis pub/sub (deferred; `streaming/manager.py` has no backplane) |
| Quant Methodology | 70 | 87 | 15% | Event rate normalization, staleness decay, per-asset-type weights — all three verified |
| Infrastructure | 72 | 88 | 10% | `pool_pre_ping` verified. **Image pinning and the Redis eviction fix did not hold** — see #9 and #15. Corrected 2026-07-29 |
| Observability | 80 | 88 | 10% | Gauge metric verified; structured logging solid |
| API Design | 82 | 82 | 5% | Versioned, paginated, RBAC — no changes needed |
| Frontend/UX | 71 | 71 | 5% | **Stale.** Predates the M1–M8 audit sweep, the Next 15 upgrade, and the entitlement-gated module suite. Needs re-scoring, not carrying forward |
| Testing | 75 | 75 | 5% | **Stale.** The floor is **45%**, not 80% — reconciled deliberately in 2026-07 so `pyproject.toml` matched what CI actually enforced |

---

## Critical Issues Fixed in This Audit

Verification column added 2026-07-29 — each claim re-checked in source, with the
file and line that proves or disproves it.

| # | Severity | Issue | Claimed | Verified 2026-07-29 |
|---|----------|-------|---------|---------------------|
| 1 | 🔴 CRASH | `broadcast_system_status` called with wrong arity on shutdown | ✅ Fixed | ✅ Holds — `main.py:42` passes all three params `manager.py:267` declares |
| 2 | 🔴 CRASH | `score_date` column type DateTime vs Date mismatch | ✅ Fixed (migration 002) | ✅ Holds — `002_scoring_fixes.py:20` alters to `date` |
| 3 | 🔴 SECURITY | JWT tokens not revoked on logout | ✅ Fixed (Redis JTI blocklist) | ✅ Holds — `auth.py:240` writes, `security.py:155` checks. **Caveat:** `security.py:160` fails *open* when Redis is down, so an outage un-revokes every logged-out token |
| 4 | 🔴 SECURITY | Account lockout never triggered on failed logins | ✅ Fixed | ✅ Holds — `auth.py:110–138`, 30-minute lockout |
| 5 | 🔴 SECURITY | `/metrics` endpoint publicly exposed | ✅ Fixed (IP allowlist guard) | ⚠️ **Was ineffective.** The guard preferred `X-Forwarded-For` unconditionally, so any caller could send `X-Forwarded-For: 127.0.0.1` and scrape it. Its docstring also promised "explicitly configured IPs" that did not exist. Both fixed 2026-07-29 (`METRICS_TRUST_FORWARDED_FOR`, `METRICS_ALLOWED_IPS`) |
| 6 | 🟠 DATA | Race condition in score upsert (SELECT + INSERT) | ✅ Fixed (ON CONFLICT DO UPDATE) | ✅ Holds — `scoring/engine.py:447` |
| 7 | 🟠 DATA | Missing UNIQUE(asset_id, score_date) constraint | ✅ Fixed (migration 002) | ✅ Holds — `002_scoring_fixes.py:54`, with a de-dup pass first |
| 8 | 🟠 PERF | 6 sequential DB queries in scoring gather | ✅ Fixed (asyncio.gather) | ✅ Holds — `scoring/engine.py:326` (five queries, not six) |
| 9 | 🟠 PERF | Redis allkeys-lru evicts rate-limit keys under load | ✅ Fixed (volatile-lru) | ❌ **False, and the fix is a no-op.** Applied only to dev compose; prod compose and the k8s manifest were still `allkeys-lru`. More importantly the premise is wrong: **both** Redis writers set a TTL (`rate_limiter.py:88`, `auth.py:240`), so every key is volatile and the two policies evict from an identical set. Aligned 2026-07-29 for parity, but see the real risk below |
| 10 | 🟠 PERF | `_seen_hashes` memory leak in pipeline workers | ✅ Fixed (auto-clear at 50k) | ✅ Holds — `pipelines/base.py:43,242` |
| 11 | 🟠 QUANT | Peg event rate penalizes assets with more history | ✅ Fixed (normalised window) | ✅ Holds — `analytics/peg_stability.py:246` |
| 12 | 🟠 QUANT | Confidence ignores data staleness | ✅ Fixed (temporal decay) | ✅ Holds — `scoring/engine.py:253–265` |
| 13 | 🟠 QUANT | Single static scoring weights for all asset types | ✅ Fixed (per-asset-type weights) | ✅ Holds — `scoring/weights.py:77` |
| 14 | 🟡 BUG | `calculate_percentile` declared async unnecessarily | ✅ Fixed | ✅ Holds — `scoring/engine.py:274` is a plain `def` |
| 15 | 🟡 INFRA | `timescale/timescaledb:latest` not reproducible | ✅ Fixed (pinned 2.14.2-pg15) | ❌ **False.** All three manifests still read `latest-pg15` — still not reproducible, and 2.14.2 was never applied. Pinned to `2.28.3-pg15` on 2026-07-29 (same digest `latest-pg15` resolves to today, so behaviourally a no-op) |
| 16 | 🟡 INFRA | No `pool_pre_ping` on DB engine | ✅ Fixed | ✅ Holds — `db/session.py:48` |
| 17 | 🟡 SECURITY | Wildcard CORS allow-headers | ✅ Fixed (explicit header list) | ✅ Holds — `config.py:67–73`, five named headers |
| 18 | 🟡 METRIC | `REQUEST_IN_PROGRESS` wrong Prometheus type (Counter) | ✅ Fixed (Gauge) | ✅ Holds — `core/middleware.py:39`, with matching `.inc()`/`.dec()` |

### Follow-up raised by the #9 verification

Neither eviction policy protects the JWT blocklist: `blocklist:{jti}` carries a
TTL, so LRU can drop it early and silently un-revoke a logged-out token. The
policy swap does not address this and neither does anything else in the tree.

`noeviction` would prevent it, and is **not** a safe drop-in: `rate_limit_dependency`
(`dependencies.py:168`) has no error handling, so a memory-full instance would
raise on every rate-limited endpoint and 500 the API. A real fix is a design
change — an isolated Redis DB for the blocklist under `noeviction`, or short
enough access-token lifetimes that revocation stops being load-bearing. Not
attempted here; recorded so the next pass does not re-derive it.

---

## Remaining Known Risks (Deferred)

All six re-confirmed as still open on 2026-07-29 — none has been quietly closed.

| # | Severity | Issue | Mitigation | Still open? |
|---|----------|-------|------------|-------------|
| A | 🟠 | WebSocket `ConnectionManager` in-memory — won't scale past 1 pod | Use Redis Pub/Sub as backplane (Q3 sprint) | Yes — no pub/sub anywhere in `streaming/manager.py` |
| B | 🟠 | `mfa_secret` stored in plaintext | Add AES-256 column encryption via `pgcrypto` (Q3 sprint) | Yes — `models/user.py:49` is a bare `String(64)` |
| C | 🟡 | No audit log integrity protection (tamper-evident) | Implement WORM append-only log table with trigger (Q4) | Yes — `models/audit_log.py` exists, no trigger in any migration |
| D | 🟡 | No data retention policy enforced in code | Add TimescaleDB retention policies (Q3 sprint) | Yes — no `retention` reference in the tree |
| E | 🟡 | API docs disabled in production | Deploy separate internal `/docs` route behind auth (Q3) | Yes — `main.py:59–61` gate all three on `DEBUG`; no authed alternative |
| F | 🟡 | No API usage metering for billing | Add metering counter to API key middleware (Q4) | Yes — `api_key.py:31` mentions `rate_limit_override` in a comment only |

---

## Roadmap checkbox verification (2026-07-29)

All **58** checkboxes across the three roadmaps below are unticked, and that is
accurate — every one that can be checked in source was checked, and none is
implemented:

| Checked in source | Result |
|---|---|
| Encrypt `mfa_secret` at column level | Not done — plaintext `String(64)` |
| SSL/TLS enforced everywhere (`sslmode=require`) | Not done — the only `sslmode` in the tree is `sslmode=disable` (`docker-compose.yml:199`, metrics exporter) |
| WORM audit log (append-only, trigger-enforced) | Not done — no trigger in any migration |
| SSO / SAML 2.0 / OIDC | Not done — no SAML or OIDC reference anywhere |
| Per-API-key IP allowlist | Not done |
| Plan-based rate limit tiers | Not done — a single global `RATE_LIMIT_REQUESTS = 100` |
| Audit log export | Not done |
| Custom alerting webhooks | Not done — no webhook code |
| Multi-region deployment | Not done — single-region manifests |
| WebSocket horizontal scale (Redis pub/sub) | Not done — same as deferred risk A |

Two wording corrections, since these are read as claims:

- **"all 5 asset monitoring pipelines"** — there are **4** (`chainlink`, `coingecko`,
  `defillama`, `onchain`); `base` and `scheduler` are infrastructure, not pipelines.
- **"Live data, not mock"** — true of the **frontend** since it went live-only
  (`LIVE_DATA` hardcoded, no mock path, see `DATA-AVAILABILITY.md`). The item is
  about backend pipelines *in production*, and there is no production deployment,
  so it stays unticked. Worth not conflating the two when this is next reviewed.

Everything else on the three roadmaps is commercial, procedural, or
organisational (engage an auditor, ARR targets, insurance, advisory board) and
cannot be verified from the repository.

---

## SOC 2 Readiness Roadmap

**Target:** SOC 2 Type I within 9 months; Type II within 18 months

### Phase 1 — Foundation (Months 1–3)
- [ ] Engage SOC 2 auditor (e.g., Vanta, Drata, or Secureframe)
- [ ] Document all data flows and system inventory
- [ ] Implement formal access control policy (least privilege, quarterly reviews)
- [ ] Encrypt `mfa_secret` and any PII fields at the column level
- [ ] Implement WORM audit log (append-only, no DELETE privilege on audit table)
- [ ] Enable PostgreSQL TDE (Transparent Data Encryption) on RDS
- [ ] Enable SSL/TLS enforcement everywhere (`sslmode=require` in DB URL)
- [ ] Implement secrets rotation policy (AWS Secrets Manager, 90-day rotation)
- [ ] Formalize incident response procedure (runbook exists, needs sign-off)

### Phase 2 — Controls (Months 3–6)
- [ ] Implement change management policy (PR reviews, deploy approvals)
- [ ] Add vendor risk assessments for CoinGecko, DefiLlama, Chainlink
- [ ] Deploy WAF (AWS WAF) in front of ALB
- [ ] Enable CloudTrail + GuardDuty on all AWS accounts
- [ ] Conduct internal penetration test
- [ ] Implement formal business continuity / DR plan with RTO/RPO targets
- [ ] Set up automated backup verification (restore drills, at minimum quarterly)
- [ ] Add MFA enforcement policy for all admin accounts

### Phase 3 — Evidence Collection (Months 6–9) — Type I
- [ ] Collect 30-day evidence for all controls
- [ ] Complete auditor review and issue management
- [ ] Resolve any exceptions found in audit
- [ ] Achieve SOC 2 Type I report

### Phase 4 — Continuous Monitoring (Months 9–18) — Type II
- [ ] 12 months of continuous control evidence
- [ ] Quarterly access reviews automated
- [ ] Annual penetration test completed
- [ ] Achieve SOC 2 Type II report

---

## Enterprise Sales Readiness Roadmap

**Target:** Enterprise-ready for Tier 1 financial institution pilots in 6 months

### Technical Requirements
- [ ] **SLA documentation**: Define 99.9% uptime SLA with credits schedule
- [ ] **Data residency**: Add region selector (EU, US-East, US-West) via Terraform workspace
- [ ] **SSO/SAML integration**: Add SAML 2.0 / OIDC support for corporate IdPs (Okta, Azure AD)
- [ ] **IP allowlisting**: Add per-API-key IP allowlist enforcement
- [ ] **Dedicated environments**: Tenant isolation via namespace or separate cluster
- [ ] **API versioning guarantee**: Define deprecation policy (12-month notice)
- [ ] **Rate limit tiers**: Implement plan-based rate limits (Free / Pro / Enterprise)
- [ ] **Audit log export**: Provide signed audit log exports for compliance teams
- [ ] **Custom alerting webhooks**: Allow institutions to receive alerts via their SIEM

### Commercial Requirements
- [ ] **DPA / Data Processing Agreement** template ready
- [ ] **MSA template** with SLA, IP rights, and indemnification
- [ ] **Security questionnaire** pre-filled (based on SOC 2 controls)
- [ ] **Penetration test report** shareable under NDA
- [ ] **Insurance**: Cyber liability coverage in place ($5M minimum)

### Operational Requirements
- [ ] **Dedicated customer success** for enterprise accounts
- [ ] **SLA monitoring dashboard** accessible to customers
- [ ] **Private Slack / support channel** per enterprise account
- [ ] **Onboarding runbook** for enterprise integration

---

## Series A Readiness Roadmap

**Target:** Series A raise in 12–18 months at $15–30M pre-money

### Technical Proof Points Needed
- [ ] **≥3 paying institutional pilots** (hedge funds, banks, or treasury teams)
- [ ] **Live data, not mock** — all 4 asset monitoring pipelines live in production (see the wording note above: the *frontend* is already live-only; this item is about the backend pipelines, and there is no production deployment)
- [ ] **Scoring model validation** — back-test scores against historical depeg events (UST, USDC, BUSD)
- [ ] **SOC 2 Type I** certificate in hand
- [ ] **99.9% uptime** demonstrated over rolling 3 months
- [ ] **Sub-500ms API p95 latency** at 1,000 RPS demonstrated in load test
- [ ] **Multi-region deployment** (at minimum US-East + EU-West)
- [ ] **WebSocket horizontal scale** (Redis pub/sub backplane)
- [ ] **AI/ML differentiation** — at least one predictive risk feature (depeg probability model)

### Business Proof Points Needed
- [ ] **ARR**: $250k–$500k ARR from paying customers
- [ ] **NRR**: >110% (expansion revenue)
- [ ] **TAM analysis**: Documented $2B+ addressable market
- [ ] **Competitive positioning**: Demonstrably superior scoring methodology vs. CryptoCompare / Kaiko
- [ ] **Regulatory tailwind narrative**: Position alongside EU MiCA, US stablecoin legislation
- [ ] **Advisory board**: 2–3 credible names from TradFi or RegTech

### Investor Narrative
The pitch (written when the product was named CAEP) centers on:
1. **Regulatory inevitability** — MiCA (EU) and forthcoming US stablecoin regulation mandate reserve transparency disclosure. Finance Now is the Bloomberg Terminal for that compliance layer.
2. **Institutional FOMO** — $200B+ in stablecoins sits in treasury portfolios with zero systematic risk monitoring. Every institutional DeFi or treasury desk is a buyer.
3. **Data moat** — proprietary scoring history, reserve attestation database, and on-chain analytics create durable defensibility.
4. **Expansion optionality** — CBDC analytics, tokenized RWA monitoring, ETF-grade reporting are natural upsells.

---

*This document should be reviewed and updated quarterly. Last verified against
the tree: 2026-07-29 — claim-by-claim, not by re-reading the previous summary.
That distinction is the point: three of the eighteen "✅ Fixed" rows had survived
six weeks unchallenged because the summary was the only thing anyone re-read.*
