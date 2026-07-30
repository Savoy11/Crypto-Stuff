# Finance Now Architecture Overview

## Introduction

The Finance Now (Finance Now) is a full-stack, cloud-native analytics platform designed to ingest real-time and historical data from multiple blockchain and market data sources, compute composite risk and opportunity scores across an asset universe, and deliver insights to analysts and traders via a low-latency REST API and WebSocket streaming interface.

This document describes the architecture decisions, component interactions, and operational characteristics of the platform at the level of detail required for engineering teams, platform operators, and technical reviewers.

---

## System Context

Finance Now operates as a read-heavy analytical system with write-intensive background pipelines. The platform consists of four primary logical tiers:

1. **Data Ingestion Layer** — fetches external market data, on-chain metrics, and DeFi protocol data on configurable schedules
2. **Analytics and Scoring Engine** — computes composite risk scores, liquidity metrics, volatility signals, and alert conditions
3. **API Layer** — exposes the computed data via REST endpoints and real-time WebSocket streams
4. **Presentation Layer** — a Next.js frontend that renders dashboards, portfolio views, and risk alerts

---

## Technology Stack

| Layer | Technology | Rationale |
|---|---|---|
| Backend API | FastAPI 0.109 (Python 3.11) | Native async support, excellent type annotations, auto-generated OpenAPI docs |
| Task Queue | Celery 5.3 + Redis Broker | Reliable distributed task execution; beat scheduler for periodic jobs |
| Time-Series DB | TimescaleDB 2.x on PostgreSQL 15 | Columnar compression, time-series indexes, compatibility with SQLAlchemy ORM |
| Cache / Pub-Sub | Redis 7 | Sub-millisecond latency for pricing cache; pub/sub for WebSocket fan-out |
| Frontend | Next.js 15 (React, TypeScript) | Server-side rendering, App Router, built-in API routes for BFF patterns |
| Reverse Proxy | Nginx 1.25 | Rate limiting, WebSocket upgrade, gzip, security headers |
| Container Orchestration | Kubernetes 1.29 on AWS EKS | Declarative deployments, HPA, anti-affinity for HA |
| Infrastructure as Code | Terraform 1.6 | Reproducible AWS infrastructure; remote state in S3 + DynamoDB |
| Monitoring | Prometheus + Grafana + Alertmanager | Industry-standard open-source observability stack |

---

## Component Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Finance Now Platform Architecture                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   [Browser / Mobile Client]                                                 │
│         │ HTTPS / WSS                                                       │
│   [AWS ALB + WAF]  ←── DDoS protection, TLS termination                    │
│         │                                                                   │
│   [Nginx Reverse Proxy]  ←── Rate limiting, security headers, gzip         │
│         ├──── /          → [Next.js Frontend  :3000]                        │
│         ├──── /api/      → [FastAPI Backend   :8000]                        │
│         └──── /ws/       → [FastAPI WebSocket :8000]                        │
│                                                                             │
│   ┌──────────────────── FastAPI Backend ───────────────────────┐           │
│   │                                                             │           │
│   │  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐  │           │
│   │  │  REST API   │  │  WebSocket   │  │  Background Jobs  │  │           │
│   │  │  (routers)  │  │  Manager     │  │  (Celery Tasks)   │  │           │
│   │  └──────┬──────┘  └──────┬───────┘  └────────┬─────────┘  │           │
│   │         │                │                    │            │           │
│   │  ┌──────▼──────┐  ┌──────▼───────┐  ┌────────▼─────────┐  │           │
│   │  │  Analytics  │  │  Streaming   │  │  Data Ingestion   │  │           │
│   │  │  Engine     │  │  Pub/Sub     │  │  Pipeline         │  │           │
│   │  └──────┬──────┘  └──────┬───────┘  └────────┬─────────┘  │           │
│   │         │                │                    │            │           │
│   └─────────┼────────────────┼────────────────────┼────────────┘           │
│             │                │                    │                        │
│   ┌─────────▼────────┐  ┌────▼────────┐  ┌────────▼───────────────────┐   │
│   │ PostgreSQL 15    │  │  Redis 7    │  │  External Data Sources     │   │
│   │ /TimescaleDB     │  │  Cache +    │  │  ┌──────────────────────┐  │   │
│   │                  │  │  Pub/Sub +  │  │  │ CoinGecko API        │  │   │
│   │ • price_history  │  │  Sessions   │  │  │ DefiLlama API        │  │   │
│   │ • asset_scores   │  │             │  │  │ Chainlink Oracles    │  │   │
│   │ • alerts         │  │             │  │  │ Alchemy/Infura RPC   │  │   │
│   │ • users          │  └─────────────┘  │  └──────────────────────┘  │   │
│   └──────────────────┘                   └───────────────────────────┘    │
│                                                                             │
│   ┌──────────────────── Observability Stack ──────────────────────────┐    │
│   │  Prometheus → Grafana → Alertmanager → Slack / PagerDuty          │    │
│   └───────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Descriptions

