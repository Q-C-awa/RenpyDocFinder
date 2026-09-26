@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
if not exist "index.html" if exist "..\index.html" cd /d ".."
if not exist "index.html" (echo [ERROR] cannot find index.html - run from renpy-doc-app or package_bat & pause & exit /b 1)

title RenpyDocFinder pack - python (pywebview) folder
echo  app name : RenpyDocFinder   window title : Renpy文档查询
echo  output   : dist-py\RenpyDocFinder\RenpyDocFinder.exe
where python >nul 2>nul || (echo [ERROR] Python not found & pause & exit /b 1)
echo [clean] closing previous app ...
taskkill /f /im RenpyDocFinder.exe >nul 2>nul
taskkill /f /im RenPyDoc.exe >nul 2>nul
timeout /t 1 /nobreak >nul
set "PYOUT=dist-py"
if exist "dist-py\RenpyDocFinder" rd /s /q "dist-py\RenpyDocFinder" >nul 2>nul
if exist "dist-py\RenpyDocFinder" timeout /t 2 /nobreak >nul
if exist "dist-py\RenpyDocFinder" rd /s /q "dist-py\RenpyDocFinder" >nul 2>nul
if exist "dist-py\RenpyDocFinder" set "PYOUT=dist-py\build-%RANDOM%"
echo [deps] installing pywebview / pyinstaller ...
python -m pip install -i https://pypi.tuna.tsinghua.edu.cn/simple --upgrade pywebview pyinstaller || (echo [ERROR] pip failed & pause & exit /b 1)
echo [images] collecting documentation images ...
if not exist "assets\docimg\zh" mkdir "assets\docimg\zh"
if not exist "assets\docimg\en" mkdir "assets\docimg\en"
if exist "docs_cache\zh\source" robocopy "docs_cache\zh\source" "assets\docimg\zh" *.png *.jpg *.jpeg *.gif *.webp /S /NFL /NDL /NJH /NJS /NP >nul
if exist "..\renpy_cn\source" robocopy "..\renpy_cn\source" "assets\docimg\zh" *.png *.jpg *.jpeg *.gif *.webp /S /NFL /NDL /NJH /NJS /NP >nul
if exist "docs_cache\en" robocopy "docs_cache\en" "assets\docimg\en" *.png *.jpg *.jpeg *.gif *.webp /S /NFL /NDL /NJH /NJS /NP >nul
if exist "..\renpy_en\_images" robocopy "..\renpy_en\_images" "assets\docimg\en" *.png *.jpg *.jpeg *.gif *.webp /S /NFL /NDL /NJH /NJS /NP >nul

echo [build] PyInstaller (onedir) ...
python -m PyInstaller --noconfirm --clean --windowed --onedir --name RenpyDocFinder ^
  --add-data "index.html;." ^
  --add-data "assets;assets" ^
  --add-data "data;data" ^
  --add-data "build;build" ^
  --add-data "tools;tools" ^
  --add-data "python;python" ^
  --distpath "%PYOUT%" ^
  --workpath "build-py" ^
  --specpath "build-py" ^
  "python\app.py" || (echo [ERROR] build failed & pause & exit /b 1)
echo DONE: %PYOUT%\RenpyDocFinder\RenpyDocFinder.exe
start "" "%PYOUT%\RenpyDocFinder"
pause
