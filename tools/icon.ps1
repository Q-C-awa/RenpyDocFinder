param(
  [string]$Source = "",
  [string]$Out = "build-res/icon.png",
  [int]$Size = 256,
  [string]$ExtractExe = "",
  [string]$ListDir = ""
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

if ($ListDir -ne "") {
  if (-not (Test-Path $ListDir)) { Write-Host "[icon] dir not found: $ListDir"; exit 4 }
  Get-ChildItem (Join-Path $ListDir "*") | ForEach-Object {
    try {
      $i = [System.Drawing.Image]::FromFile($_.FullName)
      Write-Host ("[icon] " + $_.Name + "  " + $i.Width + "x" + $i.Height + "  " + [math]::Round($_.Length/1KB,1) + " KB")
      $i.Dispose()
    } catch {
      Write-Host ("[icon] " + $_.Name + "  UNREADABLE (conversion would fail)")
    }
  }
  exit 0
}

if ($ExtractExe -ne "") {
  $p = (Resolve-Path $ExtractExe).Path
  $ico = [System.Drawing.Icon]::ExtractAssociatedIcon($p)
  $bmp = $ico.ToBitmap()
  $bmp.Save((Join-Path (Get-Location) $Out), [System.Drawing.Imaging.ImageFormat]::Png)
  Write-Host ("[icon] exported preview: " + $Out + "  " + $bmp.Width + "x" + $bmp.Height)
  $bmp.Dispose(); $ico.Dispose()
  exit 0
}

if ($Source -eq "") { Write-Host "[icon] no source"; exit 2 }
if (-not (Test-Path $Source)) { Write-Host ("[icon] source not found: " + $Source); exit 3 }
$img = [System.Drawing.Image]::FromFile((Resolve-Path $Source))
Write-Host ("[icon] source: " + $Source + "  " + $img.Width + "x" + $img.Height)
$dir = Split-Path -Parent $Out
if ($dir -ne "" -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
$bmp = New-Object System.Drawing.Bitmap $Size, $Size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::Transparent)
$g.InterpolationMode = "HighQualityBicubic"
$g.PixelOffsetMode = "HighQuality"
$g.DrawImage($img, 0, 0, $Size, $Size)
$bmp.Save((Join-Path (Get-Location) $Out), [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose(); $img.Dispose()
$f = Get-Item $Out
$h = (Get-FileHash $f.FullName -Algorithm SHA256).Hash.Substring(0,12)
Write-Host ("[icon] wrote " + $Out + "  " + [math]::Round($f.Length/1KB,1) + " KB  sha256=" + $h)
