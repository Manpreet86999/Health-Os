param([string[]]$Tasks = @(':app:testDebugUnitTest', ':app:lintDebug', ':app:assembleDebug', ':app:assembleRelease', ':app:bundleRelease'))
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$toolsRoot = Join-Path $repoRoot '.build-tools/android-native'
if (!$env:JAVA_HOME) {
    $jdkDirectory = Get-ChildItem -LiteralPath (Join-Path $toolsRoot 'jdk') -Directory -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($jdkDirectory) { $env:JAVA_HOME = $jdkDirectory.FullName }
}
if (!$env:JAVA_HOME) { throw 'Set JAVA_HOME to JDK 17.' }
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
if (!$env:ANDROID_HOME) { $env:ANDROID_HOME = Join-Path $toolsRoot 'sdk' }
if (!(Test-Path -LiteralPath (Join-Path $env:ANDROID_HOME 'platforms/android-36/android.jar'))) { throw 'Install Android platform 36 and build-tools 35.0.0; set ANDROID_HOME to the SDK.' }
$installedGradle = Join-Path $toolsRoot 'gradle-8.13/bin/gradle.bat'
$project = Join-Path $repoRoot 'apps/android-native'
if (Test-Path -LiteralPath $installedGradle) { & $installedGradle -p $project @Tasks --console=plain }
else { & (Join-Path $project 'gradlew.bat') -p $project @Tasks --console=plain }
if ($LASTEXITCODE -ne 0) { throw "Native Android checks failed ($LASTEXITCODE)." }
