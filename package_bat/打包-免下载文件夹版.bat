@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
if not exist "index.html" if exist "..\index.html" cd /d ".."
if not exist "index.html" (echo [ERROR] cannot find index.html - run from renpy-doc-app or package_bat & pause & exit /b 1)

title RenpyDocFinder pack - no-builder folder build
echo  app name : RenpyDocFinder   window title : Renpy文档查询
echo  output   : dist\RenpyDocFinder\RenpyDocFinder.exe  (no electron-builder, never hangs)
echo  NOTE: in this mode the exe icon AND the Task Manager name stay Electron defaults.\r\necho        The file is just a renamed electron.exe. Use an electron-builder pack\r\necho        script for the correct icon and the name Renpy文档查询.
echo.
set "npm_config_registry=https://registry.npmmirror.com"
set "ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/"
set "ELECTRON_CUSTOM_DIR={{ version }}"
if exist "D:\electron-cache" set "ELECTRON_CACHE=D:\electron-cache"

where node >nul 2>nul || (echo [ERROR] Node.js not found & pause & exit /b 1)
if not exist "node_modules\electron\dist\electron.exe" (
  echo [deps] installing electron@33.2.0 ...
  call npm install electron@33.2.0 --no-audit --no-fund --save-dev || (echo [ERROR] install failed & pause & exit /b 1)
) else (echo [deps] electron runtime found)
echo [clean] closing previous app to release file locks ...
taskkill /f /im RenpyDocFinder.exe >nul 2>nul
taskkill /f /im RenPyDoc.exe >nul 2>nul
taskkill /f /im electron.exe >nul 2>nul
timeout /t 1 /nobreak >nul
set "OUTNAME=dist\RenpyDocFinder"
if exist "%OUTNAME%" rd /s /q "%OUTNAME%" >nul 2>nul
if exist "%OUTNAME%" timeout /t 2 /nobreak >nul
if exist "%OUTNAME%" rd /s /q "%OUTNAME%" >nul 2>nul
if exist "%OUTNAME%" set "OUTNAME=dist\RenpyDocFinder-%RANDOM%"
if exist "dist\RenpyDocFinder" echo [warn] dist\RenpyDocFinder is locked - building into %OUTNAME%
echo [images] collecting documentation images ...
if not exist "assets\docimg\zh" mkdir "assets\docimg\zh"
if not exist "assets\docimg\en" mkdir "assets\docimg\en"
if exist "docs_cache\zh\source" robocopy "docs_cache\zh\source" "assets\docimg\zh" *.png *.jpg *.jpeg *.gif *.webp /S /NFL /NDL /NJH /NJS /NP >nul
if exist "..\renpy_cn\source" robocopy "..\renpy_cn\source" "assets\docimg\zh" *.png *.jpg *.jpeg *.gif *.webp /S /NFL /NDL /NJH /NJS /NP >nul
if exist "docs_cache\en" robocopy "docs_cache\en" "assets\docimg\en" *.png *.jpg *.jpeg *.gif *.webp /S /NFL /NDL /NJH /NJS /NP >nul
if exist "..\renpy_en\_images" robocopy "..\renpy_en\_images" "assets\docimg\en" *.png *.jpg *.jpeg *.gif *.webp /S /NFL /NDL /NJH /NJS /NP >nul

echo [copy] copying runtime and app files ...
robocopy "node_modules\electron\dist" "%OUTNAME%" /E /NFL /NDL /NJH /NJS /NP >nul
if exist "%OUTNAME%\resources\default_app.asar" del /q "%OUTNAME%\resources\default_app.asar"
mkdir "%OUTNAME%\resources\app" 2>nul
robocopy "." "%OUTNAME%\resources\app" index.html /NFL /NDL /NJH /NJS /NP >nul
for %%D in (assets data build electron python tools) do (
  if exist "%%D" robocopy "%%D" "%OUTNAME%\resources\app\%%D" /E /NFL /NDL /NJH /NJS /NP >nul
)
for %%F in (package.json README.md serve.mjs) do (
  if exist "%%F" copy /y "%%F" "%OUTNAME%\resources\app\" >nul
)
if exist "%OUTNAME%\electron.exe" ren "%OUTNAME%\electron.exe" "RenpyDocFinder.exe"
echo DONE: %OUTNAME%\RenpyDocFinder.exe
start "" "%OUTNAME%"
pause
