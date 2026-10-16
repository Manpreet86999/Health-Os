$ErrorActionPreference='Stop'
$trackerBuild='G:\Health Os\source\dist\client'
$trackerInstall='G:\Health Os\dist\client'
$trackerRollback='G:\Health Os\source\output\simplification\installed-before'
if(!(Test-Path -LiteralPath (Join-Path $trackerBuild 'index.html'))){throw 'Build the frontend before installing.'}
New-Item -ItemType Directory -Path $trackerRollback -Force | Out-Null
$trackerEntries=@('index.html','telegram.html','service-worker.js','health-os-release.js','health-os-release.css','workspace-loading.css','manifest.webmanifest')
foreach($trackerName in $trackerEntries){
 $trackerExisting=Join-Path $trackerInstall $trackerName
 if((Test-Path -LiteralPath $trackerExisting)-and !(Test-Path -LiteralPath (Join-Path $trackerRollback $trackerName))){Copy-Item -LiteralPath $trackerExisting -Destination $trackerRollback}
}
Get-ChildItem -LiteralPath (Join-Path $trackerBuild 'assets') -File | ForEach-Object {Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $trackerInstall 'assets') -Force}
foreach($trackerName in $trackerEntries){Copy-Item -LiteralPath (Join-Path $trackerBuild $trackerName) -Destination (Join-Path $trackerInstall $trackerName) -Force}
foreach($trackerName in $trackerEntries){if((Get-FileHash -LiteralPath (Join-Path $trackerBuild $trackerName)).Hash-ne(Get-FileHash -LiteralPath (Join-Path $trackerInstall $trackerName)).Hash){throw "Installed entry mismatch: $trackerName"}}
Write-Output 'Installed simplified Health OS. Records, account configuration, MCP configuration and previous hashed assets were preserved.'
