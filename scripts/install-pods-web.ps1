$ErrorActionPreference = 'Stop'
$podsSourceRoot = Split-Path -Parent $PSScriptRoot
$podsSource = Join-Path $podsSourceRoot 'dist/client'
$podsTarget = Join-Path (Split-Path -Parent $podsSourceRoot) 'dist/client'
$podsBackup = Join-Path $podsSourceRoot ('output/friend-pods/web-before-repair-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
if (!(Test-Path -LiteralPath (Join-Path $podsSource 'index.html'))) { throw 'Build the repaired web frontend first.' }
if (!(Test-Path -LiteralPath (Join-Path $podsTarget 'index.html'))) { throw 'Existing installed web frontend is missing; no install was attempted.' }
New-Item -ItemType Directory -Path $podsBackup -Force | Out-Null
Get-ChildItem -LiteralPath $podsTarget -File | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $podsBackup }
# Keep old hashed assets available to open tabs and rollback. Publish index last.
Get-ChildItem -LiteralPath $podsSource -Directory | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $podsTarget -Recurse -Force }
Get-ChildItem -LiteralPath $podsSource -File | Where-Object { $_.Name -notin @('index.html','release-config.js') } | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $podsTarget -Force }
Copy-Item -LiteralPath (Join-Path $podsSource 'index.html') -Destination (Join-Path $podsTarget 'index.html') -Force
if ((Get-FileHash -LiteralPath (Join-Path $podsSource 'index.html')).Hash -ne (Get-FileHash -LiteralPath (Join-Path $podsTarget 'index.html')).Hash) { throw 'Installed index verification failed.' }
Write-Output ('Web-only compatibility frontend installed. Backup: ' + $podsBackup)
Write-Output 'Old assets, installed release configuration, browser data and Supabase are unchanged.'
