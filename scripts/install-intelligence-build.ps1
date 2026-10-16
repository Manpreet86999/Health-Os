$ErrorActionPreference = 'Stop'
$intelligenceSource = 'G:\Health Os\source\dist\client'
$intelligenceTarget = 'G:\Health Os\dist\client'
$intelligenceBackup = 'G:\Health Os\source\output\installed-before-intelligence'
if (!(Test-Path -LiteralPath (Join-Path $intelligenceSource 'index.html'))) { throw 'Build the frontend before installing.' }
if (!(Test-Path -LiteralPath (Join-Path $intelligenceTarget 'index.html'))) { throw 'Existing installed frontend was not found.' }
New-Item -ItemType Directory -Path $intelligenceBackup -Force | Out-Null
Get-ChildItem -LiteralPath $intelligenceTarget -File | ForEach-Object {
  if (!(Test-Path -LiteralPath (Join-Path $intelligenceBackup $_.Name))) { Copy-Item -LiteralPath $_.FullName -Destination $intelligenceBackup }
}
Get-ChildItem -LiteralPath $intelligenceSource | Where-Object {
  $_.Name -ne 'release-config.js' -or !(Test-Path -LiteralPath (Join-Path $intelligenceTarget 'release-config.js'))
} | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $intelligenceTarget -Recurse -Force }
if ((Get-FileHash -LiteralPath (Join-Path $intelligenceSource 'index.html')).Hash -ne (Get-FileHash -LiteralPath (Join-Path $intelligenceTarget 'index.html')).Hash) { throw 'Installed entry file does not match the build.' }
Write-Output 'Installed Intelligence frontend. Existing configuration and old hashed assets retained.'
