$ErrorActionPreference = 'Stop'
$agenticSource = 'G:\Health Os\source\dist\client'
$agenticTarget = 'G:\Health Os\dist\client'
$agenticBackup = 'G:\Health Os\source\output\installed-before-agentic'
if (!(Test-Path -LiteralPath (Join-Path $agenticSource 'index.html'))) { throw 'Build the frontend before installing.' }
if (!(Test-Path -LiteralPath (Join-Path $agenticTarget 'index.html'))) { throw 'Existing installed frontend was not found.' }
New-Item -ItemType Directory -Path $agenticBackup -Force | Out-Null
$agenticManifest = 'G:\Health Os\source\output\agentic-validation\frontend-before.json'
if (!(Test-Path -LiteralPath $agenticManifest)) {
  $agenticFiles = @(Get-ChildItem -LiteralPath $agenticTarget -File | ForEach-Object { @{ name = $_.Name; sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash } })
  $agenticFiles | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $agenticManifest -Encoding utf8
}
Get-ChildItem -LiteralPath $agenticTarget -File | ForEach-Object {
  if (!(Test-Path -LiteralPath (Join-Path $agenticBackup $_.Name))) { Copy-Item -LiteralPath $_.FullName -Destination $agenticBackup }
}
Get-ChildItem -LiteralPath $agenticSource | Where-Object {
  $_.Name -ne 'release-config.js' -or !(Test-Path -LiteralPath (Join-Path $agenticTarget 'release-config.js'))
} | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $agenticTarget -Recurse -Force }
if ((Get-FileHash -LiteralPath (Join-Path $agenticSource 'index.html')).Hash -ne (Get-FileHash -LiteralPath (Join-Path $agenticTarget 'index.html')).Hash) { throw 'Installed entry does not match the validated build.' }
Write-Output 'Installed model-driven Intelligence workspace. Configuration and old hashed assets retained.'
