@echo off
rem Installs this Wordlight for this Windows user: copies it to %LOCALAPPDATA%\Programs\Wordlight, adds Wordlight and
rem Stop Wordlight to the Desktop and the Start menu, and starts it. No administrator rights are needed. Shows and
rem settings in %LOCALAPPDATA%\Wordlight\data are kept. Running it again over an installed copy updates it.
if not exist "%~dp0app\tools\install.ps1" (
  echo.
  echo Wordlight is still inside the ZIP file, so it cannot be installed from here.
  echo Close this window. Right-click the ZIP file, choose Extract All, then Extract.
  echo Open the Wordlight folder that appears and double-click Install Wordlight there.
  echo.
  pause
  exit /b 1
)
set "WORDLIGHT_FROM_FOLDER=%~dp0."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0app\tools\install.ps1"
pause
