@echo off
rem Starts the Entaliq worker: Claude for the agents, and sending Mazen's approved emails from the company mailbox.
rem Keep this window open while the agents should work.
cd /d "%~dp0"
title Entaliq Worker
if not exist node_modules\nodemailer (
  echo Installing the mail library once...
  call npm install --omit=dev --no-audit --no-fund
)
node claude-worker.mjs
pause
