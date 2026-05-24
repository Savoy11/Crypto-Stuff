<#
  CAEP - Crypto Asset Evaluation Platform
  One-shot local setup / installer (Windows PowerShell)

  Installs every prerequisite needed to run the app locally, configures
  environment files, installs dependencies, and (optionally) launches it.

  USAGE
    .\setup.ps1                  # mock mode: install Node + deps, start the frontend (recommended)
    .\setup.ps1 -Mode full       # full stack: install Docker, build & run all services via Compose
    .\setup.ps1 -InstallOnly     # install + configure everything, but do NOT start the app
    .\setup.ps1 -Help            # show this help

  MODES
    mock  (default)  Frontend only with built-in mock data. Needs: Node.js 18.17+.
                     No backend, database, or API keys required. Opens http://localhost:3000
    full             Frontend + FastAPI backend + TimescaleDB + Redis (+ monitoring) via
                     Docker Compose. Needs: Docker Desktop. First run downloads images and
                     builds, so it can take several minutes.
#>

[CmdletBinding()]
param(
    [ValidateSet('mock', 'full')]
    [string]$Mode = 'mock',
    [switch]$InstallOnly,
    [switch]$Help
)

$ErrorActionPreference = 'Stop'

$ROOT          = $PSScriptRoot
$FRONTEND_DIR  = Join-Path $ROOT 'frontend'
$ENV_FILE      = Join-Path $FRONTEND_DIR '.env.local'
$COMPOSE_DIR   = Join-Path $ROOT 'infrastructure\docker'
$COMPOSE_FILE  = Join-Path $COMPOSE_DIR 'docker-compose.yml'
$DOCKER_ENV    = Join-Path $COMPOSE_DIR '.env'
$MIN_NODE_MAJOR = 18
$MIN_NODE_MINOR = 17

# ----- pretty output (ASCII only, no Unicode to avoid PS 5.1 encoding issues) -----
function Write-Header {
    Write-Host ''
    Write-Host '==============================================' -ForegroundColor Cyan
    Write-Host '  CAEP - Crypto Asset Evaluation Platform'      -ForegroundColor Cyan
    Write-Host '  Local Setup'                                  -ForegroundColor Cyan
    Write-Host '==============================================' -ForegroundColor Cyan
    Write-Host ''
}
function Write-Step { param($m) Write-Host "> $m" -ForegroundColor Cyan }
function Write-Ok   { param($m) Write-Host "  [OK] $m" -ForegroundColor Green }
function Write-Note { param($m) Write-Host "  [..] $m" -ForegroundColor DarkGray }
function Write-Warn { param($m) Write-Host "  [!]  $m" -ForegroundColor Yellow }
function Write-Fail { param($m) Write-Host "  [X]  $m" -ForegroundColor Red; exit 1 }

function Show-Help {
    Get-Help $PSCommandPath -Detailed | Out-String | Write-Host
    exit 0
}

