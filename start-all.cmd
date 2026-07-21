@echo off
title 3D Edit - Development Server
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-all.ps1" %*
set "START_EXIT_CODE=%ERRORLEVEL%"
if not "%START_EXIT_CODE%"=="0" (
  echo.
  echo [FAILED] Startup failed. See the error above.
) else (
  echo.
  echo [SUCCESS] All services are ready.
)
echo.
echo Press any key to close this window...
pause >nul
exit /b %START_EXIT_CODE%
