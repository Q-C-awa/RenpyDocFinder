@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
if not exist "index.html" if exist "..\index.html" cd /d ".."
if not exist "index.html" (echo [ERROR] run from renpy-doc-app or package_bat & pause & exit /b 1)
title RenpyDocFinder tool - delete redundant bat files
echo ============================================================
echo  删除多余脚本：
echo   - 项目根目录下的所有 .bat（它们只是转发脚本）
echo   - 旧的 package\ 目录（转发脚本）
echo   - package_bat 里已被合并/重复的旧脚本
echo  保留：打包系列、检查.bat、清理与关闭.bat、调试.bat、维护系列、说明.txt
echo ============================================================
echo.
set "CH="
set /p "CH=确认执行请输入 Y 后回车: "
if /i not "%CH%"=="Y" (echo 已取消 & pause & exit /b 0)
echo.
echo [1/3] 根目录 .bat ...
del /q "*.bat" >nul 2>nul
echo [2/3] 旧 package 目录 ...
if exist "package" rd /s /q "package" >nul 2>nul
if exist "package" echo   [warn] package 目录删除失败，请手动删除
echo [3/3] package_bat 内被合并/重复的旧脚本 ...
del /q "package_bat\打包-便携文件夹.bat" >nul 2>nul
del /q "package_bat\检查图标.bat" >nul 2>nul
del /q "package_bat\检查名称.bat" >nul 2>nul
del /q "package_bat\结束所有实例.bat" >nul 2>nul
del /q "package_bat\清理旧构建.bat" >nul 2>nul
del /q "package_bat\调试运行-源码模式.bat" >nul 2>nul
del /q "package_bat\调试运行-打包版.bat" >nul 2>nul
echo.
echo 完成。package_bat 现在的脚本：
dir /b "package_bat\*.bat"
echo.
echo 本脚本可保留备用；不需要时手动删除它即可。
pause
