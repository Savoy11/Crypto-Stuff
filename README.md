# CAEP — Crypto Asset Evaluation Platform

CAEP helps you **evaluate crypto assets and act on that evaluation** — in one place, through a Bloomberg Terminal-style dashboard or programmatically through an AI-agent-native API.

The project started as institutional-grade stablecoin risk analytics (risk scores, reserve transparency, peg stability) and has grown into a full evaluation platform covering ~100 assets: the top 50 Layer 1 coins and top 50 stablecoins.

## What it does

**Evaluate** — understand an asset before you touch it:
- **Risk scores** — multi-dimensional scoring engine (backend) with per-asset-type weights
- **Reserve transparency** — reserve composition and attestation tracking for stablecoins
- **News & sentiment** — multi-provider news feed with per-coin filtering, sentiment tagging, and asset detection
- **Technical analysis, backtests, and research** — charting, indicators, and AI-assisted investigation (including a pump-and-dump report agent)
- **Global adoption, social sentiment, alerts, and watchlists**

**Act** — once you've evaluated, do the thing cheaply and safely:
- **Transfer Fee Calculator** — cheapest withdrawal route across 25 exchanges × 16 coins × 16 networks, including multi-hop routes via a personal wallet, with live BTC fees and gas prices
- **Staking Opportunities** — 18 providers (CeFi, wallet, liquid) with a 6-dimension risk profile per provider, live APRs from Lido/Marinade/Jito, and Celsius kept as the cautionary example

**Automate** — the same data, built for machines:
- **Agent REST API** (`/api/v1/`) — flat, CORS-enabled, self-describing endpoints with an OpenAPI 3.0 spec, designed for AI agents and scripts
- **MCP server** (`mcp-server/`) — exposes CAEP tools (prices, transfer routes, staking risk, news, fees) to Claude and any MCP-compatible agent

The frontend runs fully standalone: live market data comes from public APIs (CoinGecko, mempool.space, Lido, Marinade, Jito — no keys required), and everything that needs the backend falls back to mock data automatically.

---

## Running the Application

### Option 1 — Frontend Only — Recommended for quick start

No backend, database, or API keys required.

```bash
cd frontend
npm install
npm run dev
```

Optionally create `frontend/.env.local` to tune behavior:
```
NEXT_PUBLIC_USE_MOCK=true                   # force mock data everywhere
NEXT_PUBLIC_LIVE_DATA=true                  # live CoinGecko prices (default: true)
NEXT_PUBLIC_API_URL=http://localhost:8000   # backend API (optional)
NEXT_PUBLIC_WS_URL=ws://localhost:8000      # backend WebSocket (optional)
ANTHROPIC_API_KEY=sk-ant-...                # only for AI agent features (research, pump report)
```

Open [http://localhost:3000](http://localhost:3000). Prices, network fees, and staking APRs are live; risk scores, reserves, alerts, and other backend-driven pages use mock data until a backend is connected.

---

### Option 2 — Full Stack with Docker

Requires Docker and Docker Compose.

```bash
cp infrastructure/docker/.env.example infrastructure/docker/.env   # fill in secrets
docker compose -f infrastructure/docker/docker-compose.yml up --build
```

Services started:
| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| API Docs (Swagger) | http://localhost:8000/docs |
| TimescaleDB | localhost:5432 |
| Redis | localhost:6379 |

---

### Option 3 — Native Development (Frontend + Backend)

**Backend:**
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in DB/Redis/JWT config
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

---

## Agent API (`/api/v1/`)

A CORS-enabled REST API for programmatic consumption, separate from the UI's internal routes. Discovery endpoint lists everything:

```
GET /api/v1/                      # discovery — endpoints, coins, networks
GET /api/v1/prices?coins=btc,eth
GET /api/v1/exchanges?tier=1
GET /api/v1/network-fees
GET /api/v1/transfer/routes?from=binance&to=coinbase&coin=usdt&amount=1000
GET /api/v1/staking/opportunities?coin=eth&category=liquid&max_risk=5
GET /api/v1/news?coin=btc&sentiment=negative&limit=10
GET /api/v1/openapi.json          # full OpenAPI 3.0 spec
```

## MCP Server

`mcp-server/` is a standalone Node.js MCP server exposing CAEP tools (`get_coin_prices`, `find_transfer_routes`, `get_staking_opportunities`, `compare_staking_risk`, `get_network_fees`, `get_crypto_news`, `list_exchanges`) to any MCP-compatible agent. It calls the `/api/v1/` endpoints, so the frontend must be running.

```bash
cd mcp-server
npm install && npm run build
# point your MCP client at dist/index.js with CAEP_BASE_URL=http://localhost:3000
```

---

## Production Build

```bash
cd frontend
npm run build
npm start
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS, Recharts, Zustand, TanStack Query |
| Backend | FastAPI, SQLAlchemy (async), Pydantic v2 |
| Database | TimescaleDB (PostgreSQL + time-series hypertables) |
| Cache / Queue | Redis |
| Auth | JWT with refresh token rotation, RBAC, MFA (TOTP) |
| Real-time | WebSocket streaming, per-asset subscriptions |
| AI | Multi-provider agent layer (Anthropic, OpenAI, and others) for research & investigation |
| Infrastructure | Docker, docker-compose, Terraform, Kubernetes manifests |

## Repository Layout

```
frontend/      Next.js app — dashboard UI, /live-data proxy routes, /api/v1 agent API
backend/       FastAPI service — scoring engine, pipelines, streaming, auth
mcp-server/    MCP server exposing CAEP tools to AI agents
infrastructure/ Docker, Terraform, Kubernetes
docs/          Architecture, deployment, runbooks, production-readiness audit
```
