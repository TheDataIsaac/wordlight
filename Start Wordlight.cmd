@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Wordlight needs Node.js 20 or newer.
  echo Install the LTS version from https://nodejs.org and try again.
  pause
  exit /b 1
)
node server.mjs --open
pause
