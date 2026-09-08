@echo off
title Pulse Monitor
cd /d "%~dp0"
echo 正在后台启动 Pulse 监视器...
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
exit
