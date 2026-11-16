@echo off
rem Stops Wordlight on purpose, like Stop Wordlight.vbs: saves finish first and crash recovery does not start it again.
rem This file is in the "Other ways to start" folder; the Wordlight folder is the one above it.
cd /d "%~dp0.."
if not exist "app" if exist "app-swap" move "app-swap" "app" >nul
set "WORDLIGHT_DATA_DIR=%LOCALAPPDATA%\Wordlight\data"
choice /m "Stop Wordlight? OBS and the projector stop updating until you start it again"
if errorlevel 2 exit /b 0
"runtime\node.exe" "app\tools\launcher\start.mjs" stop
if exist "%WORDLIGHT_DATA_DIR%\launcher-message.txt" type "%WORDLIGHT_DATA_DIR%\launcher-message.txt"
pause