### 1. Price Ingestion Flow

```
Celery Beat (every 60s)
  └→ PriceFetchTask
       └→ CoinGeckoClient.get_prices(asset_ids)
            └→ PostgreSQL: INSERT INTO price_history (timescaledb hypertable)
                 └→ Redis: SET price:{asset_id} {price} EX 30
                      └→ Redis PUBLISH channel:prices {update_event}
                           └→ WebSocket Manager: broadcast to subscribed clients
```

**Latency characteristics**: Price updates reach connected WebSocket clients within 200–500ms of the Celery task completing. The Redis pub/sub fan-out adds approximately 1–5ms per connected backend instance.

### 2. Risk Score Calculation Flow

```
Celery Beat (every 5 minutes)
  └→ RiskScoringTask(asset_id)
       ├→ PostgreSQL: SELECT price_history (last 90 days) via TimescaleDB
       ├→ DefiLlamaClient.get_tvl_history(protocol)
       ├→ ChainlinkClient.get_price_feed(asset)
       ├→ AnalyticsEngine.compute_composite_score()
       │    ├→ VolatilityEngine (30d/90d rolling stddev)
       │    ├→ LiquidityEngine (bid/ask spread, volume)
       │    ├→ DefiMetricsEngine (TVL, utilization)
       │    └→ MarketCapEngine (mcap rank, dominance)
       └→ PostgreSQL: UPSERT asset_scores
            └→ Redis: SET score:{asset_id} {score_json} EX 300
```

**Latency characteristics**: Full score recalculation for a single asset takes 50–300ms depending on data availability. Scores are cached in Redis with a 5-minute TTL, so API reads are sub-millisecond for cached assets.

### 3. Alert Evaluation Flow

```
Celery Beat (every 30s)
  └→ AlertEvaluationTask
       └→ PostgreSQL: SELECT alerts WHERE enabled=true
            └→ For each alert:
                 ├→ Redis: GET current price/score
                 ├→ AlertConditionEvaluator.evaluate(condition, current_value)
                 └→ If triggered:
                      ├→ PostgreSQL: INSERT alert_events
                      └→ WebSocket Manager: PUBLISH to user's alert channel
```

### 4. API Request Flow

```
Client → Nginx → FastAPI Router
  ├→ AuthMiddleware: validate JWT, load user from Redis session
  ├→ RateLimitMiddleware: check Redis counter for IP/user
  └→ Route Handler:
       ├→ Redis: GET cached response (if available)
       │    └→ Return 200 with cache hit (< 1ms)
       └→ PostgreSQL: query if cache miss
            └→ Redis: SET response cache
                 └→ Return 200 response
```

**Cache hit rate**: Approximately 85–95% for public endpoints (price data, asset scores) under normal load. Cache TTLs are configured per data type: prices (30s), scores (60s), asset metadata (300s), market stats (120s).

