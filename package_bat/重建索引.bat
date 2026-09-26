@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
if not exist "index.html" if exist "..\index.html" cd /d ".."
if not exist "index.html" (echo [ERROR] cannot find index.html - run from renpy-doc-app or package_bat & pause & exit /b 1)

title RenPyDoc tool - rebuild index
where node >nul 2>nul || (echo [ERROR] Node.js not found & pause & exit /b 1)
echo rebuilding data from renpy_en / renpy_cn (or docs_cache) ...
call node "build\build.mjs" || (echo [ERROR] build failed & pause & exit /b 1)
echo.
echo done - reload the app (F5) to use the new index
pause
