param([int]$VersionCode=2026101605,[string]$VersionName='1.4.0')
$ErrorActionPreference='Stop'
$projectRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$baseline=Join-Path $projectRoot 'outputs/android-hotfix/Health-OS-v1.4-fix.apk'
$www=Join-Path $projectRoot 'dist/android-original-ui'
$output=Join-Path $projectRoot 'outputs/android-original-ui'
$tools=Join-Path $projectRoot '.build-tools/android-011/build-tools/android-15'
$jdk=Get-ChildItem -LiteralPath (Join-Path $projectRoot '.build-tools/android-011/jdk') -Directory | Select-Object -First 1
if(-not(Test-Path -LiteralPath (Join-Path $www 'index.html'))){throw 'Run npm run build:android first'}
if((Get-Content -LiteralPath (Join-Path $www 'index.html') -Raw) -notmatch "__HEALTH_OS_ANDROID_BUILD__=$VersionCode;"){throw 'Prepared frontend build code differs; set HEALTH_OS_ANDROID_BUILD before preparing'}
if((Get-FileHash -LiteralPath $baseline -Algorithm SHA256).Hash.ToLowerInvariant() -ne '6825d94790f92d9c429a9484425707fa86dc840bf7adec2e4b52c78c7b4f379f'){throw 'Unknown Android baseline'}
New-Item -ItemType Directory -Path $output -Force | Out-Null
$properties=@{}
Get-Content -LiteralPath 'C:\Users\Manpr\.codex\local-secrets\healthos-signing\release.properties' | ForEach-Object {if($_ -match '^([^#=]+)=(.*)$'){$properties[$matches[1].Trim()]=$matches[2].Trim()}}
$env:HOS_STORE_PASSWORD=$properties.storePassword
$env:HOS_KEY_PASSWORD=$properties.keyPassword
Add-Type -AssemblyName System.IO.Compression.FileSystem
function EntryHash($entry){$stream=$entry.Open();$hash=[Security.Cryptography.SHA256]::Create();try{return [BitConverter]::ToString($hash.ComputeHash($stream)).Replace('-','').ToLowerInvariant()}finally{$stream.Dispose();$hash.Dispose()}}
try{
 & "$tools/apksigner.bat" verify --print-certs $baseline > (Join-Path $output 'baseline-certificate.txt')
 if($LASTEXITCODE -ne 0){throw 'Original APK signature is invalid'}
 $source=[IO.Compression.ZipFile]::OpenRead($baseline)
 $unsigned=Join-Path $output 'unsigned.apk'
 if(Test-Path -LiteralPath $unsigned){Remove-Item -LiteralPath $unsigned}
 try{
  $manifest=Join-Path $output 'AndroidManifest.xml'
  [IO.Compression.ZipFileExtensions]::ExtractToFile($source.GetEntry('AndroidManifest.xml'),$manifest,$true)
  & node (Join-Path $projectRoot 'apps/health-os-mobile/scripts/patch-manifest.mjs') $manifest $VersionCode $VersionName 2026101304 '1.4'
  if($LASTEXITCODE -ne 0){throw 'Version patch failed'}
  $archive=[IO.Compression.ZipFile]::Open($unsigned,[IO.Compression.ZipArchiveMode]::Create)
  try{
   foreach($entry in $source.Entries){
    if($entry.FullName -match '^META-INF/[^/]+\.(SF|RSA|DSA|EC)$|^META-INF/MANIFEST.MF$'){continue}
    if($entry.FullName -eq 'AndroidManifest.xml'){[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$manifest,$entry.FullName)|Out-Null;continue}
    if($entry.FullName.StartsWith('assets/public/') -and -not $entry.FullName.EndsWith('/')){
     $file=[IO.Path]::GetFullPath((Join-Path $www $entry.FullName.Substring('assets/public/'.Length)))
     if(-not $file.StartsWith($www+[IO.Path]::DirectorySeparatorChar)){throw 'Packaged public path escaped the build directory'}
     if(-not(Test-Path -LiteralPath $file)){throw "Missing original Android public asset: $($entry.FullName)"}
     [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$file,$entry.FullName)|Out-Null;continue
    }
    $compression=if($entry.FullName -eq 'resources.arsc' -or $entry.FullName -like 'lib/*.so' -or $entry.Length -eq $entry.CompressedLength){[IO.Compression.CompressionLevel]::NoCompression}else{[IO.Compression.CompressionLevel]::Optimal}
    $copy=$archive.CreateEntry($entry.FullName,$compression);$inputStream=$entry.Open();$outputStream=$copy.Open()
    try{$inputStream.CopyTo($outputStream)}finally{$inputStream.Dispose();$outputStream.Dispose()}
   }
  }finally{$archive.Dispose()}
 }finally{$source.Dispose()}
 $stored=Join-Path $output 'stored.apk'
 & "$($jdk.FullName)/bin/java.exe" (Join-Path $projectRoot 'scripts/StoreApkResources.java') $unsigned $stored
 if($LASTEXITCODE -ne 0){throw 'Resource storage normalization failed'}
 $aligned=Join-Path $output 'aligned.apk'
 & "$tools/zipalign.exe" -f -P 16 4 $stored $aligned
 if($LASTEXITCODE -ne 0){throw 'APK alignment failed'}
 $apk=Join-Path $output "Health-OS-v$VersionName.apk"
 & "$tools/apksigner.bat" sign --ks 'C:\Users\Manpr\.codex\local-secrets\healthos-signing\health-os-upload.p12' --ks-key-alias $properties.keyAlias --ks-pass env:HOS_STORE_PASSWORD --key-pass env:HOS_KEY_PASSWORD --out $apk $aligned
 if($LASTEXITCODE -ne 0){throw 'APK signing failed'}
 & "$tools/apksigner.bat" verify --verbose --print-certs $apk > (Join-Path $output 'signature.txt')
 if($LASTEXITCODE -ne 0){throw 'APK signature verification failed'}
 $before=Get-Content (Join-Path $output 'baseline-certificate.txt') | Select-String 'certificate SHA-256 digest:' | Select-Object -First 1
 $after=Get-Content (Join-Path $output 'signature.txt') | Select-String 'certificate SHA-256 digest:' | Select-Object -First 1
 if($before.Line -ne $after.Line){throw 'Signing certificate differs from the supplied APK'}
 & "$tools/zipalign.exe" -c -P 16 4 $apk
 if($LASTEXITCODE -ne 0){throw 'Final alignment check failed'}
 & node (Join-Path $projectRoot 'scripts/verify-apk-storage.mjs') $apk
 if($LASTEXITCODE -ne 0){throw 'Final resource storage check failed'}
 $packageInfo=& "$tools/aapt2.exe" dump badging $apk
 if($LASTEXITCODE -ne 0){throw 'Package inspection failed'}
 $packageInfo | Select-Object -First 3 | Set-Content (Join-Path $output 'package.txt')
 $candidate=[IO.Compression.ZipFile]::OpenRead($apk);$original=[IO.Compression.ZipFile]::OpenRead($baseline)
 $nativeCount=0;$cssCount=0;$assetCount=0
 try{
  foreach($entry in $original.Entries){
   if($entry.FullName -eq 'AndroidManifest.xml' -or $entry.FullName -match '^META-INF/[^/]+\.(SF|RSA|DSA|EC)$|^META-INF/MANIFEST.MF$'){continue}
   $updated=$candidate.GetEntry($entry.FullName)
   if(-not $updated){throw "Original entry is missing: $($entry.FullName)"}
   if($entry.FullName.StartsWith('assets/public/')){
    $relative=$entry.FullName.Substring('assets/public/'.Length)
    if($relative.EndsWith('/')){continue}
    if((EntryHash $updated) -ne (Get-FileHash -LiteralPath (Join-Path $www $relative) -Algorithm SHA256).Hash.ToLowerInvariant()){throw "Packaged asset differs: $relative"}
    $assetCount++
    if($relative.EndsWith('.css')){if((EntryHash $updated) -ne (EntryHash $entry)){throw "Original stylesheet changed: $relative"};$cssCount++}
   }else{if((EntryHash $updated) -ne (EntryHash $entry)){throw "Native/config entry changed: $($entry.FullName)"};$nativeCount++}
  }
 }finally{$candidate.Dispose();$original.Dispose()}
 $hash=(Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash.ToLowerInvariant()
 "$hash  Health-OS-v$VersionName.apk" | Set-Content (Join-Path $output 'SHA256SUMS.txt')
 [ordered]@{baselineSha256='6825d94790f92d9c429a9484425707fa86dc840bf7adec2e4b52c78c7b4f379f';sha256=$hash;versionCode=$VersionCode;versionName=$VersionName;package='app.healthos.review';nativeEntriesPreserved=$nativeCount;originalStylesheetsPreserved=$cssCount;packagedPublicAssetsVerified=$assetCount;signingCertificateMatches=$true;deviceTested=$false} | ConvertTo-Json | Set-Content (Join-Path $output 'validation.json')
 Write-Output "Verified original-design Android update: $apk"
}finally{Remove-Item Env:HOS_STORE_PASSWORD,Env:HOS_KEY_PASSWORD -ErrorAction SilentlyContinue}
