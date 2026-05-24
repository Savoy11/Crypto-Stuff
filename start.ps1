# -----------------------------------------------
#  CAEP - Crypto Asset Evaluation Platform
#  Setup & Launch Script (Windows PowerShell)
# -----------------------------------------------

$FRONTEND_DIR = Join-Path $PSScriptRoot "frontend"
$ENV_FILE     = Join-Path $FRONTEND_DIR ".env.local"

function Write-Header {
    Write-Host ""
    Write-Host "================================================" -ForegroundColor Cyan
    Write-Host "   CAEP - Crypto Asset Evaluation Platform" -ForegroundColor Cyan
    Write-Host "   Setup Script" -ForegroundColor Cyan
    Write-Host "================================================" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Step { param($msg) Write-Host "" ; Write-Host ">> $msg" -ForegroundColor Cyan }
function Write-Ok   { param($msg) Write-Host "   OK: $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "   WARNING: $msg" -ForegroundColor Yellow }
function Write-Fail { param($msg) Write-Host "   ERROR: $msg" -ForegroundColor Red ; exit 1 }

# Refresh PATH so freshly installed tools are visible in this session
function Update-Path {
    $machine = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
    $user    = [System.Environment]::GetEnvironmentVariable("Path", "User")
    if ($machine -or $user) {
        $env:Path = "$machine;$user"
    }
}

# ---------------------------------------------------
# 1. Verify Node.js is installed
# ---------------------------------------------------
function Install-Node {
    Write-Step "Checking for Node.js..."

    Update-Path

    if (Get-Command node -ErrorAction SilentlyContinue) {
        Write-Ok "Node.js found: $(node --version)  npm: $(npm --version)"
        return
    }

    Write-Warn "Node.js not found. Trying winget..."

    if (Get-Command winget -ErrorAction SilentlyContinue) {
        winget install --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
        Update-Path
    }

    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Host ""
        Write-Host "  Node.js could not be found or installed automatically." -ForegroundColor Red
        Write-Host "  Please install it manually:" -ForegroundColor Yellow
        Write-Host "    1. Go to https://nodejs.org" -ForegroundColor White
        Write-Host "    2. Download and run the LTS installer" -ForegroundColor White
        Write-Host "    3. Close this window, open a new PowerShell, and run .\start.ps1 again" -ForegroundColor White
        Write-Host ""
        exit 1
    }

    Write-Ok "Node.js installed: $(node --version)"
}

# ---------------------------------------------------
# 2. Create .env.local if it does not exist
# ---------------------------------------------------
function Setup-Env {
    Write-Step "Checking .env.local..."

    if (Test-Path $ENV_FILE) {
        Write-Ok ".env.local already exists - skipping"
        return
    }

    $lines = @(
        "NEXT_PUBLIC_USE_MOCK=true",
        "NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1",
        "NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws"
    )
    $lines | Out-File -FilePath $ENV_FILE -Encoding utf8

    Write-Ok ".env.local created"
}

# ---------------------------------------------------
# 3. Install npm dependencies
# ---------------------------------------------------
function Install-Deps {
    Write-Step "Installing dependencies..."
    Write-Host "   (This can take 1-3 minutes the first time)" -ForegroundColor DarkGray

    Set-Location $FRONTEND_DIR

    npm install

    if ($LASTEXITCODE -ne 0) {
        Write-Fail "npm install failed (exit code $LASTEXITCODE). Check errors above."
    }

    Write-Ok "Dependencies ready"
}

# ---------------------------------------------------
# 4. Launch the dev server
# ---------------------------------------------------
function Start-App {
    Write-Step "Starting CAEP dev server..."
    Write-Host ""
    Write-Host "  Open this URL in your browser:" -ForegroundColor White
    Write-Host "  http://localhost:3000" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Press Ctrl+C to stop the server." -ForegroundColor DarkGray
    Write-Host ""

    Set-Location $FRONTEND_DIR
    npm run dev
}

# ---------------------------------------------------
# Main
# ---------------------------------------------------
Write-Header
Install-Node
Setup-Env
Install-Deps
Start-App
