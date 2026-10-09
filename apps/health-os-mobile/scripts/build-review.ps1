param([string]$Keystore,[string]$Alias='health-os-review',[string]$StorePassword='android',[int]$VersionCode=2026100901,[string]$VersionName='5.2.1')
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$project=Join-Path $root 'apps/health-os-mobile'
$localJdk=Join-Path $root '.build-tools/android-native/jdk/jdk-17.0.20.1+1'
if(Test-Path -LiteralPath $localJdk){$env:JAVA_HOME=$localJdk}
if(-not $env:JAVA_HOME){throw 'JDK 17 is required'}
$tools=Join-Path $root '.build-tools/android-native/sdk/build-tools/35.0.0'
if(-not(Test-Path -LiteralPath $tools)){if(-not $env:ANDROID_HOME){throw 'ANDROID_HOME is required'};$tools=Join-Path $env:ANDROID_HOME 'build-tools/35.0.0'}
$output=Join-Path $root 'outputs/apk-refinement'
$temp=Join-Path $root 'scratch/apk-refinement/package'
New-Item -ItemType Directory -Force $output,$temp | Out-Null
& node (Join-Path $PSScriptRoot 'prepare.mjs')
if($LASTEXITCODE -ne 0){throw 'Interface preparation failed'}
$reference=Join-Path $project 'reference/Health-OS-5.2.0-2026100802.apk'
if((Get-FileHash -LiteralPath $reference -Algorithm SHA256).Hash.ToLowerInvariant() -ne '8856365bbdbd2bbd295f0cfe136fc51bfe2265e68764bfee9842dd95b7e91fb3'){throw 'Reference mismatch'}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$original=[IO.Compression.ZipFile]::OpenRead($reference)
$unsigned=Join-Path $temp 'review-unsigned.apk'
if(Test-Path -LiteralPath $unsigned){Remove-Item -LiteralPath $unsigned}
try{
 [IO.Compression.ZipFileExtensions]::ExtractToFile($original.GetEntry('AndroidManifest.xml'),(Join-Path $temp 'AndroidManifest.xml'),$true)
 & node (Join-Path $PSScriptRoot 'patch-manifest.mjs') (Join-Path $temp 'AndroidManifest.xml') $VersionCode $VersionName
 if($LASTEXITCODE -ne 0){throw 'Manifest patch failed'}
 $archive=[IO.Compression.ZipFile]::Open($unsigned,[IO.Compression.ZipArchiveMode]::Create)
 try{
  foreach($entry in $original.Entries){
   if($entry.FullName -match '^META-INF/[^/]+\.(SF|RSA|DSA|EC)$|^META-INF/MANIFEST.MF$'){continue}
   $replacement=$null
   if($entry.FullName -eq 'assets/public/index.html'){$replacement=Join-Path $project 'www/index.html'}
   if($entry.FullName -eq 'AndroidManifest.xml'){$replacement=Join-Path $temp 'AndroidManifest.xml'}
   if($entry.FullName -eq 'assets/public/assets/ux-system-zE_LYOjW.js'){$replacement=Join-Path $project 'www/assets/ux-system-zE_LYOjW.js'}
   if($entry.FullName -eq 'assets/public/assets/Tracker-DqfCL2CA.js'){$replacement=Join-Path $project 'www/assets/Tracker-DqfCL2CA.js'}
   if($replacement){[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$replacement,$entry.FullName,[IO.Compression.CompressionLevel]::Optimal)|Out-Null;continue}
   $compression=[IO.Compression.CompressionLevel]::Optimal
   if($entry.FullName -eq 'resources.arsc' -or $entry.FullName -like 'lib/*.so' -or $entry.CompressedLength -eq $entry.Length){$compression=[IO.Compression.CompressionLevel]::NoCompression}
   $copy=$archive.CreateEntry($entry.FullName,$compression)
   $inputStream=$entry.Open();$outputStream=$copy.Open()
   try{$inputStream.CopyTo($outputStream)}finally{$inputStream.Dispose();$outputStream.Dispose()}
  }
  [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,(Join-Path $project 'www/health-os-native.js'),'assets/public/health-os-native.js',[IO.Compression.CompressionLevel]::Optimal)|Out-Null
  foreach($name in @('health-os-release.js','health-os-release.css','release-config.js')){
   [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,(Join-Path $project ('www/'+$name)),('assets/public/'+$name),[IO.Compression.CompressionLevel]::Optimal)|Out-Null
  }
 }finally{$archive.Dispose()}
}finally{$original.Dispose()}
if(-not $Keystore){
 $Keystore=Join-Path $root '.build-tools/apk-refinement/review.p12'
 New-Item -ItemType Directory -Force (Split-Path $Keystore -Parent)|Out-Null
 if(-not(Test-Path -LiteralPath $Keystore)){
  & "$env:JAVA_HOME/bin/keytool.exe" -genkeypair -keystore $Keystore -storetype PKCS12 -alias $Alias -storepass $StorePassword -keypass $StorePassword -keyalg RSA -keysize 2048 -validity 3650 -dname 'CN=Health OS Review,OU=Local Development,O=Health OS,C=IN'
  if($LASTEXITCODE -ne 0){throw 'Review certificate generation failed'}
 }
}
$aligned=Join-Path $temp 'review-aligned.apk'
& "$tools/zipalign.exe" -f -P 16 4 $unsigned $aligned
if($LASTEXITCODE -ne 0){throw 'Alignment failed'}
$apk=Join-Path $output "Health-OS-$VersionName-$VersionCode-review.apk"
& "$tools/apksigner.bat" sign --ks $Keystore --ks-key-alias $Alias --ks-pass "pass:$StorePassword" --key-pass "pass:$StorePassword" --out $apk $aligned
if($LASTEXITCODE -ne 0){throw 'Signing failed'}
& "$tools/apksigner.bat" verify --print-certs $apk | Set-Content (Join-Path $output 'signer.txt')
if($LASTEXITCODE -ne 0){throw 'Signature verification failed'}
& "$tools/zipalign.exe" -c -P 16 4 $apk
if($LASTEXITCODE -ne 0){throw 'Final alignment verification failed'}
& "$tools/aapt2.exe" dump badging $apk | Select-Object -First 3 | Set-Content (Join-Path $output 'package.txt')
if($LASTEXITCODE -ne 0){throw 'Package inspection failed'}
'{0}  {1}' -f (Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash.ToLowerInvariant(),(Split-Path $apk -Leaf) | Set-Content (Join-Path $output 'SHA256SUMS.txt')
Write-Output "Built review APK: $apk"
