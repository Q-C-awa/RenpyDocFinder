@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
if not exist "index.html" if exist "..\index.html" cd /d ".."
if not exist "index.html" (echo [ERROR] cannot find index.html - run from renpy-doc-app or package_bat & pause & exit /b 1)

title RenpyDocFinder pack - portable exe
echo  app name : RenpyDocFinder   window title : Renpy文档查询
echo  output   : dist\RenpyDocFinder-Portable.exe
echo.
set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PS%" set "PS=%SystemRoot%\SysWOW64\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PS%" set "PS=powershell"

set "npm_config_registry=https://registry.npmmirror.com"
set "ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/"
set "ELECTRON_CUSTOM_DIR={{ version }}"
set "ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/"
if exist "D:\electron-cache" set "ELECTRON_CACHE=D:\electron-cache"
if exist "D:\electron-builder-cache" set "ELECTRON_BUILDER_CACHE=D:\electron-builder-cache"

set "ICONSRC="
for %%E in (png ico gif jpg jpeg bmp) do (
  if not defined ICONSRC if exist "assets\ico\window-icon.%%E" set "ICONSRC=assets\ico\window-icon.%%E"
)

where node >nul 2>nul || (echo [ERROR] Node.js not found & pause & exit /b 1)
if not exist "node_modules\electron\dist\electron.exe" (
  echo [deps] installing electron@33.2.0 ...
  call npm install electron@33.2.0 --no-audit --no-fund --save-dev || (echo [ERROR] install failed & pause & exit /b 1)
) else (echo [deps] electron runtime found)
if not exist "node_modules\electron-builder\package.json" (
  echo [deps] installing electron-builder ...
  call npm install electron-builder@25.1.8 --no-audit --no-fund --save-dev || (echo [ERROR] install failed & pause & exit /b 1)
)

echo [icon] preparing 256x256 icon ...
if defined ICONSRC if exist "tools\icon.ps1" call "%PS%" -NoProfile -ExecutionPolicy Bypass -File "tools\icon.ps1" -Source "%ICONSRC%" -Out "build-res/icon.png" -Size 256
set "ICONARG="
if exist "build-res\icon.png" (set "ICONARG=--config.win.icon=build-res/icon.png") else (if defined ICONSRC set "ICONARG=--config.win.icon=%ICONSRC%")
echo [icon] arg: %ICONARG%

echo [images] collecting documentation images ...
if not exist "assets\docimg\zh" mkdir "assets\docimg\zh"
if not exist "assets\docimg\en" mkdir "assets\docimg\en"
if exist "docs_cache\zh\source" robocopy "docs_cache\zh\source" "assets\docimg\zh" *.png *.jpg *.jpeg *.gif *.webp /S /NFL /NDL /NJH /NJS /NP >nul
if exist "..\renpy_cn\source" robocopy "..\renpy_cn\source" "assets\docimg\zh" *.png *.jpg *.jpeg *.gif *.webp /S /NFL /NDL /NJH /NJS /NP >nul
if exist "docs_cache\en" robocopy "docs_cache\en" "assets\docimg\en" *.png *.jpg *.jpeg *.gif *.webp /S /NFL /NDL /NJH /NJS /NP >nul
if exist "..\renpy_en\_images" robocopy "..\renpy_en\_images" "assets\docimg\en" *.png *.jpg *.jpeg *.gif *.webp /S /NFL /NDL /NJH /NJS /NP >nul
if exist "..\renpy_en\_images" robocopy "..\renpy_en\_images" "assets\docimg\zh" *.png *.jpg *.jpeg *.gif *.webp /NFL /NDL /NJH /NJS /NP >nul

echo [clean] closing previous build/app to release file locks ...
taskkill /f /im RenpyDocFinder.exe >nul 2>nul
taskkill /f /im RenPyDoc.exe >nul 2>nul
taskkill /f /im electron.exe >nul 2>nul
timeout /t 1 /nobreak >nul
set "OUTDIR=dist"
if exist "dist\win-unpacked" rd /s /q "dist\win-unpacked" >nul 2>nul
if exist "dist\win-unpacked" timeout /t 2 /nobreak >nul
if exist "dist\win-unpacked" rd /s /q "dist\win-unpacked" >nul 2>nul
if exist "dist\win-unpacked" timeout /t 3 /nobreak >nul
if exist "dist\win-unpacked" rd /s /q "dist\win-unpacked" >nul 2>nul
if exist "dist\win-unpacked" set "OUTDIR=dist\build-%RANDOM%"
if exist "dist\win-unpacked" echo [warn] dist\win-unpacked is still locked - building into %OUTDIR% instead
echo [clean] output dir: %OUTDIR%

echo [build] running electron-builder (portable) ...
call npx electron-builder --win portable --publish never ^
  --config.electronDist=node_modules/electron/dist ^
  --config.directories.output=%OUTDIR% ^
  --config.directories.buildResources=build-res ^
  %ICONARG%
if errorlevel 1 (
  echo.
  echo [ERROR] build failed.
  echo   - EBUSY / resource busy means the previous build is still running:
  echo     close the RenpyDocFinder window and any Explorer window inside dist, then run again.
  pause & exit /b 1
)
echo.
echo ============================================================
echo  BUILD RESULT
echo   exe        : %OUTDIR%\win-unpacked\RenpyDocFinder.exe
echo   name shown : Renpy文档查询  (Task Manager / taskbar, from exe version info)
if /i not "%OUTDIR%"=="dist" echo   [WARN] dist\win-unpacked was locked - the fresh build went to %OUTDIR%;
if /i not "%OUTDIR%"=="dist" echo          launch the exe above, NOT the old one in dist\win-unpacked.
echo ============================================================
call "%PS%" -NoProfile -ExecutionPolicy Bypass -Command "$p='%OUTDIR%\win-unpacked\RenpyDocFinder.exe'; if(Test-Path $p){ $v=(Get-Item $p).VersionInfo; Write-Host ('   FileDescription : ' + $v.FileDescription); Write-Host ('   ProductName     : ' + $v.ProductName) }"
echo.
echo  other exe copies under dist (these keep their OLD name - delete with 清理旧构建.bat):
call "%PS%" -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem dist -Filter *.exe -Recurse -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -Skip 0 | ForEach-Object { $v=$_.VersionInfo; Write-Host ('   ' + $_.FullName + '   built=' + $_.LastWriteTime + '   name=' + $v.FileDescription) }"
echo.
if exist "tools\icon.ps1" if exist "%OUTDIR%\win-unpacked\RenpyDocFinder.exe" (
  call "%PS%" -NoProfile -ExecutionPolicy Bypass -File "tools\icon.ps1" -ExtractExe "%OUTDIR%\win-unpacked\RenpyDocFinder.exe" -Out "exe-icon-preview.png"
  if exist "exe-icon-preview.png" start "" "exe-icon-preview.png"
)
start "" "%OUTDIR%\win-unpacked"
pause
