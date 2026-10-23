@echo off
cd /d "%~dp0"
start "merchant-prototype-server" powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-prototype.ps1"
timeout /t 3 >nul
start "" "http://localhost:4174/"
