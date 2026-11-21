@echo off
rem Starts the Entaliq worker: Claude for the agents, sending Mazen's approved emails, and reading their replies.
rem Keep this window open while the agents should work. If the worker stops, it restarts by itself after a minute.
rem To start it automatically with Windows, run install-autostart.cmd once.
cd /d "%~dp0"
rem Only one worker at a time (a second one would only duplicate the polling)
powershell -NoProfile -Command "if (Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*claude-worker.mjs*' }) { exit 1 }" >nul 2>&1
if errorlevel 1 (
  echo The Entaliq worker is already running in another window.
  timeout /t 5 >nul
  exit /b 0
)
title Entaliq Worker
set NEED=
if not exist node_modules\nodemailer set NEED=1
if not exist node_modules\imapflow set NEED=1
if not exist node_modules\mailparser set NEED=1
if defined NEED (
  echo Installing the mail libraries once...
  call npm install --omit=dev --no-audit --no-fund
)
:run
node claude-worker.mjs
echo.
echo [%date% %time%] The worker stopped. It restarts in 60 seconds; close this window to stop it.
rem timeout needs a console window; ping is the fallback wait when there is none
timeout /t 60 /nobreak >nul 2>&1 || ping -n 61 127.0.0.1 >nul
goto run
