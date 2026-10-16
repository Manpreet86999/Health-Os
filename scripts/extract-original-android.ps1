param([string]$Baseline='')
$ErrorActionPreference='Stop'
$projectRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if(-not $Baseline){$Baseline=Join-Path $projectRoot 'outputs/android-hotfix/Health-OS-v1.4-fix.apk'}
$baselineStream=[IO.File]::OpenRead($Baseline)
$baselineHasher=[Security.Cryptography.SHA256]::Create()
try{$baselineHash=[BitConverter]::ToString($baselineHasher.ComputeHash($baselineStream)).Replace('-','').ToLowerInvariant()}finally{$baselineStream.Dispose();$baselineHasher.Dispose()}
if($baselineHash -ne '6825d94790f92d9c429a9484425707fa86dc840bf7adec2e4b52c78c7b4f379f'){throw 'The supplied Android baseline differs from the reviewed APK'}
$referenceRoot=Join-Path $projectRoot 'output/android-original-ui/reference'
New-Item -ItemType Directory -Path $referenceRoot -Force | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive=[IO.Compression.ZipFile]::OpenRead($Baseline)
try{foreach($entry in $archive.Entries){
 if(-not $entry.FullName.StartsWith('assets/public/') -or $entry.FullName.EndsWith('/')){continue}
 $target=[IO.Path]::GetFullPath((Join-Path $referenceRoot $entry.FullName.Substring('assets/public/'.Length)))
 if(-not $target.StartsWith($referenceRoot+[IO.Path]::DirectorySeparatorChar)){throw 'Archive member escapes the reference directory'}
 New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
 [IO.Compression.ZipFileExtensions]::ExtractToFile($entry,$target,$true)
}}finally{$archive.Dispose()}
Write-Output 'Extracted the hash-verified original Android public assets.'
