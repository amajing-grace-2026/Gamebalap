@echo off
title Neon Rush
cd /d "%~dp0"
echo Menyalakan server lokal Neon Rush...
start "Neon Rush Server (jangan ditutup selama bermain)" powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0jalankan-server.ps1" -Port 8080
timeout /t 2 /nobreak >nul
start "" http://localhost:8080
