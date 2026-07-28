# Finance Now Dev Server Restart
# Kills whatever is on port 3000, then relaunches `npm run dev` in a new window.

$FrontendDir = "$PSScriptRoot\frontend"
$Port = 3000

Write-Host "Finance Now Dev Server Restart" -ForegroundColor Cyan
Write-Host "========================" -ForegroundColor Cyan

# Kill any process holding port 3000
$pid = (Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess
if ($pid) {
    $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
    Write-Host "Stopping process on port $Port (PID $pid - $($proc.ProcessName))..." -ForegroundColor Yellow
    Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 800
    Write-Host "Stopped." -ForegroundColor Green
} else {
    Write-Host "No process found on port $Port." -ForegroundColor Gray
}

# Launch dev server in a new titled console window
Write-Host "Starting Finance Now frontend..." -ForegroundColor Cyan
Start-Process powershell.exe -ArgumentList @(
    "-NoExit",
    "-Command",
    "& { `$host.UI.RawUI.WindowTitle = 'Finance Now Dev Server'; Set-Location '$FrontendDir'; npm run dev }"
)

Write-Host "Done. Server starting at http://localhost:$Port" -ForegroundColor Green
Start-Sleep -Seconds 1
