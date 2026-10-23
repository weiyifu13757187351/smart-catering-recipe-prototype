@echo off
cd /d "%~dp0"
echo Starting local preview server on port 4175 ...
start "tenant-preview" cmd /c "python -m http.server 4175"
timeout /t 2 >nul
start "" http://127.0.0.1:4175/index.html
echo Opened http://127.0.0.1:4175/index.html
echo Login: admin / 123456   (close the "tenant-preview" window to stop)
timeout /t 3 >nul
