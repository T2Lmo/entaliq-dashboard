@echo off
rem Makes the Entaliq worker start by itself (minimized) each time you sign in to Windows.
rem Run once. To undo it, run remove-autostart.cmd.
set "TARGET=%~dp0start-worker.cmd"
set "LINK=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Entaliq Office Worker.lnk"
powershell -NoProfile -Command "$s = (New-Object -ComObject WScript.Shell).CreateShortcut($env:LINK); $s.TargetPath = $env:TARGET; $s.WorkingDirectory = (Split-Path $env:TARGET); $s.WindowStyle = 7; $s.Description = 'Entaliq office worker'; $s.Save()"
if exist "%LINK%" (
  echo Done. The worker will start minimized each time you sign in to Windows.
  echo Tip: keep the PC from sleeping during office hours, or the worker pauses with it.
) else (
  echo Could not create the startup shortcut.
)
pause
