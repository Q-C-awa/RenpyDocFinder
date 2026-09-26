@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
if not exist "index.html" if exist "..\index.html" cd /d ".."
if not exist "index.html" (echo [ERROR] cannot find index.html - run from renpy-doc-app or package_bat & pause & exit /b 1)

title RenPyDoc tool - gif to png icon
set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PS%" set "PS=%SystemRoot%\SysWOW64\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PS%" set "PS=powershell"

if not exist "tools\icon.ps1" (echo [ERROR] tools\icon.ps1 missing & pause & exit /b 1)
if exist "assets\ico\window-icon.png" if /i not "%~1"=="--force" (
  echo [skip] assets\ico\window-icon.png already exists ^(use --force to overwrite^)
  pause & exit /b 0
)
if not exist "assets\ico\window-icon.gif" (echo [ERROR] assets\ico\window-icon.gif not found & pause & exit /b 1)
call "%PS%" -NoProfile -ExecutionPolicy Bypass -File "tools\icon.ps1" -Source "assets\ico\window-icon.gif" -Out "assets/ico/window-icon.png" -Size 256
pause
