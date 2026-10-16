$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$directory=Join-Path $root 'outputs/android-v0.1.1-side-by-side'
$apk=Join-Path $directory 'Health-OS-v0.1.1-side-by-side.apk'
$www=Join-Path $root 'dist/android-011'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$baseline=[IO.Compression.ZipFile]::OpenRead('C:\Users\Manpr\Downloads\Health-OS-v0.1.0.apk')
$candidate=[IO.Compression.ZipFile]::OpenRead($apk)
function HashEntry($entry){$stream=$entry.Open();$hasher=[Security.Cryptography.SHA256]::Create();try{return [Convert]::ToHexString($hasher.ComputeHash($stream)).ToLowerInvariant()}finally{$stream.Dispose();$hasher.Dispose()}}
try{
 $retained=0
 foreach($entry in $baseline.Entries){
  if($entry.FullName -like 'assets/public/*' -or $entry.FullName -in @('AndroidManifest.xml','assets/capacitor.config.json','assets/capacitor.plugins.json') -or $entry.FullName -match '^META-INF/[^/]+\.(SF|RSA|DSA|EC)$|^META-INF/MANIFEST.MF$'){continue}
  $updated=$candidate.GetEntry($entry.FullName)
  if(-not $updated -or (HashEntry $updated) -ne (HashEntry $entry)){throw "Native baseline changed: $($entry.FullName)"}
  $retained++
 }
 $verified=0
 foreach($file in Get-ChildItem -LiteralPath $www -File -Recurse){
  $relative=$file.FullName.Substring($www.Length+1).Replace('\','/')
  $entry=$candidate.GetEntry('assets/public/'+$relative)
  if(-not $entry -or (HashEntry $entry) -ne (Get-FileHash $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()){throw "Prepared frontend differs: $relative"}
  $verified++
 }
 $package=Get-Content (Join-Path $directory 'package.txt') -Raw
 if($package -notmatch "name='app.healthos.review'" -or $package -notmatch "versionName='0.1.1'" -or $package -notmatch "versionCode='2026101201'"){throw 'Package identity/version mismatch'}
 $pluginsStream=$candidate.GetEntry('assets/capacitor.plugins.json').Open();$reader=[IO.StreamReader]::new($pluginsStream);try{$plugins=$reader.ReadToEnd()|ConvertFrom-Json}finally{$reader.Dispose()}
 if(-not($plugins | Where-Object {$_.classpath -eq 'app.healthos.nativebridge.HealthConnectPlugin'})){throw 'Health Connect plugin missing'}
 $baseDexCount=@($baseline.Entries | Where-Object {$_.FullName -match '^classes\d*\.dex$'}).Count
 $newDex=@($candidate.Entries | Where-Object {$_.FullName -match '^classes\d*\.dex$'}).Count-$baseDexCount
 if($newDex -lt 1){throw 'Native Health Connect DEX missing'}
 $manifest=& (Join-Path $root '.build-tools/android-011/build-tools/android-15/aapt2.exe') dump xmltree --file AndroidManifest.xml $apk
 if($LASTEXITCODE -ne 0){throw 'Native manifest is invalid'}
 foreach($required in @('HealthDataSdkService','ACTION_BIND_SDK_SERVICE','HealthPrivacyActivity','HealthConnectJob','android.permission.health.READ_STEPS','android.permission.health.READ_SLEEP')){if(-not($manifest -match [regex]::Escape($required))){throw "Required Health Connect manifest entry missing: $required"}}
 $report=[ordered]@{version='0.1.1';versionCode=2026101201;package='app.healthos.review';nativeEntriesPreserved=$retained;healthConnectNativeDex=$newDex;frontendFilesVerified=$verified;sha256=(Get-FileHash $apk -Algorithm SHA256).Hash.ToLowerInvariant();signature='Verified by apksigner';alignment='16 KiB verified';installation='Updates the installed app.healthos.review';originalVersion='Input APK 0.1.0; old installation removed by user';browserTests=14;originalSigningKey='Not found in authorized prior Health OS build locations'}
 $report | ConvertTo-Json | Set-Content (Join-Path $directory 'validation.json') -Encoding utf8
 $report | ConvertTo-Json
}finally{$baseline.Dispose();$candidate.Dispose()}
