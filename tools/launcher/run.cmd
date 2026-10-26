@echo off
rem Finds Node.js 20.12 or newer (the first 20.x with process.loadEnvFile, used for companion.env) and runs the Wordlight launcher. Use run.cmd start or run.cmd stop, then any options.
rem Set WORDLIGHT_NODE to the full path of node.exe if Node.js is installed somewhere unusual.
rem Add --no-pause when another program starts this, such as Task Scheduler, so a failure never waits for a key.
rem Every if is on one line and there are no labels, so the file works with LF or CRLF line endings.
setlocal
cd /d "%~dp0..\.."
set "NODE_EXE="
set "NO_PAUSE="
set "OLD_NODE="
set "CODE=0"
for %%A in (%*) do if /i "%%A"=="--no-pause" set "NO_PAUSE=1"
if defined WORDLIGHT_NODE if exist "%WORDLIGHT_NODE%" set "NODE_EXE=%WORDLIGHT_NODE%"
if not defined NODE_EXE for /f "delims=" %%N in ('where node 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%N"
if not defined NODE_EXE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if not defined NODE_EXE set "CODE=1"
if not defined NODE_EXE echo Wordlight needs Node.js 20.12 or newer, but node.exe was not found.
if not defined NODE_EXE echo Install the LTS version from https://nodejs.org, or set WORDLIGHT_NODE to the full path of node.exe, then try again.
if "%CODE%"=="0" "%NODE_EXE%" -e "process.exit(typeof process.loadEnvFile==='function'?0:1)"
if "%CODE%"=="0" if errorlevel 1 set "OLD_NODE=1"
if defined OLD_NODE set "CODE=1"
if defined OLD_NODE echo Wordlight needs Node.js 20.12 or newer, but this one is older: %NODE_EXE%
if defined OLD_NODE echo Install the LTS version from https://nodejs.org, or set WORDLIGHT_NODE to the full path of a newer node.exe, then try again.
if "%CODE%"=="0" "%NODE_EXE%" "%~dp0start.mjs" %*
if "%CODE%"=="0" set "CODE=%errorlevel%"
if not "%CODE%"=="0" if not defined NO_PAUSE pause
exit /b %CODE%
