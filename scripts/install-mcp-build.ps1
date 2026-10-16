$ErrorActionPreference = 'Stop'
$mcpSource = 'G:\Health Os\source\dist\client'
$mcpTarget = 'G:\Health Os\dist\client'
$mcpBackup = 'G:\Health Os\source\output\installed-before-mcp'
if (!(Test-Path -LiteralPath (Join-Path $mcpSource 'index.html'))) { throw 'Build the frontend first.' }
if (!(Test-Path -LiteralPath (Join-Path $mcpTarget 'index.html'))) { throw 'Installed frontend was not found.' }
New-Item -ItemType Directory -Path $mcpBackup -Force | Out-Null
Get-ChildItem -LiteralPath $mcpTarget -File | ForEach-Object {
  if (!(Test-Path -LiteralPath (Join-Path $mcpBackup $_.Name))) { Copy-Item -LiteralPath $_.FullName -Destination $mcpBackup }
}
Get-ChildItem -LiteralPath $mcpSource | Where-Object {
  $_.Name -ne 'release-config.js' -or !(Test-Path -LiteralPath (Join-Path $mcpTarget 'release-config.js'))
} | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $mcpTarget -Recurse -Force }
if ((Get-FileHash -LiteralPath (Join-Path $mcpSource 'index.html')).Hash -ne (Get-FileHash -LiteralPath (Join-Path $mcpTarget 'index.html')).Hash) { throw 'Installed entry does not match the build.' }
Write-Output 'Installed MCP controls. Existing configuration, records and old hashed assets retained.'
