# -----------------------------------------------
#  CAEP - Crypto Asset Evaluation Platform
#  Setup & Launch Script (Windows PowerShell)
# -----------------------------------------------

$ErrorActionPreference = "Stop"

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

function Write-Step { param($msg) Write-Host ">> $msg" -ForegroundColor Cyan }
function Write-Ok   { param($msg) Write-Host "   OK: $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "   WARNING: $msg" -ForegroundColor Yellow }

# Refresh PATH so newly installed tools are found
function Update-Path {
    $machine = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
    $user    = [System.Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machine;$user"
}

# 1. Check / install Node.js
function Install-Node {
    Write-Step "Checking for Node.js..."

    if (Get-Command node -ErrorAction SilentlyContinue) {
        $v = node --version
        Write-Ok "Node.js already installed: $v"
        return
    }

    Write-Warn "Node.js not found. Attempting install via winget..."

    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        Write-Host ""
        Write-Host "  winget is not available on this machine." -ForegroundColor Yellow
        Write-Host "  Please install Node.js from https://nodejs.org (LTS version)" -ForegroundColor Yellow
        Write-Host "  Then close this window and run .\start.ps1 again." -ForegroundColor Yellow
        Write-Host ""
        exit 1
    }

    winget install --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements --silent
    Update-Path

    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Host ""
        Write-Host "  Node.js installed but PATH not updated yet." -ForegroundColor Yellow
        Write-Host "  Please close this window, open a new PowerShell, and run .\start.ps1 again." -ForegroundColor Yellow
        Write-Host ""
        exit 0
    }

    Write-Ok "Node.js installed: $(node --version)"
}

# 2. Create .env.local if missing
function Setup-Env {
    Write-Step "Checking .env.local..."

    if (Test-Path $ENV_FILE) {
        Write-Ok ".env.local already exists - skipping"
        return
    }

    $envContent = "NEXT_PUBLIC_USE_MOCK=true`r`nNEXT_PUBLIC_API_URL=http://localhost:8000/api/v1`r`nNEXT_PUBLIC_WS_URL=ws://localhost:8000/ws`r`n"
    [System.IO.File]::WriteAllText($ENV_FILE, $envContent, [System.Text.Encoding]::UTF8)

    Write-Ok ".env.local created with mock data enabled"
}

# 3. Install npm dependencies
function Install-Deps {
    Write-Step "Installing dependencies (this may take a minute)..."

    Set-Location $FRONTEND_DIR

    $lockFile = Join-Path $FRONTEND_DIR "node_modules\.package-lock.json"
    if (Test-Path $lockFile) {
        npm ci --silent
    } else {
        npm install --silent
    }

    Write-Ok "Dependencies installed"
}

# 4. Start the dev server
function Start-App {
    Write-Step "Starting CAEP..."
    Write-Host ""
    Write-Host "  App will be at: " -NoNewline
    Write-Host "http://localhost:3000" -ForegroundColor Green
    Write-Host "  Press Ctrl+C to stop."
    Write-Host ""

    Set-Location $FRONTEND_DIR
    npm run dev
}

# Main
Write-Header
Install-Node
Setup-Env
Install-Deps
Start-App
