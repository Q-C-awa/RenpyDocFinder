@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
if not exist "index.html" if exist "..\index.html" cd /d ".."
if not exist "index.html" (echo [ERROR] cannot find index.html - run from renpy-doc-app or package_bat & pause & exit /b 1)

title RenpyDocFinder tool - close instances and clean builds
echo ============================================================
echo  关闭所有实例并删除 dist\ dist-py\ build-py\ 旧产物
echo ============================================================
echo.
taskkill /f /im RenpyDocFinder.exe >nul 2>nul
taskkill /f /im RenpyDocFinder-Portable.exe >nul 2>nul
taskkill /f /im RenPyDoc.exe >nul 2>nul
taskkill /f /im RenPyDoc-Portable.exe >nul 2>nul
taskkill /f /im electron.exe >nul 2>nul
timeout /t 1 /nobreak >nul
echo [1/3] 已结束所有运行中的实例
echo [2/3] 删除旧构建 ...
if exist "dist" rd /s /q "dist" >nul 2>nul
if exist "dist" timeout /t 2 /nobreak >nul
if exist "dist" rd /s /q "dist" >nul 2>nul
if exist "dist" echo   [warn] dist 仍被占用 - 请关闭停在 dist 里的资源管理器窗口后重试
if exist "dist-py" rd /s /q "dist-py" >nul 2>nul
if exist "build-py" rd /s /q "build-py" >nul 2>nul
echo [3/3] 剩余产物:
if exist "dist" (dir /b /s "dist\*.exe" 2>nul) else (echo   无)
echo.
echo 完成。之后重新运行打包脚本，只启动它打印出来的那个 exe。
pause
