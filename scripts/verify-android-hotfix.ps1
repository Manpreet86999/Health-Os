param([string]$VersionName='0.1.1',[int]$VersionCode=2026101301)
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$directory=Join-Path $root "outputs/android-v$VersionName-side-by-side"
$apk=Join-Path $directory "Health-OS-v$VersionName-side-by-side.apk"
$www=Join-Path $root 'dist/android-011'
& node (Join-Path $root 'scripts/verify-apk-storage.mjs') $apk
if($LASTEXITCODE -ne 0){throw 'Android resource storage validation failed'}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$baseline=[IO.Compression.ZipFile]::OpenRead('C:\Users\Manpr\Downloads\Health-OS-v0.1.0.apk')
$candidate=[IO.Compression.ZipFile]::OpenRead($apk)
function HashEntry($entry){
 $stream=$entry.Open();$hasher=[Security.Cryptography.SHA256]::Create()
 try{return [BitConverter]::ToString($hasher.ComputeHash($stream)).Replace('-','').ToLowerInvariant()}
 finally{$stream.Dispose();$hasher.Dispose()}
}
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
  if(-not $entry -or (HashEntry $entry) -ne (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()){throw "Packaged frontend differs: $relative"}
  $verified++
 }
 $package=Get-Content (Join-Path $directory 'package.txt') -Raw
 if($package -notmatch "name='app.healthos.review'" -or $package -notmatch "versionName='$VersionName'" -or $package -notmatch "versionCode='$VersionCode'"){throw 'Package identity/version mismatch'}
 $signature=Get-Content (Join-Path $directory 'signature.txt') -Raw
 if($signature -notmatch 'Verified using v3 scheme \(APK Signature Scheme v3\): true' -or $signature -notmatch '5b24c41d56d935c0547e4f6e95530760cee76d55684534a24ba8234210e7a5dc'){throw 'Review app signing identity mismatch'}
 $baseDex=@($baseline.Entries | Where-Object {$_.FullName -match '^classes\d*\.dex$'}).Count
 $newDex=@($candidate.Entries | Where-Object {$_.FullName -match '^classes\d*\.dex$'}).Count-$baseDex
 if($newDex -lt 1){throw 'Health Connect native DEX missing'}
 $delivery=Join-Path $root 'outputs/android-hotfix'
 New-Item -ItemType Directory -Force -Path $delivery | Out-Null
 $delivered=Join-Path $delivery "Health-OS-v$VersionName-fix.apk"
 Copy-Item -LiteralPath $apk -Destination $delivered -Force
 $hash=(Get-FileHash -LiteralPath $delivered -Algorithm SHA256).Hash.ToLowerInvariant()
 "$hash  Health-OS-v$VersionName-fix.apk" | Set-Content (Join-Path $delivery 'SHA256SUMS.txt')
 $report=[ordered]@{version=$VersionName;versionCode=$VersionCode;package='app.healthos.review';nativeEntriesPreserved=$retained;healthConnectNativeDex=$newDex;frontendFilesVerified=$verified;sha256=$hash;signature='v3 verified; same review-app signing key';alignment='16 KiB verified during packaging';deviceTested=$false;fixes=@('Intelligence uses the active workout title instead of rendering the draft object','Workout draft and confirmed sets are preserved','Imported exercise labels and cached sources render as text','Visible Save & send AI report action in both themes')}
 $report | ConvertTo-Json | Set-Content (Join-Path $delivery 'validation.json')
 $report | ConvertTo-Json
}finally{$baseline.Dispose();$candidate.Dispose()}
