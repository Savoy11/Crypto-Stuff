# Security Architecture

## Overview

Finance Now implements a defense-in-depth security posture designed to meet enterprise and institutional standards, including preparation for SOC2 Type II compliance.

---

## Threat Model (STRIDE)

| Threat | Asset | Mitigation |
|--------|-------|------------|
| **Spoofing** | API endpoints | JWT + refresh token auth; API key hashing (SHA-256) |
| **Tampering** | Market data | Source validation; cryptographic checksums; audit log immutability |
| **Repudiation** | User actions | Append-only audit log with IP, timestamp, user agent |
| **Information Disclosure** | PII, credentials | Encryption at rest (AES-256); TLS 1.2+ in transit; secrets manager |
| **Denial of Service** | API tier | Redis sliding-window rate limiting; WAF rules; autoscaling |
| **Elevation of Privilege** | Admin functions | RBAC with role enforcement on every protected route |

---

## Authentication Flow

> ⚠ **Scope: this diagram is the BACKEND's auth flow, not the application's.**
> Corrected 2026-07-28 — it previously read as *the* way Finance Now authenticates,
> which has not been true since the audit's M2 remediation.
>
> **What the app actually does:** the Next.js frontend signs in through **Auth.js**
> (`next-auth` v5) with a Credentials provider and a **JWT session strategy**,
> against its own `users` table — see `frontend/src/lib/auth/config.ts`. There is
> no access/refresh token pair, no Redis refresh store, and no `Authorization:
> Bearer` header on the path a user actually takes. `getCurrentUserId()`
> (`lib/auth/session.ts`) is what DB-backed features read.
>
> M2 found the two stacks resolved *different identities* and deleted the
> frontend's half: `useAuthStore`, `lib/api/auth.ts`, the legacy auth DTOs, and
> the axios token/refresh interceptors are gone. The login wall itself is
> currently off, with local-user mode gated behind `FN_ALLOW_LOCAL_USER`.
>
> **The flow below is still real** — `backend/app/api/v1/auth.py` implements
> `/login`, `/refresh`, `/logout`, `/me` and MFA enrolment, and the RBAC matrix
> that follows describes those endpoints accurately. But `LIVE_DATA` is hardcoded
> `true`, so the frontend never calls them. Treat this section as documentation of
> the optional backend service, and do not reason about the app's sign-in from it.

```
Client                    Backend                  Redis
  │                          │                       │
  │──POST /auth/login────────►│                       │
  │                          │ verify password        │
  │                          │ create access_token    │
  │                          │ create refresh_token   │
  │                          │──store refresh────────►│
  │◄─200 {access, refresh}───│                       │
  │                          │                       │
  │──GET /api/v1/assets──────►│                       │
  │  Authorization: Bearer   │ decode JWT             │
  │  <access_token>          │ verify exp + sig       │
  │◄─200 assets─────────────│                       │
  │                          │                       │
  │  (access expired)        │                       │
  │──POST /auth/refresh──────►│                       │
  │  {refresh_token}         │──lookup refresh───────►│
  │                          │◄─found, valid──────────│
  │                          │ (no rotation — see A07) │
  │◄─200 {new access}────────│                       │
```

> The diagram's `/refresh` step said "rotate refresh token". It does not — the
> handler returns a new access token only. Corrected 2026-07-29.

---

## RBAC Matrix

| Permission | Viewer | Analyst | Admin |
|-----------|--------|---------|-------|
| List assets | ✅ | ✅ | ✅ |
| View asset analytics | ✅ | ✅ | ✅ |
| View risk scores | ✅ | ✅ | ✅ |
| Create/update assets | ❌ | ❌ | ✅ |
| Trigger score recalculation | ❌ | ✅ | ✅ |
| Manage users | ❌ | ❌ | ✅ |
| View audit logs | ❌ | ❌ | ✅ |
| Generate API keys | ❌ | ✅ | ✅ |
| Manage watchlists | Own | Own | All |

---

## Encryption

