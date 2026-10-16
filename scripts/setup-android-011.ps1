$ErrorActionPreference='Stop'
$target=Join-Path (Split-Path -Parent $PSScriptRoot) '.build-tools/android-011'
New-Item -ItemType Directory -Force $target | Out-Null
if(-not(Test-Path (Join-Path $target 'build-tools/android-15/apksigner.bat'))){
 [xml]$repository=(Invoke-WebRequest 'https://dl.google.com/android/repository/repository2-1.xml').Content
 $package=$repository.SelectNodes("//*[local-name()='remotePackage']") | Where-Object {$_.path -eq 'build-tools;35.0.0'} | Select-Object -First 1
 $archive=$package.SelectNodes(".//*[local-name()='archive']") | Where-Object { $_.'host-os' -eq 'windows' } | Select-Object -First 1
 if(-not $archive){throw 'Official Windows build-tools archive unavailable'}
 $url='https://dl.google.com/android/repository/'+$archive.complete.url
 Invoke-WebRequest $url -OutFile (Join-Path $target 'build-tools.zip')
 Expand-Archive -LiteralPath (Join-Path $target 'build-tools.zip') -DestinationPath (Join-Path $target 'build-tools') -Force
}
if(-not(Get-ChildItem (Join-Path $target 'jdk') -Filter java.exe -Recurse -ErrorAction SilentlyContinue)){
 $release=Invoke-RestMethod 'https://api.adoptium.net/v3/assets/latest/17/hotspot?architecture=x64&image_type=jdk&os=windows&vendor=eclipse'
 $package=$release[0].binary.package
 Invoke-WebRequest $package.link -OutFile (Join-Path $target 'jdk.zip')
 if((Get-FileHash (Join-Path $target 'jdk.zip') -Algorithm SHA256).Hash.ToLowerInvariant() -ne $package.checksum){throw 'JDK checksum mismatch'}
 Expand-Archive -LiteralPath (Join-Path $target 'jdk.zip') -DestinationPath (Join-Path $target 'jdk') -Force
}
Write-Output 'Official Android build tools and checksum-verified JDK ready.'
