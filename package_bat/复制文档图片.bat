@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
if not exist "index.html" if exist "..\index.html" cd /d ".."
if not exist "index.html" (echo [ERROR] cannot find index.html - run from renpy-doc-app or package_bat & pause & exit /b 1)

title RenPyDoc tool - collect doc images
echo collecting documentation images into assets\docimg ...

if not exist "assets\docimg\zh" mkdir "assets\docimg\zh"
if not exist "assets\docimg\en" mkdir "assets\docimg\en"
echo [1/6] zh: docs_cache\zh\source
if exist "docs_cache\zh\source" robocopy "docs_cache\zh\source" "assets\docimg\zh" *.png *.jpg *.jpeg *.gif *.webp /S /NFL /NDL /NJH /NJS /NP >nul
echo [2/6] zh: ..\renpy_cn\source
if exist "..\renpy_cn\source" robocopy "..\renpy_cn\source" "assets\docimg\zh" *.png *.jpg *.jpeg *.gif *.webp /S /NFL /NDL /NJH /NJS /NP >nul
echo [3/6] en: docs_cache\en + ..\renpy_en\_images
if exist "docs_cache\en" robocopy "docs_cache\en" "assets\docimg\en" *.png *.jpg *.jpeg *.gif *.webp /S /NFL /NDL /NJH /NJS /NP >nul
if exist "..\renpy_en\_images" robocopy "..\renpy_en\_images" "assets\docimg\en" *.png *.jpg *.jpeg *.gif *.webp /S /NFL /NDL /NJH /NJS /NP >nul
echo [4/6] cross-language fallback: en images -> docimg\zh (same-name files)
if exist "..\renpy_en\_images" robocopy "..\renpy_en\_images" "assets\docimg\zh" *.png *.jpg *.jpeg *.gif *.webp /NFL /NDL /NJH /NJS /NP >nul
echo [5/6] gif icon -> png (if needed)
if exist "tools\icon.ps1" if exist "assets\ico\window-icon.gif" if not exist "assets\ico\window-icon.png" (
  set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
  if not exist "%PS%" set "PS=powershell"
  call "%PS%" -NoProfile -ExecutionPolicy Bypass -File "tools\icon.ps1" -Source "assets\ico\window-icon.gif" -Out "assets/ico/window-icon.png" -Size 256
)
echo [6/6] done
echo.
echo images now available offline:
dir /b /s "assets\docimg" 2>nul | find /c /v ""
echo.
echo NOTE: figures that reference the SDK gui template (oshs/game/gui/...) or files the repo
echo       does not ship will still fall back to the online sources at runtime.
pause
