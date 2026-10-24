@echo off
rem Opens Yammel from this project folder (the development build, not the installed copy).
rem Builds the app first, so the window always shows the current code.
cd /d "%~dp0.."
call npm run bundle
if errorlevel 1 (
  echo.
  echo The build failed. Read the message above, then press a key to close this window.
  pause
  exit /b 1
)
start "" "%~dp0..\node_modules\electron\dist\electron.exe" "%~dp0.."