# Make tools installed during this run visible without reopening the shell.
function Update-SessionPath {
    $machine = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user    = [System.Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = "$machine;$user"
}

function Test-Command { param($name) [bool](Get-Command $name -ErrorAction SilentlyContinue) }

function Test-NodeVersion {
    # Returns $true if the installed Node satisfies the minimum version.
    if (-not (Test-Command 'node')) { return $false }
    $raw = (node --version) 2>$null    # e.g. "v20.11.1"
    if ($raw -notmatch '^v(\d+)\.(\d+)') { return $false }
    $maj = [int]$Matches[1]; $min = [int]$Matches[2]
    if ($maj -gt $MIN_NODE_MAJOR) { return $true }
    if ($maj -eq $MIN_NODE_MAJOR -and $min -ge $MIN_NODE_MINOR) { return $true }
    return $false
}

# ----- prerequisites -----
function Install-Node {
    Write-Step 'Checking for Node.js (18.17+)...'

    if (Test-NodeVersion) {
        Write-Ok "Node.js present: $(node --version)"
        return
    }

    if (Test-Command 'node') {
        Write-Warn "Node.js $(node --version) is older than the required v$MIN_NODE_MAJOR.$MIN_NODE_MINOR. Upgrading..."
    } else {
        Write-Warn 'Node.js not found. Installing the LTS release...'
    }

    if (-not (Test-Command 'winget')) {
        Write-Host ''
        Write-Host '  winget is not available on this machine.' -ForegroundColor Yellow
        Write-Host '  Install Node.js LTS manually, then re-run this script:' -ForegroundColor Yellow
        Write-Host '    https://nodejs.org' -ForegroundColor White
        Write-Host ''
        exit 1
    }

    winget install --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements --silent
    Update-SessionPath

    if (-not (Test-NodeVersion)) {
        Write-Host ''
        Write-Warn 'Node.js was installed but is not on this session''s PATH yet.'
        Write-Host '  Close this window, open a NEW PowerShell, and re-run:' -ForegroundColor Yellow
        Write-Host "    .\setup.ps1 -Mode $Mode" -ForegroundColor White
        Write-Host ''
        exit 0
    }

    Write-Ok "Node.js installed: $(node --version)"
}

function Test-DockerRunning {
    if (-not (Test-Command 'docker')) { return $false }
    try { docker info *> $null; return ($LASTEXITCODE -eq 0) } catch { return $false }
}

function Install-Docker {
    Write-Step 'Checking for Docker...'

    if (Test-Command 'docker') {
        Write-Ok "Docker present: $((docker --version) 2>$null)"
    } else {
        Write-Warn 'Docker not found. Installing Docker Desktop...'
        if (-not (Test-Command 'winget')) {
            Write-Host ''
            Write-Host '  winget is not available. Install Docker Desktop manually, then re-run:' -ForegroundColor Yellow
            Write-Host '    https://www.docker.com/products/docker-desktop/' -ForegroundColor White
            Write-Host ''
            exit 1
        }
        winget install --id Docker.DockerDesktop --accept-source-agreements --accept-package-agreements --silent
        Update-SessionPath
        Write-Ok 'Docker Desktop installed.'
        Write-Warn 'Start Docker Desktop once (so the engine is running), then re-run: .\setup.ps1 -Mode full'
        exit 0
    }

    if (-not (Test-DockerRunning)) {
        Write-Warn 'Docker is installed but the engine is not running.'
        Write-Host '  Start Docker Desktop and wait for it to say "Running", then re-run this script.' -ForegroundColor Yellow
        exit 1
    }
    Write-Ok 'Docker engine is running.'
}

# ----- configuration -----
function Set-FrontendEnv {
    Write-Step 'Configuring frontend environment (.env.local)...'
    if (Test-Path $ENV_FILE) {
        Write-Ok '.env.local already exists - leaving it untouched.'
        return
    }
    @"
NEXT_PUBLIC_USE_MOCK=true
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
"@ | Set-Content -Encoding UTF8 $ENV_FILE
    Write-Ok '.env.local created (mock data enabled).'
}

function Set-DockerEnv {
    Write-Step 'Configuring Docker environment (.env)...'
    if (Test-Path $DOCKER_ENV) {
        Write-Ok 'infrastructure/docker/.env already exists - leaving it untouched.'
        return
    }
    @"
# Optional third-party API keys. The stack runs without them (mock/public endpoints
# are used as fallbacks); fill these in for live data.
COINGECKO_API_KEY=
DEFILLAMA_API_KEY=
CHAINLINK_RPC_URL=https://eth-mainnet.public.blastapi.io
"@ | Set-Content -Encoding UTF8 $DOCKER_ENV
    Write-Ok 'infrastructure/docker/.env created (blank optional keys).'
}

function Install-FrontendDeps {
    Write-Step 'Installing frontend dependencies (may take a minute)...'
    Push-Location $FRONTEND_DIR
    # npm writes progress and deprecation notices to stderr; under -ErrorActionPreference
    # 'Stop' that can be misread as a failure, so relax it and trust npm's exit code.
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        if (Test-Path (Join-Path $FRONTEND_DIR 'package-lock.json')) {
            npm ci
        } else {
            npm install
        }
        $code = $LASTEXITCODE
        if ($code -ne 0) { $ErrorActionPreference = $prev; Pop-Location; Write-Fail "npm dependency install failed (exit code $code)." }
        Write-Ok 'Dependencies installed.'
    } finally {
        $ErrorActionPreference = $prev
        Pop-Location
    }
}

# ----- launch -----
function Start-Mock {
    Write-Step 'Starting the frontend...'
    Write-Host ''
    Write-Host '  App URL: ' -NoNewline; Write-Host 'http://localhost:3000' -ForegroundColor Green
    Write-Host '  Press Ctrl+C to stop.'
    Write-Host ''
    # Dev server streams to stderr; don't let that abort the script.
    $ErrorActionPreference = 'Continue'
    Push-Location $FRONTEND_DIR
    try { npm run dev } finally { Pop-Location }
}

function Start-Full {
    Write-Step 'Building and starting the full stack (Docker Compose)...'
    Write-Host ''
    Write-Host '  Frontend:   ' -NoNewline; Write-Host 'http://localhost:3000' -ForegroundColor Green
    Write-Host '  Backend API:' -NoNewline; Write-Host ' http://localhost:8000' -ForegroundColor Green
    Write-Host '  API docs:   ' -NoNewline; Write-Host 'http://localhost:8000/docs' -ForegroundColor Green
    Write-Host '  Grafana:    ' -NoNewline; Write-Host 'http://localhost:3001 (admin/admin)' -ForegroundColor Green
    Write-Host '  First run downloads images and builds - this can take several minutes.' -ForegroundColor DarkGray
    Write-Host '  Press Ctrl+C to stop; run "docker compose -f `"$COMPOSE_FILE`" down" to remove.' -ForegroundColor DarkGray
    Write-Host ''
    # Compose streams build/run logs to stderr; don't let that abort the script.
    $ErrorActionPreference = 'Continue'
    docker compose -f $COMPOSE_FILE up --build
}

# ----- main -----
if ($Help) { Show-Help }

Write-Header
Write-Note "Mode: $Mode$([string]::Format('{0}', $(if ($InstallOnly) { '  (install only, will not launch)' } else { '' })))"
Write-Host ''

switch ($Mode) {
    'mock' {
        Install-Node
        Set-FrontendEnv
        Install-FrontendDeps
        if ($InstallOnly) {
            Write-Host ''
            Write-Ok 'Setup complete. Start the app any time with:'
            Write-Host '    cd frontend; npm run dev' -ForegroundColor White
            Write-Host '  then open http://localhost:3000' -ForegroundColor White
        } else {
            Start-Mock
        }
    }
    'full' {
        if (-not (Test-Path $COMPOSE_FILE)) { Write-Fail "Compose file not found at $COMPOSE_FILE" }
        Install-Docker
        Set-DockerEnv
        if ($InstallOnly) {
            Write-Host ''
            Write-Ok 'Setup complete. Start the full stack any time with:'
            Write-Host "    docker compose -f `"$COMPOSE_FILE`" up --build" -ForegroundColor White
        } else {
            Start-Full
        }
    }
}
