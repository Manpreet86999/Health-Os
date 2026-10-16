param([string]$Baseline='C:\Users\Manpr\Downloads\Health-OS-v0.1.0.apk')
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$env:JAVA_HOME=(Get-ChildItem (Join-Path $root '.build-tools/android-011/jdk') -Directory | Select-Object -First 1).FullName
$project=Join-Path $root 'apps/health-os-mobile/health-connect-native'
& (Join-Path $root '.build-tools/health-connect/gradle-9.3.1/bin/gradle.bat') -p $project testDebugUnitTest exportRuntime --console=plain
if($LASTEXITCODE -ne 0){throw 'Native Health Connect compilation failed'}
& node (Join-Path $root 'apps/health-os-mobile/scripts/prepare-health-connect-dex.mjs') $root $Baseline
if($LASTEXITCODE -ne 0){throw 'Native class preparation failed'}
$destination=Join-Path $project 'build/dex'
New-Item -ItemType Directory -Force $destination | Out-Null
Get-ChildItem $destination -Filter '*.dex' | Remove-Item
$sdk=Join-Path $root '.build-tools/health-connect/sdk'
& (Join-Path $sdk 'build-tools/36.0.0/d8.bat') --release --min-api 26 --lib (Join-Path $sdk 'platforms/android-37.0/android.jar') --output $destination (Join-Path $project 'build/dex-input/health-connect-runtime.jar')
if($LASTEXITCODE -ne 0){throw 'Native DEX compilation failed'}
Write-Output 'Health Connect native bridge compiled; original native classes excluded.'
