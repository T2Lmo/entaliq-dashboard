@echo off
rem Starts the Entaliq worker: Claude for the agents, sending Mazen's approved emails, and reading their replies.
rem Keep this window open while the agents should work.
cd /d "%~dp0"
title Entaliq Worker
set NEED=
if not exist node_modules\nodemailer set NEED=1
if not exist node_modules\imapflow set NEED=1
if not exist node_modules\mailparser set NEED=1
if defined NEED (
  echo Installing the mail libraries once...
  call npm install --omit=dev --no-audit --no-fund
)
node claude-worker.mjs
pause
