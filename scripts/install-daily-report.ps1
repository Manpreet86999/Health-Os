$ErrorActionPreference='Stop'
$reportBuild='G:\Health Os\source\dist\client'
$reportInstall='G:\Health Os\dist\client'
$reportBackup=Join-Path 'G:\Health Os\source\output\daily-report-deploy' ('installed-before-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
if(!(Test-Path -LiteralPath (Join-Path $reportBuild 'index.html'))){throw 'Build the frontend first.'}
New-Item -ItemType Directory -Path $reportBackup -Force | Out-Null
$reportEntries=@('index.html','telegram.html','service-worker.js','health-os-release.js','health-os-release.css','release-config.js','workspace-loading.css','manifest.webmanifest')
foreach($reportName in $reportEntries){
 if(!(Test-Path -LiteralPath (Join-Path $reportBuild $reportName))){throw "Missing build entry: $reportName"}
 $reportExisting=Join-Path $reportInstall $reportName
 if(Test-Path -LiteralPath $reportExisting){Copy-Item -LiteralPath $reportExisting -Destination $reportBackup}
}
Copy-Item -LiteralPath (Join-Path $reportBuild 'assets') -Destination $reportInstall -Recurse -Force
foreach($reportName in $reportEntries){Copy-Item -LiteralPath (Join-Path $reportBuild $reportName) -Destination $reportInstall -Force}
foreach($reportName in $reportEntries){
 if((Get-FileHash -LiteralPath (Join-Path $reportBuild $reportName)).Hash-ne(Get-FileHash -LiteralPath (Join-Path $reportInstall $reportName)).Hash){throw "Installed entry mismatch: $reportName"}
}
Write-Output "Daily report web app installed. Backup: $reportBackup. Existing account config, health records, and old hashed assets retained."
