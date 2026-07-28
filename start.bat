@echo off
title Finance Now - Multi-Asset Financial Analytics
cd /d "%~dp0"

echo.
echo  Launching Finance Now...
echo.

where pwsh >nul 2>&1
if %errorlevel% == 0 (
    pwsh -ExecutionPolicy Bypass -File "%~dp0start.ps1"
) else (
    echo  PowerShell 7 not found.
    echo.
    echo  Please download and install it from:
    echo  https://github.com/PowerShell/PowerShell/releases/latest
    echo.
    echo  Then double-click this file again.
    echo.
    pause
    exit /b 1
)

if %errorlevel% neq 0 pause
