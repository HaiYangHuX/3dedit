@echo off
title 3D Edit - Stop Development Server
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop-all.ps1"
set "STOP_EXIT_CODE=%ERRORLEVEL%"
if not "%STOP_EXIT_CODE%"=="0" (
  echo.
  echo [FAILED] Stop failed. See the error above.
) else (
  echo.
  echo [SUCCESS] All project services have stopped.
)
echo.
echo Press any key to close this window...
pause >nul
exit /b %STOP_EXIT_CODE%
