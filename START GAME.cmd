@echo off
setlocal
cd /d "%~dp0"
title Free Life Local Server
set "NODE_EXE=C:\Program Files\nodejs\node.exe"
if not exist "%NODE_EXE%" set "NODE_EXE=node"
echo Starting Free Life...
"%NODE_EXE%" local-server.cjs 8000
echo.
echo The game server stopped. If an error appears above, send a screenshot of this window.
pause
