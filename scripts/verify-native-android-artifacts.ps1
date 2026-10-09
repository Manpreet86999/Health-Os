param([string]$Version = '6.0.0-alpha03')
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$output = Join-Path $root "outputs/android-native/$Version"
$evidence = Join-Path $output 'evidence'
$buildTools = Join-Path $root '.build-tools/android-native/sdk/build-tools/35.0.0'
$jdk = Get-ChildItem -LiteralPath "$root/.build-tools/android-native/jdk" -Directory | Select-Object -First 1
if (!$jdk) { throw 'JDK 17 is required.' }
$bundle = Join-Path $output "health-os-native-$Version-distribution.aab"
& "$($jdk.FullName)/bin/jarsigner.exe" -verify -certs $bundle *> "$evidence/bundle-signature.txt"
if ($LASTEXITCODE -ne 0) { throw 'Bundle signature verification failed.' }
& "$($jdk.FullName)/bin/keytool.exe" -printcert -jarfile $bundle *> "$evidence/bundle-certificate.txt"
if ($LASTEXITCODE -ne 0 -or ((Get-Content -LiteralPath "$evidence/bundle-certificate.txt" -Raw).Replace(':', '').ToLowerInvariant() -notmatch '5b24c41d56d935c0547e4f6e95530760cee76d55684534a24ba8234210e7a5dc')) { throw 'Bundle signing identity differs from the verified distribution certificate.' }
$alignment = @()
$elf = @()
$startup = @()
foreach ($apk in Get-ChildItem -LiteralPath $output -Filter '*.apk') {
    $manifest = & "$buildTools/aapt2.exe" dump xmltree $apk.FullName --file AndroidManifest.xml
    if ($LASTEXITCODE -ne 0 -or ($manifest -join "`n") -match 'com.google.mlkit.common.internal.MlKitInitProvider') { throw "Eager OCR initialization remains in packaged manifest: $($apk.Name)" }
    $startup += "$($apk.Name): eager ML Kit provider absent; OCR initializes on document extraction"
    & "$buildTools/zipalign.exe" -c -P 16 4 $apk.FullName
    if ($LASTEXITCODE -ne 0) { throw "APK alignment failed: $($apk.Name)" }
    $alignment += "$($apk.Name): ZIP 16 KiB alignment passed"
    $zip = [IO.Compression.ZipFile]::OpenRead($apk.FullName)
    try {
        foreach ($entry in $zip.Entries) {
            $library = $entry.FullName -match '^lib/(arm64-v8a|x86_64)/.+\.so$'
            $releaseDex = $apk.Name -notmatch '-debug\.apk$' -and $entry.FullName -match '^classes\d*\.dex$'
            if (!$library -and !$releaseDex) { continue }
            $memory = [IO.MemoryStream]::new()
            $stream = $entry.Open()
            try { $stream.CopyTo($memory) } finally { $stream.Dispose() }
            $bytes = $memory.ToArray()
            $memory.Dispose()
            if ($library) {
                if ($bytes[4] -ne 2) { throw 'Expected ELF64.' }
                $offset = [BitConverter]::ToUInt64($bytes, 32)
                $size = [BitConverter]::ToUInt16($bytes, 54)
                $count = [BitConverter]::ToUInt16($bytes, 56)
                $minimum = [UInt64]::MaxValue
                for ($i = 0; $i -lt $count; $i++) {
                    $position = [int]($offset + $i * $size)
                    if ([BitConverter]::ToUInt32($bytes, $position) -eq 1) { $minimum = [Math]::Min($minimum, [BitConverter]::ToUInt64($bytes, $position + 48)) }
                }
                if ($minimum -lt 16384 -or $minimum -eq [UInt64]::MaxValue) { throw "Invalid ELF alignment: $($entry.FullName)" }
                $elf += "$($apk.Name) / $($entry.FullName): minimum PT_LOAD alignment=$minimum"
            }
            if ($releaseDex -and [Text.Encoding]::ASCII.GetString($bytes) -match 'LiveAcceptanceTest|VisualAcceptanceTest|SpecialistFlowTest|liveFixtures|liveWebId') { throw 'Test-only code found in release DEX.' }
        }
    } finally { $zip.Dispose() }
}
$alignment | Set-Content -LiteralPath "$evidence/zip-alignment.txt" -Encoding UTF8
$elf | Set-Content -LiteralPath "$evidence/elf-alignment.txt" -Encoding UTF8
$startup | Set-Content -LiteralPath "$evidence/ocr-startup-manifest.txt" -Encoding UTF8
'All release DEX files exclude test-only classes and live fixture arguments.' | Set-Content -LiteralPath "$evidence/release-fixture-exclusion.txt" -Encoding UTF8
$files = @(Get-ChildItem -LiteralPath "$root/apps/android-native/app/src" -Recurse -File) + @(Get-ChildItem -LiteralPath "$root/apps/android-native" -File | Where-Object { $_.Extension -in '.kts', '.properties', '.bat' }) + @(Get-Item -LiteralPath "$root/scripts/android-core-entry.mts", "$root/scripts/android-core-bundle.mts")
$files | Sort-Object FullName | ForEach-Object { '{0}  {1}' -f (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant(), $_.FullName.Substring($root.Length + 1).Replace('\', '/') } | Set-Content -LiteralPath "$evidence/source-sha256sums.txt" -Encoding UTF8
Write-Output "Signed bundle, APK alignment, ELF64 alignment, release fixture exclusion and source hashes verified in $output."
