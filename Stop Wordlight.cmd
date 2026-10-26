@echo off
rem Stops Wordlight on purpose (saves finish first). Crash recovery does not restart it.
call "%~dp0tools\launcher\run.cmd" stop %*
exit /b %errorlevel%
