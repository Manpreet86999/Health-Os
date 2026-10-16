$ErrorActionPreference = 'Stop'
$foundationSource = 'G:\Health Os\source\dist\client'
$foundationTarget = 'G:\Health Os\dist\client'
$foundationBackup = 'G:\Health Os\source\output\installed-before-foundations'
if (!(Test-Path -LiteralPath (Join-Path $foundationSource 'index.html'))) { throw 'Build the frontend before installing.' }
if (!(Test-Path -LiteralPath (Join-Path $foundationTarget 'index.html'))) { throw 'Existing installed frontend was not found.' }
New-Item -ItemType Directory -Path $foundationBackup -Force | Out-Null
Get-ChildItem -LiteralPath $foundationTarget -File | ForEach-Object {
  if (!(Test-Path -LiteralPath (Join-Path $foundationBackup $_.Name))) { Copy-Item -LiteralPath $_.FullName -Destination $foundationBackup }
}
Get-ChildItem -LiteralPath $foundationSource | Where-Object {
  $_.Name -ne 'release-config.js' -or !(Test-Path -LiteralPath (Join-Path $foundationTarget 'release-config.js'))
} | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $foundationTarget -Recurse -Force }
if ((Get-FileHash -LiteralPath (Join-Path $foundationSource 'index.html')).Hash -ne (Get-FileHash -LiteralPath (Join-Path $foundationTarget 'index.html')).Hash) { throw 'Installed entry does not match the validated build.' }
Write-Output 'Installed Intelligence foundations. Configuration and old hashed assets retained.'
