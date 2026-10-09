param(
    [Parameter(Mandatory=$true)][string]$Serial,
    [Parameter(Mandatory=$true)][string]$EvidenceDirectory,
    [string]$Fixtures,
    [string]$WebId,
    [switch]$VisualOnly
)
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$adb=Join-Path $root '.build-tools/android-native/sdk/platform-tools/adb.exe'
if ($Serial -notmatch '^emulator-\d+$' -or ((& $adb -s $Serial shell getprop ro.kernel.qemu).Trim() -ne '1')) { throw 'Instrumentation is restricted to a dedicated emulator.' }
New-Item -ItemType Directory -Force -Path $EvidenceDirectory | Out-Null
$apk=Join-Path $root 'apps/android-native/app/build/outputs/apk/debug/app-debug.apk'
$test=Join-Path $root 'apps/android-native/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk'
& $adb -s $Serial install --no-incremental -r $apk
if ($LASTEXITCODE -ne 0) { throw 'App install failed.' }
& $adb -s $Serial install --no-incremental -r $test
if ($LASTEXITCODE -ne 0) { throw 'Test install failed.' }
$api=[int]((& $adb -s $Serial shell getprop ro.build.version.sdk).Trim())
if ($api -ge 33) { & $adb -s $Serial shell pm revoke app.healthos.nativeapp android.permission.POST_NOTIFICATIONS }
$arguments=@()
if ($Fixtures) {
    & $adb -s $Serial push $Fixtures /data/local/tmp/healthos-native-acceptance.json
    $arguments+=@('-e','liveFixtures','/data/local/tmp/healthos-native-acceptance.json')
}
if ($WebId) { $arguments+=@('-e','liveWebId',$WebId) }
if ($VisualOnly) { $arguments+=@('-e','class','app.healthos.nativeapp.VisualAcceptanceTest') }
function Invoke-Acceptance([string]$Name,[string[]]$Arguments) {
    $result=& $adb -s $Serial shell am instrument -w @Arguments app.healthos.nativeapp.test/androidx.test.runner.AndroidJUnitRunner 2>&1
    $result | Tee-Object -FilePath (Join-Path $EvidenceDirectory "$Name.txt") | Write-Output
    if (($result -join "`n") -notmatch 'OK \(\d+ tests?\)' -or ($result -join "`n") -match 'FAILURES!!!|Process crashed') { throw "Acceptance failed: $Name" }
}
Invoke-Acceptance 'instrumentation-full' $arguments
& $adb -s $Serial pull /sdcard/Android/data/app.healthos.nativeapp/files/visual-acceptance (Join-Path $EvidenceDirectory 'screenshots')
if ($api -ge 33) {
    & $adb -s $Serial shell pm grant app.healthos.nativeapp android.permission.POST_NOTIFICATIONS
    Invoke-Acceptance 'notifications-granted' @('-e','class','app.healthos.nativeapp.NotificationPermissionTest','-e','notificationsAllowed','true')
    & $adb -s $Serial shell pm revoke app.healthos.nativeapp android.permission.POST_NOTIFICATIONS
    Invoke-Acceptance 'notifications-revoked' @('-e','class','app.healthos.nativeapp.NotificationPermissionTest')
}
try {
    & $adb -s $Serial shell settings put system font_scale 2.0
    Invoke-Acceptance 'large-text' @('-e','class','app.healthos.nativeapp.VisualAcceptanceTest#captureDarkToday')
    & $adb -s $Serial pull /sdcard/Android/data/app.healthos.nativeapp/files/visual-acceptance/today-dark.png (Join-Path $EvidenceDirectory 'today-dark-font200.png')
    & $adb -s $Serial shell settings put system font_scale 1.0
    & $adb -s $Serial shell settings put system accelerometer_rotation 0
    & $adb -s $Serial shell settings put system user_rotation 1
    Invoke-Acceptance 'landscape' @('-e','class','app.healthos.nativeapp.VisualAcceptanceTest#captureDarkToday')
    & $adb -s $Serial pull /sdcard/Android/data/app.healthos.nativeapp/files/visual-acceptance/today-dark.png (Join-Path $EvidenceDirectory 'today-dark-landscape.png')
} finally {
    & $adb -s $Serial shell settings put system font_scale 1.0
    & $adb -s $Serial shell settings put system user_rotation 0
    & $adb -s $Serial shell settings put system accelerometer_rotation 1
    & $adb -s $Serial shell rm -f /data/local/tmp/healthos-native-acceptance.json
}