---

## Scaling Characteristics

### Horizontal Scaling

The FastAPI backend is stateless (sessions stored in Redis, no local state). It can be scaled horizontally without coordination. The Kubernetes HPA scales from 3 to 20 replicas based on CPU (>70%) and memory (>80%) utilization.

WebSocket connections use Redis pub/sub for fan-out, meaning any backend pod can serve any client's subscription. There is no sticky session requirement.

### Vertical Scaling Limits

**PostgreSQL / TimescaleDB** is the primary vertical scaling concern. TimescaleDB's chunk-based compression reduces storage by 90–95% for time-series data, but query performance degrades as the dataset grows without proper index maintenance. Partition pruning via time-range queries is essential for maintaining query performance at scale.

**Redis** memory is the primary constraint for the caching layer. With maxmemory set to allkeys-lru eviction, the system degrades gracefully under memory pressure (cache miss rate increases, but correctness is maintained).

### Database Connection Pooling

The backend uses SQLAlchemy async connection pooling:
- Pool size: 20 connections per pod
- Max overflow: 40 additional connections
- Pool recycle: 3600s (prevents stale connections)
- Pre-ping: enabled (validates connections before use)

With 3 backend pods, the maximum sustained connection count to PostgreSQL is approximately 180 connections (3 pods × 60 max connections). The HPA can scale to 20 pods × 60 = 1200 max connections, which is within Aurora PostgreSQL's max_connections of 5000 for `db.r6g.large`.

---

## Failure Modes and Resilience

| Component | Failure Mode | Mitigation |
|---|---|---|
| CoinGecko API down | Price data becomes stale | Fallback to cached prices; stale-data alert fires after 3 minutes |
| Redis down | Cache misses, sessions lost | Backend falls through to PostgreSQL; graceful degradation |
| PostgreSQL writer down | Write failures | Aurora auto-failover to reader (< 30s); brief write outage |
| Single EKS node down | Pod eviction | Anti-affinity ensures replicas on different nodes; HPA maintains min 3 replicas |
| Celery worker down | Delayed data updates | Beat scheduler retries tasks; dead-letter queue captures failures |
| Chainlink oracle stale | Stale on-chain prices | Fallback to CoinGecko prices; staleness logged and alerted |
| ALB unhealthy | Traffic routed to healthy targets | ALB health checks every 30s; unhealthy targets drained within 60s |

---

## API Design Principles

The REST API follows these conventions:
- **Versioning**: URI-based (`/api/v1/`). Breaking changes increment the version.
- **Pagination**: Cursor-based pagination for lists (`cursor` + `limit` parameters).
- **Error format**: RFC 7807 Problem Details (`type`, `title`, `status`, `detail`, `instance`).
- **Idempotency**: Mutation endpoints accept `Idempotency-Key` headers for safe retries.
- **Rate limiting**: Per-user: 100 req/min for authenticated; 20 req/min for unauthenticated.
- **Filtering**: Query parameters follow `filter[field]=value` convention for list endpoints.

---

## Decision Log

| Decision | Chosen | Alternatives Considered | Rationale |
|---|---|---|---|
| Time-series storage | TimescaleDB | InfluxDB, QuestDB, ClickHouse | PostgreSQL compatibility; SQLAlchemy support; avoid polyglot persistence |
| Task queue | Celery + Redis | Dramatiq, RQ, Temporal | Ecosystem maturity; built-in beat scheduler; broad documentation |
| Frontend framework | Next.js 15 | Vite+React SPA, Remix | SSR for SEO; App Router for server components; Vercel ecosystem |
| Container orchestration | EKS | ECS, self-managed k8s | Managed control plane; Helm ecosystem; team familiarity |
| IaC tool | Terraform | Pulumi, CDK | Provider ecosystem; module registry; team familiarity |
| Reverse proxy | Nginx | Traefik, Caddy | Proven performance; flexible rate limiting; extensive documentation |
