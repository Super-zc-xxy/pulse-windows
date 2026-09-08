@echo off
title 退出 Pulse
cd /d "%~dp0"
taskkill /f /im electron.exe 2>nul
echo ✓ Pulse 监视器已完全关闭退出。
timeout /t 2 >nul
exit
