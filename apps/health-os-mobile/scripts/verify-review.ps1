param([int]$VersionCode=2026100901,[string]$VersionName='5.2.1')
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$originalPath=Join-Path $root 'apps/health-os-mobile/reference/Health-OS-5.2.0-2026100802.apk'
$reviewPath=Join-Path $root "outputs/apk-refinement/Health-OS-$VersionName-$VersionCode-review.apk"
Add-Type -AssemblyName System.IO.Compression.FileSystem
$original=[IO.Compression.ZipFile]::OpenRead($originalPath)
$review=[IO.Compression.ZipFile]::OpenRead($reviewPath)
function Hash-Entry($entry){
 $stream=$entry.Open();$hash=[Security.Cryptography.SHA256]::Create()
 try{return [Convert]::ToHexString($hash.ComputeHash($stream)).ToLowerInvariant()}finally{$stream.Dispose();$hash.Dispose()}
}
try{
 $retained=0;$changed=@()
 foreach($entry in $original.Entries){
  if($entry.FullName -match '^META-INF/[^/]+\.(SF|RSA|DSA|EC)$|^META-INF/MANIFEST.MF$'){continue}
  $candidate=$review.GetEntry($entry.FullName)
  if(-not $candidate){throw "Missing reference entry: $($entry.FullName)"}
  if((Hash-Entry $entry) -ne (Hash-Entry $candidate)){
   if($entry.FullName -notin @('AndroidManifest.xml','assets/public/index.html','assets/public/assets/ux-system-zE_LYOjW.js','assets/public/assets/Tracker-DqfCL2CA.js')){throw "Unexpected changed entry: $($entry.FullName)"}
   $changed+=$entry.FullName
  }else{$retained++}
 }
 foreach($entry in $review.Entries){
  if(-not $original.GetEntry($entry.FullName) -and $entry.FullName -notin @('assets/public/health-os-native.js','assets/public/health-os-release.js','assets/public/health-os-release.css','assets/public/release-config.js') -and $entry.FullName -notmatch '^META-INF/[^/]+\.(SF|RSA|DSA|EC)$|^META-INF/MANIFEST.MF$'){throw "Unexpected added entry: $($entry.FullName)"}
 }
 if($changed.Count -ne 4 -or -not $review.GetEntry('assets/public/health-os-native.js')){throw 'Expected manifest/integration/tracker patch not found'}
 foreach($pair in @(
  @('assets/public/index.html','apps/health-os-mobile/www/index.html'),
  @('assets/public/health-os-release.js','src/client/public/health-os-release.js'),
  @('assets/public/health-os-release.css','src/client/public/health-os-release.css'),
  @('assets/public/release-config.js','src/client/public/release-config.js'),
  @('assets/public/health-os-native.js','apps/health-os-mobile/www/health-os-native.js'),
  @('assets/public/assets/Tracker-DqfCL2CA.js','apps/health-os-mobile/www/assets/Tracker-DqfCL2CA.js'),
  @('assets/public/assets/ux-system-zE_LYOjW.js','apps/health-os-mobile/www/assets/ux-system-zE_LYOjW.js')
 )){
  $expected=(Get-FileHash -LiteralPath (Join-Path $root $pair[1]) -Algorithm SHA256).Hash.ToLowerInvariant()
  if((Hash-Entry $review.GetEntry($pair[0])) -ne $expected){throw "Packaged integration is stale: $($pair[0])"}
 }
 $report=@("$retained original APK entries are byte-identical, including DEX, resources, all CSS and all screen chunks except the requested workout change.","Changed entries: $($changed -join ', ')",'Added entry: assets/public/health-os-native.js','Packaged integration and workout card module match the current editable source and tested prepared bundle.','Signing certificate differs from the supplied APK. This review build cannot update its existing installation in place.')
 $report | Set-Content (Join-Path $root 'outputs/apk-refinement/reference-preservation.txt')
 $report | Write-Output
}finally{$original.Dispose();$review.Dispose()}