### At Rest
- PostgreSQL data: AES-256 via AWS RDS encryption (KMS-managed keys)
- Redis: in-memory only; encrypted EBS volumes on EC2
- S3 artifacts (report exports): SSE-S3 minimum, SSE-KMS for sensitive data
- Secrets: AWS Secrets Manager with automatic rotation

### In Transit
- All HTTP: TLS 1.2 minimum, TLS 1.3 preferred
- DB connections: SSL required (`sslmode=require`)
- Inter-service: mTLS within Kubernetes cluster (Istio service mesh optional)
- WebSocket: WSS (TLS-wrapped WebSocket)

---

## Secrets Management

Secrets are **never** committed to source control.

| Secret | Storage | Rotation |
|--------|---------|---------|
| `SECRET_KEY` (JWT signing) | AWS Secrets Manager | 90 days |
| Database credentials | AWS RDS Secrets Manager | 30 days |
| Redis auth token | AWS ElastiCache | Manual |
| API provider keys (CoinGecko, etc.) | AWS Secrets Manager | On expiry |
| SSL certificates | cert-manager (Let's Encrypt) | 90 days auto |

---

## OWASP Top 10 Mitigations

| # | Risk | Mitigation |
|---|------|-----------|
| A01 | Broken Access Control | RBAC on every endpoint; route-level `require_role` |
| A02 | Cryptographic Failures | bcrypt for passwords; HMAC-SHA256 for JWTs; TLS everywhere |
| A03 | Injection | Parameterized queries (SQLAlchemy ORM); Pydantic input validation |
| A04 | Insecure Design | Threat modeled; least-privilege IAM; immutable audit logs |
| A05 | Security Misconfiguration | Security headers middleware; Dockerfile non-root user |
| A06 | Vulnerable Components | Dependabot; `pip audit`; weekly dependency scan |
| A07 | Auth Failures | Redis-backed revocation (wired 2026-07-29 — see Token revocation); 10-min access tokens; account lockout; MFA support. ⚠ **No refresh-token rotation** — this row claimed it and `/refresh` does not do it: it issues a new access token and leaves the refresh token unchanged for its full 7 days, so a stolen one is reusable and undetectable. Rotation with reuse-detection is an open follow-up |
| A08 | Integrity Failures | Content-Security-Policy; signed Docker images |
| A09 | Logging Failures | Structured JSON logs; centralized CloudWatch; audit trail |
| A10 | SSRF | No user-controlled URLs; allowlist for external API calls |

---

## Security Headers

All responses include:
```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Content-Security-Policy: default-src 'self'; script-src 'self'; ...
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

---

## Rate Limiting

Redis sliding-window rate limiter:
- Unauthenticated: **20 req/min** per IP
- Viewer: **100 req/min** per user
- Analyst: **300 req/min** per user
- Admin: **1000 req/min** per user
- API Key: configurable per key (default 200 req/min)

Exceeded limits return `429 Too Many Requests` with `Retry-After` header.

---

## Token revocation

A JWT is self-validating — the server verifies the signature and expiry without
a lookup, which is what makes it fast and also why logging out cannot, by
itself, invalidate one. So `/logout` writes `blocklist:<jti>` to Redis with a
TTL matching the token's own expiry (entries therefore clean themselves up and
the blocklist can never outgrow the set of still-valid tokens), and every
authenticated path checks it via **`verify_token_not_revoked`**.

> ⚠ **Use `verify_token_not_revoked`, never plain `verify_token`, on any path
> that authenticates a caller.** Until 2026-07-29 that function had zero call
> sites: the blocklist was written on every logout and read by nothing, so
> revocation did not work for six weeks while being recorded as a completed
> control. `get_current_user`, the WebSocket handshake and `/refresh` now all
> call it. `/refresh` is the most important of the three — a live refresh token
> mints new access tokens for its full 7 days.

Logout revokes **both** tokens. Blocklisting only the refresh token, as it did
originally, leaves the current access token working until its own expiry.

### Why access tokens are 10 minutes

`ACCESS_TOKEN_EXPIRE_MINUTES` is **10**, down from 30, and this is a security
control rather than a tuning choice. The blocklist depends on Redis being
reachable and **fails open** when it is not (below), so the token's expiry is
the only bound that always holds. Shortening it caps exposure in every failure
mode at once — eviction, Redis outage, and a straightforwardly stolen token —
where revocation only covers the paths it can reach. The cost is more `/refresh`
calls: one signature check plus one indexed user lookup each.

Do not raise it back toward 30 without also removing the fail-open behaviour,
and a test asserts it stays ≤ 15.

### Fail-open, deliberately

If Redis cannot be reached, the blocklist check logs `blocklist_check_failed`
and allows the request. A Redis outage degrades revocation rather than becoming
a total auth outage; the 10-minute lifetime is what bounds the damage. Set
`BLOCKLIST_FAIL_CLOSED=true` to reject instead — sensible only with Redis
deployed for high availability.

### Known gap: eviction

Redis evicts least-recently-used keys under memory pressure, and a blocklist
entry is by nature never read again after the first check, so it is exactly
what LRU discards first — silently un-revoking that token. `volatile-lru` does
**not** help (every key this app writes has a TTL, so both policies evict from
the same set), and `noeviction` on the shared instance is unsafe because
`rate_limit_dependency` has no error handling and a full instance would 500
every rate-limited endpoint.

The belt-and-braces fix is an isolated Redis DB for the blocklist under
`noeviction`. It is a deployment change and is not load-bearing given the
10-minute lifetime, so it is recorded rather than done.

---

## Proxy trust (`X-Forwarded-For`)

`X-Forwarded-For` is a **claim by the caller**, not a fact, unless a proxy in
front of the app overwrites it. `settings.TRUST_FORWARDED_FOR` (default
**`False`**) is the single switch that says whether this deployment has such a
proxy. One flag, not one per consumer: the answer is a property of the network
topology and cannot differ between two readers of the same header.

Two places consume it, and both were wrong until 2026-07-29:

| Consumer | Was | Now |
|---|---|---|
| `/metrics` IP allowlist (`main.py`) | Preferred the header unconditionally — **any caller could send `X-Forwarded-For: 127.0.0.1` and scrape it**, defeating the allowlist entirely | Peer address decides; header honoured only when `TRUST_FORWARDED_FOR` is set. `METRICS_ALLOWED_IPS` adds non-loopback scrapers |
| Request log `client_ip` (`core/middleware.py`) | Same pattern, so the field an investigation pivots on was caller-controlled | Logs the peer address as `client_ip`; an untrusted claim is logged separately as `claimed_forwarded_for`, keeping the diagnostic value without letting it masquerade as verified |

**When deploying behind an ALB / ingress / reverse proxy**, set
`TRUST_FORWARDED_FOR=true` — but only after confirming the proxy *overwrites*
rather than appends, and that nothing can reach the app directly, or the
protection is gone again. Both behaviours are covered by tests
(`tests/test_api/test_metrics_guard.py`, `tests/test_api/test_request_logging_ip.py`),
each verified to fail against the pre-fix code.

---

## Hardening Checklist

- [ ] Change default `SECRET_KEY` before production deployment
- [ ] Enable MFA for all admin accounts
- [ ] Rotate all API keys from `.env.example` defaults
- [ ] Enable AWS GuardDuty on the account
- [ ] Configure WAF rules on ALB
- [ ] Enable RDS automated backups (7-day retention minimum)
- [ ] Verify TLS certificate auto-renewal
- [ ] Enable CloudTrail for AWS API audit logging
- [x] Run `pip audit` and `npm audit` in CI — done, with a caveat worth knowing:
      the Security Scan job runs `npm audit --audit-level=high`, `safety check`
      (the pip-audit equivalent) **and** a Trivy filesystem scan. The first two
      are `|| true`, so they report without gating; **only Trivy actually fails
      the build.** Removing those `|| true`s is the follow-up, and it is not free
      — `npm audit` currently reports 23 dev-tooling advisories that have no
      non-breaking fix, so it would fail CI on day one.
- [x] Configure Dependabot for weekly dependency updates — `.github/dependabot.yml`
      covers npm (frontend + mcp-server), pip (backend), GitHub Actions, and the
      frontend Docker base image.
- [ ] Perform penetration test before production launch
