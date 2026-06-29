@echo off
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File restart-dev.ps1
pause
