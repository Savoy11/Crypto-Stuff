# Kill any process on port 3000
$conn = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
if ($conn) {
    $pid = $conn | Select-Object -ExpandProperty OwningProcess -First 1
    Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
    Write-Host "Killed process on port 3000 (PID $pid)"
}

# Clear Next.js cache
if (Test-Path ".next") {
    Remove-Item -Recurse -Force ".next"
    Write-Host "Cleared .next cache"
}

# Start dev server
Write-Host "Starting dev server..."
npm run dev
