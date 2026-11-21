@echo off
rem Stops the Entaliq worker from starting with Windows (the worker itself is not touched).
set "LINK=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Entaliq Office Worker.lnk"
if exist "%LINK%" (
  del "%LINK%"
  echo Removed. The worker will no longer start with Windows.
) else (
  echo Autostart was not installed.
)
pause
