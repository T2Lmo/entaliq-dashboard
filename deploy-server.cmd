@echo off
rem Updates the office server (Google Apps Script) in one step: backs up what is live, builds,
rem pushes, publishes a new version of the same deployment (same /exec link), and checks it answers.
rem First time only: it asks for the Script ID and opens Google sign-in for clasp.
rem Options: --check (build and compare only)  --yes (no questions)  --force (replace even if edited in the editor)
chcp 65001 >nul
cd /d "%~dp0"
node tools\deploy-server.mjs %*
pause
