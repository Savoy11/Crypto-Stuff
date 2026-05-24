#!/usr/bin/env bash
#
# CAEP - Crypto Asset Evaluation Platform
# One-shot local setup / installer (macOS / Linux / WSL)
#
# Installs every prerequisite needed to run the app locally, configures
# environment files, installs dependencies, and (optionally) launches it.
#
# USAGE
#   ./setup.sh                 # mock mode: install Node + deps, start the frontend (recommended)
#   ./setup.sh --full          # full stack: build & run all services via Docker Compose
#   ./setup.sh --install-only  # install + configure everything, but do NOT start the app
#   ./setup.sh --help          # show this help
#
# MODES
#   mock (default)  Frontend only with built-in mock data. Needs: Node.js 18.17+.
#                   No backend, database, or API keys required. http://localhost:3000
#   full            Frontend + FastAPI backend + TimescaleDB + Redis (+ monitoring) via
#                   Docker Compose. Needs: Docker. First run downloads images and builds.

set -euo pipefail

MODE="mock"
INSTALL_ONLY=0

for arg in "$@"; do
  case "$arg" in
    --full)         MODE="full" ;;
    --mock)         MODE="mock" ;;
    --install-only) INSTALL_ONLY=1 ;;
    -h|--help)      grep '^#' "$0" | sed 's/^# \{0,1\}//' | sed '1d'; exit 0 ;;
    *) echo "Unknown option: $arg (try --help)"; exit 1 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
ENV_FILE="$FRONTEND_DIR/.env.local"
COMPOSE_FILE="$SCRIPT_DIR/infrastructure/docker/docker-compose.yml"
DOCKER_ENV="$SCRIPT_DIR/infrastructure/docker/.env"
MIN_NODE_MAJOR=18
MIN_NODE_MINOR=17

CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; GRAY='\033[0;90m'; RESET='\033[0m'
header() {
  echo ""
  echo -e "${CYAN}==============================================${RESET}"
  echo -e "${CYAN}  CAEP - Crypto Asset Evaluation Platform${RESET}"
  echo -e "${CYAN}  Local Setup${RESET}"
  echo -e "${CYAN}==============================================${RESET}"
  echo ""
}
step() { echo -e "${CYAN}> $1${RESET}"; }
ok()   { echo -e "${GREEN}  [OK] $1${RESET}"; }
note() { echo -e "${GRAY}  [..] $1${RESET}"; }
warn() { echo -e "${YELLOW}  [!]  $1${RESET}"; }
fail() { echo -e "${RED}  [X]  $1${RESET}"; exit 1; }

has() { command -v "$1" >/dev/null 2>&1; }

node_ok() {
  has node || return 1
  local raw maj min
  raw="$(node --version)"        # e.g. v20.11.1
  raw="${raw#v}"
  maj="${raw%%.*}"
  min="${raw#*.}"; min="${min%%.*}"
  if [ "$maj" -gt "$MIN_NODE_MAJOR" ]; then return 0; fi
  if [ "$maj" -eq "$MIN_NODE_MAJOR" ] && [ "$min" -ge "$MIN_NODE_MINOR" ]; then return 0; fi
  return 1
}

install_node() {
  step "Checking for Node.js (${MIN_NODE_MAJOR}.${MIN_NODE_MINOR}+)..."
  if node_ok; then ok "Node.js present: $(node --version)"; return; fi

  if has node; then
    warn "Node.js $(node --version) is older than required v${MIN_NODE_MAJOR}.${MIN_NODE_MINOR}. Installing LTS via nvm..."
  else
    warn "Node.js not found. Installing LTS via nvm..."
  fi

  if ! has nvm && [ ! -d "$HOME/.nvm" ]; then
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  fi
  export NVM_DIR="$HOME/.nvm"
  # shellcheck disable=SC1091
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

  if ! has nvm; then
    fail "Could not install nvm. Install Node.js 18.17+ from https://nodejs.org and re-run."
  fi
  nvm install --lts
  nvm use --lts
  node_ok || fail "Node.js still does not meet the minimum version after install."
  ok "Node.js installed: $(node --version)"
}

docker_running() { has docker && docker info >/dev/null 2>&1; }

install_docker() {
  step "Checking for Docker..."
  if ! has docker; then
    warn "Docker not found."
    echo -e "  Install Docker, then re-run: ${RESET}./setup.sh --full"
    echo -e "    macOS / Windows : https://www.docker.com/products/docker-desktop/"
    echo -e "    Linux           : https://docs.docker.com/engine/install/"
    exit 1
  fi
  ok "Docker present: $(docker --version)"
  if ! docker_running; then
    warn "Docker is installed but the engine is not running. Start Docker and re-run."
    exit 1
  fi
  ok "Docker engine is running."
}

setup_frontend_env() {
  step "Configuring frontend environment (.env.local)..."
  if [ -f "$ENV_FILE" ]; then ok ".env.local already exists - leaving it untouched."; return; fi
  cat > "$ENV_FILE" << 'EOF'
NEXT_PUBLIC_USE_MOCK=true
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
EOF
  ok ".env.local created (mock data enabled)."
}

setup_docker_env() {
  step "Configuring Docker environment (.env)..."
  if [ -f "$DOCKER_ENV" ]; then ok "infrastructure/docker/.env already exists - leaving it untouched."; return; fi
  cat > "$DOCKER_ENV" << 'EOF'
# Optional third-party API keys. The stack runs without them; fill in for live data.
COINGECKO_API_KEY=
DEFILLAMA_API_KEY=
CHAINLINK_RPC_URL=https://eth-mainnet.public.blastapi.io
EOF
  ok "infrastructure/docker/.env created (blank optional keys)."
}

install_frontend_deps() {
  step "Installing frontend dependencies (may take a minute)..."
  cd "$FRONTEND_DIR"
  if [ -f package-lock.json ]; then npm ci; else npm install; fi
  ok "Dependencies installed."
}

start_mock() {
  step "Starting the frontend..."
  echo ""
  echo -e "  App URL: ${GREEN}http://localhost:3000${RESET}   (Ctrl+C to stop)"
  echo ""
  cd "$FRONTEND_DIR"
  npm run dev
}

start_full() {
  step "Building and starting the full stack (Docker Compose)..."
  echo ""
  echo -e "  Frontend:    ${GREEN}http://localhost:3000${RESET}"
  echo -e "  Backend API: ${GREEN}http://localhost:8000${RESET}"
  echo -e "  API docs:    ${GREEN}http://localhost:8000/docs${RESET}"
  echo -e "  Grafana:     ${GREEN}http://localhost:3001${RESET} (admin/admin)"
  echo -e "  ${GRAY}First run downloads images and builds - can take several minutes.${RESET}"
  echo ""
  docker compose -f "$COMPOSE_FILE" up --build
}

header
note "Mode: $MODE$([ "$INSTALL_ONLY" -eq 1 ] && echo '  (install only, will not launch)')"
echo ""

if [ "$MODE" = "mock" ]; then
  install_node
  setup_frontend_env
  install_frontend_deps
  if [ "$INSTALL_ONLY" -eq 1 ]; then
    echo ""; ok "Setup complete. Start any time with:  cd frontend && npm run dev  (http://localhost:3000)"
  else
    start_mock
  fi
else
  [ -f "$COMPOSE_FILE" ] || fail "Compose file not found at $COMPOSE_FILE"
  install_docker
  setup_docker_env
  if [ "$INSTALL_ONLY" -eq 1 ]; then
    echo ""; ok "Setup complete. Start the full stack with:  docker compose -f \"$COMPOSE_FILE\" up --build"
  else
    start_full
  fi
fi
