# Local Development Setup

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Docker | ≥ 24.0 | [docs.docker.com](https://docs.docker.com/get-docker/) |
| Docker Compose | ≥ 2.20 | Included with Docker Desktop |
| Node.js | 20 LTS | [nodejs.org](https://nodejs.org) |
| Python | 3.11+ | [python.org](https://python.org) |
| Poetry | 1.8+ | `pip install poetry` |

---

## Quick Start (Docker)

The fastest way to run the full stack:

```bash
# 1. Clone the repository
git clone https://github.com/Savoy11/finance-now.git
cd finance-now

# 2. Copy environment files
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local  # Create if not present

# 3. Start all services
docker compose -f infrastructure/docker/docker-compose.yml up -d

# 4. Wait for services to be healthy (~30 seconds)
docker compose -f infrastructure/docker/docker-compose.yml ps

# 5. Run database migrations
docker compose -f infrastructure/docker/docker-compose.yml exec backend \
  alembic upgrade head

# 6. Access the platform
open http://localhost:3000      # Frontend dashboard
open http://localhost:8000/docs # Backend API docs (debug mode)
open http://localhost:3001      # Grafana (admin/admin)
open http://localhost:9090      # Prometheus
```

---

## Manual Development Setup

### Backend

```bash
cd backend

# Install dependencies
poetry install

# Configure environment
cp .env.example .env
# Edit .env with your values — at minimum set:
#   DATABASE_URL=postgresql+asyncpg://fn:fn@localhost:5432/fn
#   REDIS_URL=redis://localhost:6379/0
#   SECRET_KEY=$(python -c "import secrets; print(secrets.token_hex(32))")

# Start external services (Postgres + Redis only)
docker compose -f ../infrastructure/docker/docker-compose.yml up -d postgres redis

# Run migrations
poetry run alembic upgrade head

# Start the API server (hot-reload)
poetry run uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Configure environment
cat > .env.local << 'EOF'
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws
NEXT_PUBLIC_USE_MOCK=true
EOF

# Start dev server
npm run dev
# App available at http://localhost:3000
```

### Running Tests

```bash
# Backend unit + integration tests
cd backend
poetry run pytest -v --cov=app

# Frontend type check
cd frontend
npm run type-check

# Frontend lint
npm run lint
```

---

## Environment Variables Reference

### Backend (`.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | — | PostgreSQL async connection string |
| `REDIS_URL` | — | Redis connection string |
| `SECRET_KEY` | — | JWT signing secret (min 32 chars) |
| `DEBUG` | `false` | Enable debug mode + docs UI |
| `COINGECKO_API_KEY` | — | CoinGecko Pro API key |
| `CORS_ORIGINS` | `[]` | JSON array of allowed origins |

### Frontend (`.env.local`)

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | — | Backend API base URL |
| `NEXT_PUBLIC_WS_URL` | — | WebSocket base URL |
| `NEXT_PUBLIC_USE_MOCK` | `false` | Use mock data (no backend needed) |

---

## Common Issues

**Port conflicts**: If `5432` or `6379` are in use, change `ports:` in `docker-compose.yml`.

**Migration errors**: Ensure TimescaleDB extension is installed:
```bash
docker exec -it fn-postgres psql -U fn -c "CREATE EXTENSION IF NOT EXISTS timescaledb;"
```

**Frontend auth redirect loop**: Ensure `NEXT_PUBLIC_USE_MOCK=true` in `.env.local` for local development without backend.

**CORS errors**: Add `http://localhost:3000` to `CORS_ORIGINS` in `backend/.env`.
