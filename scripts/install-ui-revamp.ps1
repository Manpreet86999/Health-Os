$ErrorActionPreference='Stop'
$uiBuild=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../dist/client'))
$uiWorkspace=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$uiInstall=Join-Path $uiWorkspace 'dist/client'
$uiBackup=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../output/ui-revamp/installed-before'))
if(-not $uiInstall.StartsWith($uiWorkspace+[IO.Path]::DirectorySeparatorChar)){throw 'Install target is outside this workspace'}
if(-not(Test-Path -LiteralPath (Join-Path $uiBuild 'index.html'))){throw 'Build the web frontend first'}
if(-not(Test-Path -LiteralPath (Join-Path $uiInstall 'index.html'))){throw 'Existing installed frontend was not found'}
New-Item -ItemType Directory -Path $uiBackup -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $uiInstall 'assets') -Force | Out-Null
$uiEntries=@('index.html','telegram.html')
$uiHashes=@()
foreach($uiName in $uiEntries){
 $uiOld=Join-Path $uiInstall $uiName
 if(Test-Path -LiteralPath $uiOld){
  if(-not(Test-Path -LiteralPath (Join-Path $uiBackup $uiName))){Copy-Item -LiteralPath $uiOld -Destination (Join-Path $uiBackup $uiName)}
  $uiHashes+=@{name=$uiName;before=(Get-FileHash -LiteralPath $uiOld -Algorithm SHA256).Hash;after=(Get-FileHash -LiteralPath (Join-Path $uiBuild $uiName) -Algorithm SHA256).Hash}
 }
}
Get-ChildItem -LiteralPath (Join-Path $uiBuild 'assets') -File | ForEach-Object {Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $uiInstall 'assets') -Force}
foreach($uiName in $uiEntries){Copy-Item -LiteralPath (Join-Path $uiBuild $uiName) -Destination (Join-Path $uiInstall $uiName) -Force}
foreach($uiName in $uiEntries){if((Get-FileHash -LiteralPath (Join-Path $uiBuild $uiName)).Hash -ne (Get-FileHash -LiteralPath (Join-Path $uiInstall $uiName)).Hash){throw "Installed file mismatch: $uiName"}}
$uiHashes | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $uiBackup 'entry-hashes.json') -Encoding utf8
Write-Output "Installed UI into $uiInstall. Rollback entries: $uiBackup. Existing public configuration, records, browser profiles and old hashed assets were retained."
