param([string]$Baseline='C:\Users\Manpr\Downloads\Health-OS-v0.1.0.apk',[int]$VersionCode=2026101201,[string]$VersionName='0.1.1',[switch]$SideBySide)
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$tools=Join-Path $root '.build-tools/android-011/build-tools/android-15'
$jdk=Get-ChildItem (Join-Path $root '.build-tools/android-011/jdk') -Directory | Select-Object -First 1
$env:JAVA_HOME=$jdk.FullName
$output=Join-Path $root $(if($SideBySide){"outputs/android-v$VersionName-side-by-side"}else{"outputs/android-v$VersionName"})
$www=Join-Path $root 'dist/android-011'
if(-not(Test-Path (Join-Path $www 'index.html'))){throw 'Build the Android frontend first'}
if((Get-FileHash -LiteralPath $Baseline -Algorithm SHA256).Hash.ToLowerInvariant() -ne '1af5547aef4d0077bca7cb990e46846ee8a758c8def5d4c6462d239165456624'){throw 'Unknown baseline APK. Refusing to alter it.'}
New-Item -ItemType Directory -Force $output | Out-Null
$properties=@{}
Get-Content 'C:\Users\Manpr\.codex\local-secrets\healthos-signing\release.properties' | ForEach-Object {if($_ -match '^([^#=]+)=(.*)$'){$properties[$matches[1].Trim()]=$matches[2].Trim()}}
$keystore='C:\Users\Manpr\.codex\local-secrets\healthos-signing\health-os-upload.p12'
$env:HOS_STORE_PASSWORD=$properties.storePassword
$env:HOS_KEY_PASSWORD=$properties.keyPassword
try{
 & "$tools/apksigner.bat" verify --print-certs $Baseline > (Join-Path $output 'baseline-certificate.txt')
 if($LASTEXITCODE -ne 0){throw 'Baseline signature is invalid'}
 Add-Type -AssemblyName System.IO.Compression.FileSystem
 $original=[IO.Compression.ZipFile]::OpenRead($Baseline)
 $unsigned=Join-Path $output 'unsigned.apk'
 if(Test-Path -LiteralPath $unsigned){Remove-Item -LiteralPath $unsigned}
 try{
  [IO.Compression.ZipFileExtensions]::ExtractToFile($original.GetEntry('AndroidManifest.xml'),(Join-Path $output 'AndroidManifest.xml'),$true)
  $packageName=if($SideBySide){'app.healthos.review'}else{''}
  & node (Join-Path $root 'apps/health-os-mobile/scripts/patch-manifest.mjs') (Join-Path $output 'AndroidManifest.xml') $VersionCode $VersionName 2026100908 '0.1.0' $packageName
  if($LASTEXITCODE -ne 0){throw 'Manifest patch failed'}
  $nativeProject=Join-Path $root 'apps/health-os-mobile/health-connect-native'
  if(-not(Test-Path (Join-Path $nativeProject 'build/dex/classes.dex'))){throw 'Build native Health Connect DEX first'}
  & node (Join-Path $root 'apps/health-os-mobile/scripts/add-health-connect-manifest.mjs') (Join-Path $output 'AndroidManifest.xml')
  if($LASTEXITCODE -ne 0){throw 'Health Connect manifest patch failed'}
  $plugins=Get-Content (Join-Path $root 'apps/health-os-mobile/runtime/capacitor.plugins.json') -Raw | ConvertFrom-Json
  @($plugins)+@([pscustomobject]@{pkg='health-os-health-connect';classpath='app.healthos.nativebridge.HealthConnectPlugin'}) | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $output 'capacitor.plugins.json') -Encoding utf8
  Copy-Item (Join-Path $root 'apps/health-os-mobile/runtime/health-os-native.js') (Join-Path $www 'health-os-native.js')
  $html=Get-Content (Join-Path $www 'index.html') -Raw
  $html=[regex]::Replace($html,'<script>window\.__HEALTH_OS_ANDROID_VERSION__="[^"]*";(?:window\.__HEALTH_OS_ANDROID_BUILD__=\d+;)?</script>','')
  $html=$html.Replace('<head>',"<head><script>window.__HEALTH_OS_ANDROID_VERSION__=`"$VersionName`";window.__HEALTH_OS_ANDROID_BUILD__=$VersionCode;</script>")
  Set-Content (Join-Path $www 'index.html') $html -Encoding utf8
  Set-Content (Join-Path $www 'release-config.js') "export const releaseConfig=Object.freeze({version:'$VersionName',repo:'Manpreet86999/Health-Os',androidVersionCode:$VersionCode});" -Encoding utf8
  if($SideBySide){
   $config=Get-Content (Join-Path $root 'apps/health-os-mobile/runtime/capacitor.config.json') -Raw | ConvertFrom-Json
   $config.appId=$packageName
   $config | ConvertTo-Json -Depth 10 | Set-Content (Join-Path $output 'capacitor.config.json') -Encoding utf8
  }
  $archive=[IO.Compression.ZipFile]::Open($unsigned,[IO.Compression.ZipArchiveMode]::Create)
  try{
   foreach($entry in $original.Entries){
    if($entry.FullName -like 'assets/public/*' -or $entry.FullName -match '^META-INF/[^/]+\.(SF|RSA|DSA|EC)$|^META-INF/MANIFEST.MF$'){continue}
    if($entry.FullName -eq 'AndroidManifest.xml'){[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,(Join-Path $output 'AndroidManifest.xml'),$entry.FullName)|Out-Null;continue}
    if($entry.FullName -eq 'assets/capacitor.plugins.json'){[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,(Join-Path $output 'capacitor.plugins.json'),$entry.FullName)|Out-Null;continue}
    if($SideBySide -and $entry.FullName -eq 'assets/capacitor.config.json'){[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,(Join-Path $output 'capacitor.config.json'),$entry.FullName)|Out-Null;continue}
    $compression=[IO.Compression.CompressionLevel]::Optimal
    if($entry.FullName -eq 'resources.arsc' -or $entry.FullName -like 'lib/*.so' -or $entry.Length -eq $entry.CompressedLength){$compression=[IO.Compression.CompressionLevel]::NoCompression}
    $copy=$archive.CreateEntry($entry.FullName,$compression);$inputStream=$entry.Open();$outputStream=$copy.Open()
    try{$inputStream.CopyTo($outputStream)}finally{$inputStream.Dispose();$outputStream.Dispose()}
   }
   $dexNumber=(@($original.Entries | Where-Object {$_.FullName -match '^classes\d*\.dex$'}).Count)+1
   foreach($dex in Get-ChildItem (Join-Path $nativeProject 'build/dex') -Filter '*.dex' | Sort-Object Name){[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$dex.FullName,"classes$dexNumber.dex")|Out-Null;$dexNumber++}
   foreach($file in Get-ChildItem -LiteralPath $www -Recurse -File){$relative=$file.FullName.Substring($www.Length+1).Replace('\','/');[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$file.FullName,('assets/public/'+$relative))|Out-Null}
   # Keep Cordova bridge placeholders expected by the current shell.
   foreach($name in @('cordova.js','cordova_plugins.js')){if(-not(Test-Path (Join-Path $www $name))){$archive.CreateEntry('assets/public/'+$name)|Out-Null}}
  }finally{$archive.Dispose()}
 }finally{$original.Dispose()}
 $stored=Join-Path $output 'stored.apk'
 & "$env:JAVA_HOME/bin/java.exe" (Join-Path $root 'scripts/StoreApkResources.java') $unsigned $stored
 if($LASTEXITCODE -ne 0){throw 'Android resource storage normalization failed'}
 $aligned=Join-Path $output 'aligned.apk'
 & "$tools/zipalign.exe" -f -P 16 4 $stored $aligned
 if($LASTEXITCODE -ne 0){throw 'APK alignment failed'}
 $apk=Join-Path $output $(if($SideBySide){"Health-OS-v$VersionName-side-by-side.apk"}else{"Health-OS-v$VersionName.apk"})
 & "$tools/apksigner.bat" sign --ks $keystore --ks-key-alias $properties.keyAlias --ks-pass env:HOS_STORE_PASSWORD --key-pass env:HOS_KEY_PASSWORD --out $apk $aligned
 if($LASTEXITCODE -ne 0){throw 'Signing failed'}
 & "$tools/apksigner.bat" verify --verbose --print-certs $apk > (Join-Path $output 'signature.txt')
 if($LASTEXITCODE -ne 0){throw 'Signature validation failed'}
 $before=Get-Content (Join-Path $output 'baseline-certificate.txt') | Select-String 'certificate SHA-256 digest:' | Select-Object -First 1
 $after=Get-Content (Join-Path $output 'signature.txt') | Select-String 'certificate SHA-256 digest:' | Select-Object -First 1
 if(-not $SideBySide -and $before.Line -ne $after.Line){throw 'Signing certificate mismatch. Do not install this APK over existing data.'}
 & "$tools/zipalign.exe" -c -P 16 4 $apk
 if($LASTEXITCODE -ne 0){throw 'Final alignment validation failed'}
 & node (Join-Path $root 'scripts/verify-apk-storage.mjs') $apk
 if($LASTEXITCODE -ne 0){throw 'Android resource storage validation failed'}
 $packageInfo=& "$tools/aapt2.exe" dump badging $apk
 if($LASTEXITCODE -ne 0){throw 'Package inspection failed'}
 $packageInfo | Select-Object -First 3 > (Join-Path $output 'package.txt')
 '{0}  {1}' -f (Get-FileHash $apk -Algorithm SHA256).Hash.ToLowerInvariant(),(Split-Path $apk -Leaf) | Set-Content (Join-Path $output 'SHA256SUMS.txt')
 Write-Output "Verified update APK: $apk"
}finally{Remove-Item Env:HOS_STORE_PASSWORD,Env:HOS_KEY_PASSWORD -ErrorAction SilentlyContinue}
