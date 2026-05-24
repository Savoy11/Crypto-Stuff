# CAEP — Crypto Asset Evaluation Platform

Institutional-grade stablecoin analytics: risk scores, reserve transparency, peg stability, and real-time alerts. Bloomberg Terminal-style dark UI.

---

## Running the Application

### Option 1 — Frontend Only (Mock Data) — Recommended for quick start

No backend, database, or API keys required.

```bash
cd frontend
cp .env.local.example .env.local   # or create .env.local manually (see below)
npm install
npm run dev
```

Create `frontend/.env.local` with:
```
NEXT_PUBLIC_USE_MOCK=true
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
```

Open [http://localhost:3000](http://localhost:3000) — the app runs entirely on mock data for all 10 stablecoins (USDC, USDT, DAI, FRAX, TUSD, BUSD, PYUSD, USDP, GUSD, LUSD).

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
| Frontend | Next.js 14, TypeScript, Tailwind CSS, Recharts, Zustand |
| Backend | FastAPI, SQLAlchemy (async), Pydantic v2 |
| Database | TimescaleDB (PostgreSQL + time-series hypertables) |
| Cache / Queue | Redis |
| Auth | JWT with refresh token rotation, RBAC, MFA (TOTP) |
| Real-time | WebSocket streaming, per-asset subscriptions |
| Infrastructure | Docker, docker-compose |
