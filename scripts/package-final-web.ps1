$ErrorActionPreference='Stop'
$releaseRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$releaseVersion=(Get-Content -LiteralPath (Join-Path $releaseRoot 'package.json') -Raw|ConvertFrom-Json).version
$releaseFolder=Join-Path $releaseRoot "outputs/release-v$releaseVersion"
$webStage=Join-Path $releaseFolder 'web-stage'
New-Item -ItemType Directory -Path (Join-Path $webStage 'dist'),(Join-Path $webStage 'scripts') -Force|Out-Null
Copy-Item -LiteralPath (Join-Path $releaseRoot 'dist/client') -Destination (Join-Path $webStage 'dist') -Recurse -Force
foreach($name in @('serve-web.mjs','desktop-updater.mjs')){Copy-Item -LiteralPath (Join-Path $releaseRoot "scripts/$name") -Destination (Join-Path $webStage 'scripts') -Force}
@'
@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 24 or newer, then run start-web.bat again.
  pause
  exit /b 1
)
echo Open http://127.0.0.1:10000 in your browser.
node scripts/serve-web.mjs
pause
'@ | Set-Content -LiteralPath (Join-Path $webStage 'start-web.bat') -Encoding ascii
@"
Health OS v$releaseVersion - Final web app

LOCAL USE
1. Extract this entire ZIP to a folder.
2. Install Node.js 24 or newer if it is not already installed.
3. Windows: double-click start-web.bat.
   Other platforms: run node scripts/serve-web.mjs from this folder.
4. Open http://127.0.0.1:10000 and sign in to Health OS.
   If port 10000 is already in use, stop that server first or set PORT to another port.

STATIC HOSTING
Upload the contents of dist/client to an HTTPS static host. Serve index.html for
application navigations. Do not open index.html directly as a file.

Your health records stay in your cloud account. This archive contains only the
app, public assets and a local static-file server. No signing keys, account
tokens, email credentials or private records are included.

Daily reports use IST days and are scheduled for 23:00 IST. The report states its
23:00 data cutoff. Verified account email, enabled reports and the deployed
server services are required for automatic delivery.
"@ | Set-Content -LiteralPath (Join-Path $webStage 'README.txt') -Encoding utf8
$webZip=Join-Path $releaseFolder "Health-OS-Web-v$releaseVersion.zip"
Compress-Archive -Path (Join-Path $webStage '*') -DestinationPath $webZip -Force
Write-Output "Packaged final web app: $webZip"
