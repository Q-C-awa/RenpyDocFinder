@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
if not exist "index.html" if exist "..\index.html" cd /d ".."
if not exist "index.html" (echo [ERROR] cannot find index.html - run from renpy-doc-app or package_bat & pause & exit /b 1)

title RenPyDoc tool - update docs and rebuild
where node >nul 2>nul || (echo [ERROR] Node.js not found & pause & exit /b 1)
set "npm_config_registry=https://registry.npmmirror.com"
echo updating docs from gitee + renpy.org then rebuilding index ...
call node "build\update_docs.mjs" || (echo [ERROR] update failed & pause & exit /b 1)
echo done
pause
