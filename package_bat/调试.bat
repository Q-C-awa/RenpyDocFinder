@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
if not exist "index.html" if exist "..\index.html" cd /d ".."
if not exist "index.html" (echo [ERROR] run from renpy-doc-app or package_bat & pause & exit /b 1)
title RenpyDocFinder tool - debug
:menu
cls
echo ============================================
echo  RenpyDocFinder 调试
echo   1. 源码模式运行（直接看到主进程报错）
echo   2. 运行打包产物并抓取日志
echo   0. 退出
echo ============================================
set "CH="
set /p "CH=请输入序号后回车: "
if "%CH%"=="1" goto devmode
if "%CH%"=="2" goto packaged
if "%CH%"=="0" exit /b 0
goto menu

:devmode
where node >nul 2>nul || (echo [ERROR] Node.js not found & pause & goto menu)
if not exist "node_modules\electron\dist\electron.exe" call npm install electron@33.2.0 --no-audit --no-fund --save-dev
set "ELECTRON_ENABLE_LOGGING=1"
echo [run] npx electron . --enable-logging
call npx electron . --enable-logging
echo.
echo [exit] electron returned %ERRORLEVEL%
echo -------- error.log --------
set "LOG=%APPDATA%\RenpyDocFinder\error.log"
if exist "%LOG%" type "%LOG%"
if not exist "%LOG%" echo   no error.log
echo ---------------------------
pause
goto menu

:packaged
set "EXE=dist\win-unpacked\RenpyDocFinder.exe"
if not exist "%EXE%" set "EXE=dist\RenpyDocFinder\RenpyDocFinder.exe"
if not exist "%EXE%" set "EXE=dist\RenpyDocFinder-Portable.exe"
if not exist "%EXE%" (echo [ERROR] 找不到打包产物，请先运行打包脚本 & pause & goto menu)
echo [run] %EXE%
set "ELECTRON_ENABLE_LOGGING=1"
start "" "%EXE%" --enable-logging --v=1
timeout /t 6 /nobreak >nul
echo -------- error.log --------
set "LOG=%APPDATA%\RenpyDocFinder\error.log"
if exist "%LOG%" type "%LOG%"
if not exist "%LOG%" echo   no error.log
echo -------- chrome_debug.log tail --------
call "%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -Command "if(Test-Path $env:APPDATA\RenpyDocFinder\chrome_debug.log){ Get-Content $env:APPDATA\RenpyDocFinder\chrome_debug.log -Tail 40 } else { Write-Host '  no chrome_debug.log' }"
echo ---------------------------------------
pause
goto menu
