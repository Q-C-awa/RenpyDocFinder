@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
if not exist "index.html" if exist "..\index.html" cd /d ".."
if not exist "index.html" (echo [ERROR] cannot find index.html - run from renpy-doc-app or package_bat & pause & exit /b 1)

title RenpyDocFinder tool - check icon / name / builds
echo ================= RenpyDocFinder 检查 =================
set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PS%" set "PS=%SystemRoot%\SysWOW64\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PS%" set "PS=powershell"

echo powershell: %PS%
echo.
echo [1] assets\ico 文件:
if exist "assets\ico" (dir /b /a-d "assets\ico") else (echo   目录不存在)
echo.
echo [2] 图片可读性与尺寸:
if exist "tools\icon.ps1" (call "%PS%" -NoProfile -ExecutionPolicy Bypass -File "tools\icon.ps1" -ListDir "assets/ico") else (echo   tools\icon.ps1 缺失)
echo.
echo [3] 打包用图标 build-res\icon.png:
if exist "build-res\icon.png" (echo   已存在) else (echo   不存在 - 先运行 打包脚本)
echo.
echo [4] 已构建的 exe、构建时间与 Windows 显示名:
call "%PS%" -NoProfile -ExecutionPolicy Bypass -Command "$n=0; Get-ChildItem dist,dist-py -Filter *.exe -Recurse -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | ForEach-Object { $n++; $v=$_.VersionInfo; Write-Host ('   ' + $_.FullName); Write-Host ('      built=' + $_.LastWriteTime + '  FileDescription=' + $v.FileDescription + '  ProductName=' + $v.ProductName) }; if($n -eq 0){ Write-Host '   没有找到已构建的 exe' }"
echo.
echo 说明：任务管理器/任务栏显示的名字来自 exe 的 FileDescription（打包时写入）。
echo       应显示 Renpy文档查询；若某个 exe 仍显示旧名称，说明它是旧构建，
echo       请用 清理与关闭.bat 删除旧产物后重新打包。
pause
