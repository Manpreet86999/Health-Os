$ErrorActionPreference = 'Stop'
$loadingSource = 'G:\Health Os\source\dist\client'
$loadingTarget = 'G:\Health Os\dist\client'
$loadingBackup = 'G:\Health Os\source\output\installed-before-fast-pages'
if (!(Test-Path -LiteralPath (Join-Path $loadingSource 'index.html'))) { throw 'Build the frontend first.' }
New-Item -ItemType Directory -Path $loadingBackup -Force | Out-Null
foreach ($loadingName in @('index.html', 'telegram.html', 'service-worker.js')) {
  $loadingCurrent = Join-Path $loadingTarget $loadingName
  if ((Test-Path -LiteralPath $loadingCurrent) -and !(Test-Path -LiteralPath (Join-Path $loadingBackup $loadingName))) {
    Copy-Item -LiteralPath $loadingCurrent -Destination $loadingBackup
  }
}
# Install hashed dependencies before switching the entry. Keep old assets for open tabs.
Get-ChildItem -LiteralPath (Join-Path $loadingSource 'assets') -File | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $loadingTarget 'assets') -Force
}
foreach ($loadingName in @('telegram.html', 'service-worker.js', 'index.html')) {
  Copy-Item -LiteralPath (Join-Path $loadingSource $loadingName) -Destination (Join-Path $loadingTarget $loadingName) -Force
}
if ((Get-FileHash -LiteralPath (Join-Path $loadingSource 'index.html')).Hash -ne (Get-FileHash -LiteralPath (Join-Path $loadingTarget 'index.html')).Hash) { throw 'Installed entry verification failed.' }
Write-Output 'Installed fast-page frontend. Existing configuration, records and old assets retained.'
