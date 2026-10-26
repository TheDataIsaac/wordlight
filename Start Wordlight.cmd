@echo off
rem Starts Wordlight with crash recovery, or opens it if it is already running. Options: --no-open --foreground --no-pause
call "%~dp0tools\launcher\run.cmd" start %*
exit /b %errorlevel%
