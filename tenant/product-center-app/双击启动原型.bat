@echo off
cd /d "%~dp0"
start "" "http://127.0.0.1:4173/"
python -m http.server 4173 --bind 127.0.0.1
