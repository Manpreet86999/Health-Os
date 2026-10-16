$ErrorActionPreference = 'Stop'
$agenticTarget = 'G:\Health Os\dist\client'
$agenticBackup = 'G:\Health Os\source\output\installed-before-agentic'
$agenticManifest = 'G:\Health Os\source\output\agentic-validation\frontend-before.json'
$agenticFiles = Get-Content -LiteralPath $agenticManifest -Raw | ConvertFrom-Json
foreach ($agenticFile in $agenticFiles) {
  if ([System.IO.Path]::GetFileName($agenticFile.name) -ne $agenticFile.name) { throw 'Invalid backup filename.' }
  $agenticSaved = Join-Path $agenticBackup $agenticFile.name
  if ((Get-FileHash -LiteralPath $agenticSaved -Algorithm SHA256).Hash -ne $agenticFile.sha256) { throw 'Backup verification failed.' }
  Copy-Item -LiteralPath $agenticSaved -Destination (Join-Path $agenticTarget $agenticFile.name) -Force
}
Write-Output 'Restored previous frontend entry files. Reload the application. Account data and hashed assets retained.'
