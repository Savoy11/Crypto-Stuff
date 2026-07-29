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
  │                          │ rotate refresh token   │
  │◄─200 {new access}────────│                       │
```

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
| A07 | Auth Failures | Refresh token rotation; Redis-backed revocation; MFA support |
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
