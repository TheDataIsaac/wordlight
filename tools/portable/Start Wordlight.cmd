@echo off
rem Starts Wordlight with crash recovery, like Start Wordlight.vbs, for computers where VBScript is turned off or an
rem antivirus program blocks it. This window can be closed once Wordlight is running; Wordlight keeps running.
rem This file is in the "Other ways to start" folder; the Wordlight folder is the one above it.
cd /d "%~dp0.."
if not exist "app" if exist "app-swap" move "app-swap" "app" >nul
set "WORDLIGHT_DATA_DIR=%LOCALAPPDATA%\Wordlight\data"
"runtime\node.exe" "app\tools\launcher\start.mjs" start --app-window
if errorlevel 1 (
  if exist "%WORDLIGHT_DATA_DIR%\launcher-message.txt" type "%WORDLIGHT_DATA_DIR%\launcher-message.txt"
  pause
)
