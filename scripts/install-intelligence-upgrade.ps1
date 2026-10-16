$ErrorActionPreference='Stop'
$taskRoot=Split-Path -Parent $PSScriptRoot
$taskSource=Join-Path $taskRoot 'dist/client'
$taskTarget=Join-Path (Split-Path -Parent $taskRoot) 'dist/client'
$taskBackup=Join-Path $taskRoot ('output/installed-before-intelligence-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
if(-not(Test-Path -LiteralPath (Join-Path $taskSource 'index.html'))){throw 'Validated frontend build is missing.'}
if(-not(Test-Path -LiteralPath (Join-Path $taskTarget 'index.html'))){throw 'Installed frontend is missing.'}
New-Item -ItemType Directory -Path $taskBackup | Out-Null
Copy-Item -LiteralPath $taskTarget -Destination (Join-Path $taskBackup 'client') -Recurse
$taskConfig=Join-Path $taskTarget 'release-config.js'
$taskConfigHash=if(Test-Path -LiteralPath $taskConfig){(Get-FileHash -LiteralPath $taskConfig -Algorithm SHA256).Hash}else{$null}
Get-ChildItem -LiteralPath $taskSource | Where-Object {$_.Name -ne 'release-config.js' -or -not $taskConfigHash} | ForEach-Object {Copy-Item -LiteralPath $_.FullName -Destination $taskTarget -Recurse -Force}
if((Get-FileHash -LiteralPath (Join-Path $taskSource 'index.html')).Hash -ne (Get-FileHash -LiteralPath (Join-Path $taskTarget 'index.html')).Hash){throw 'Installed frontend entry verification failed.'}
if($taskConfigHash -and (Get-FileHash -LiteralPath $taskConfig).Hash -ne $taskConfigHash){throw 'Installed release configuration changed.'}
@{backup=$taskBackup;installedAt=(Get-Date).ToUniversalTime().ToString('o');entrySha256=(Get-FileHash -LiteralPath (Join-Path $taskSource 'index.html')).Hash;releaseConfigurationPreserved=$true} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskBackup 'installation.json')
Write-Output "Installed verified frontend. Previous frontend: $taskBackup"
