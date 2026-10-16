$ErrorActionPreference='Stop'
$taskSource='G:\Health Os\source\dist\client'
$taskTarget='G:\Health Os\dist\client'
$taskBackup='G:\Health Os\source\output\installed-before-food'
if(!(Test-Path -LiteralPath (Join-Path $taskSource 'index.html'))){throw 'Missing built frontend'}
New-Item -ItemType Directory -Path $taskBackup -Force | Out-Null
Get-ChildItem -LiteralPath $taskTarget -File | ForEach-Object {if(!(Test-Path -LiteralPath (Join-Path $taskBackup $_.Name))){Copy-Item -LiteralPath $_.FullName -Destination $taskBackup}}
Get-ChildItem -LiteralPath $taskSource | Where-Object { $_.Name -ne 'release-config.js' -or !(Test-Path -LiteralPath (Join-Path $taskTarget 'release-config.js')) } | ForEach-Object {Copy-Item -LiteralPath $_.FullName -Destination $taskTarget -Recurse -Force}
Write-Output 'Installed food frontend; previous top-level files and old hashed assets retained.'
