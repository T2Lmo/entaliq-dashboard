@echo off
rem Starts the Entaliq Claude worker. Keep this window open while the agents should work.
cd /d "%~dp0"
title Entaliq Claude Worker
node claude-worker.mjs
pause
