param(
    [string]$Version = '6.0.0-alpha03',
    [string]$BuildLog,
    [string]$PhoneKeyStore = "$env:USERPROFILE/.android/debug.keystore"
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$jdk = Get-ChildItem -LiteralPath (Join-Path $root '.build-tools/android-native/jdk') -Directory | Select-Object -First 1
if (!$jdk) { throw 'JDK 17 is required.' }
$env:JAVA_HOME = $jdk.FullName
$env:PATH = "$env:JAVA_HOME/bin;$env:PATH"
$buildTools = Join-Path $root '.build-tools/android-native/sdk/build-tools/35.0.0'
$output = Join-Path $root "outputs/android-native/$Version"
$evidence = Join-Path $output 'evidence'
$app = Join-Path $root 'apps/android-native/app/build'
if (!$BuildLog -or !(Test-Path -LiteralPath $BuildLog) -or (Get-Content -LiteralPath $BuildLog -Raw) -notmatch 'BUILD SUCCESSFUL') { throw 'Provide the successful final build log.' }
if (!(Test-Path -LiteralPath $PhoneKeyStore)) { throw 'Existing phone-compatible signing key is missing.' }
New-Item -ItemType Directory -Force -Path $evidence | Out-Null
$prefix = "health-os-native-$Version"
Copy-Item -LiteralPath "$app/outputs/apk/debug/app-debug.apk" -Destination "$output/$prefix-debug.apk"
Copy-Item -LiteralPath "$app/outputs/apk/release/app-release.apk" -Destination "$output/$prefix-distribution.apk"
Copy-Item -LiteralPath "$app/outputs/bundle/release/app-release.aab" -Destination "$output/$prefix-distribution.aab"
& "$buildTools/apksigner.bat" verify --verbose --print-certs "$output/$prefix-distribution.apk" *> "$evidence/distribution-signature.txt"
if ($LASTEXITCODE -ne 0) { throw 'Distribution APK is not correctly signed.' }
# This local test key is solely for preserving the already installed alpha's identity.
& "$buildTools/apksigner.bat" sign --ks $PhoneKeyStore --ks-key-alias androiddebugkey --ks-pass pass:android --key-pass pass:android --out "$output/$prefix-phone-update.apk" "$output/$prefix-distribution.apk"
if ($LASTEXITCODE -ne 0) { throw 'Phone-compatible signing failed.' }
& "$buildTools/apksigner.bat" verify --verbose --print-certs "$output/$prefix-phone-update.apk" *> "$evidence/phone-update-signature.txt"
if ($LASTEXITCODE -ne 0) { throw 'Phone-compatible signature verification failed.' }
$signature = Get-Content -LiteralPath "$evidence/phone-update-signature.txt" -Raw
if ($signature -notmatch 'af14fadd34357406e97033482dff8a6a0705158a2621bcb118b87d9372a84b1b') { throw 'Phone certificate differs from the verified existing installation. Do not install.' }
& "$buildTools/zipalign.exe" -c -P 16 4 "$output/$prefix-phone-update.apk" *> "$evidence/zip-alignment.txt"
if ($LASTEXITCODE -ne 0) { throw '16 KiB APK alignment failed.' }
Copy-Item -LiteralPath $BuildLog -Destination "$evidence/build.txt"
Copy-Item -LiteralPath "$app/reports/lint-results-debug.txt" -Destination "$evidence/lint.txt"
Get-ChildItem -LiteralPath "$app/test-results/testDebugUnitTest" -Filter '*.xml' | Copy-Item -Destination $evidence
$hashes = Get-ChildItem -LiteralPath $output -File | Where-Object { $_.Extension -in '.apk', '.aab', '.idsig' } | Sort-Object Name | ForEach-Object { "{0}  {1}" -f (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant(), $_.Name }
Set-Content -LiteralPath "$output/SHA256SUMS.txt" -Value $hashes -Encoding UTF8
Write-Output "Verified signed artifacts prepared in $output. No device installation or publication performed."
