#!/usr/bin/env bash
set -e

# ─────────────────────────────────────────────
#  Finance Now — Multi-Asset Financial Analytics
#  Setup & Launch Script
# ─────────────────────────────────────────────

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
RESET='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

print_header() {
  echo ""
  echo -e "${CYAN}${BOLD}╔══════════════════════════════════════════════════╗${RESET}"
  echo -e "${CYAN}${BOLD}║   Finance Now — Multi-Asset Financial Analytics  ║${RESET}"
  echo -e "${CYAN}${BOLD}║   Setup Script                                   ║${RESET}"
  echo -e "${CYAN}${BOLD}╚══════════════════════════════════════════════════╝${RESET}"
  echo ""
}

step() { echo -e "${CYAN}${BOLD}▶ $1${RESET}"; }
ok()   { echo -e "${GREEN}  ✓ $1${RESET}"; }
warn() { echo -e "${YELLOW}  ⚠ $1${RESET}"; }
fail() { echo -e "${RED}  ✗ $1${RESET}"; exit 1; }

# ── 1. Check OS ──────────────────────────────
detect_os() {
  case "$(uname -s)" in
    Darwin) echo "mac" ;;
    Linux)  echo "linux" ;;
    MINGW*|MSYS*|CYGWIN*) echo "windows" ;;
    *) echo "unknown" ;;
  esac
}

OS=$(detect_os)

# ── 2. Install Node.js if missing ────────────
install_node() {
  step "Checking for Node.js..."

  if command -v node &>/dev/null; then
    NODE_VERSION=$(node --version)
    ok "Node.js already installed: $NODE_VERSION"
    return
  fi

  warn "Node.js not found. Installing via nvm..."

  # Install nvm
  if ! command -v nvm &>/dev/null && [ ! -d "$HOME/.nvm" ]; then
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  fi

  # Load nvm into current shell
  export NVM_DIR="$HOME/.nvm"
  # shellcheck disable=SC1091
  [ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"

  if ! command -v nvm &>/dev/null; then
    fail "Could not install nvm. Please install Node.js manually from https://nodejs.org and re-run this script."
  fi

  nvm install --lts
  nvm use --lts
  ok "Node.js installed: $(node --version)"
}

# ── 3. Create .env.local if missing ──────────
setup_env() {
  step "Checking .env.local..."

  ENV_FILE="$FRONTEND_DIR/.env.local"

  if [ -f "$ENV_FILE" ]; then
    ok ".env.local already exists — skipping"
    return
  fi

  cat > "$ENV_FILE" << 'EOF'
NEXT_PUBLIC_USE_MOCK=true
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws
EOF

  ok ".env.local created with mock data enabled"
}

# ── 4. Install npm dependencies ───────────────
install_deps() {
  step "Installing dependencies (this may take a minute)..."

  cd "$FRONTEND_DIR"

  if [ -d "node_modules" ] && [ -f "node_modules/.package-lock.json" ]; then
    ok "node_modules already present — running npm ci for clean install"
    npm ci --silent
  else
    npm install --silent
  fi

  ok "Dependencies installed"
}

# ── 5. Start the dev server ───────────────────
start_server() {
  step "Starting Finance Now..."
  echo ""
  echo -e "  ${BOLD}App will be available at:${RESET} ${GREEN}http://localhost:3000${RESET}"
  echo -e "  ${BOLD}Press Ctrl+C to stop.${RESET}"
  echo ""

  cd "$FRONTEND_DIR"
  npm run dev
}

# ── Main ──────────────────────────────────────
print_header
install_node
setup_env
install_deps
start_server
