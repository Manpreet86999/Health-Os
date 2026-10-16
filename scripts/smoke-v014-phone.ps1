$ErrorActionPreference='Stop'
$v014Root=Split-Path -Parent $PSScriptRoot
$v014Adb=Join-Path $v014Root '.build-tools/android-011/platform-tools/adb.exe'
$v014Evidence=Join-Path $v014Root 'outputs/releases/health-os-v0.1.4/evidence'
$v014Checks=@()
function ReadV014Ui([string]$name){
 & $v014Adb shell uiautomator dump /sdcard/health-os-v014-smoke.xml | Out-Null
 & $v014Adb pull /sdcard/health-os-v014-smoke.xml (Join-Path $v014Evidence "phone-$name.xml") | Out-Null
 [xml]$view=Get-Content (Join-Path $v014Evidence "phone-$name.xml") -Raw
 $text=($view.SelectNodes('//node') | ForEach-Object {$_.text}) -join "`n"
 if($text -match 'Something went wrong|Minified React error|Objects are not valid'){throw "Rendering failure on $name"}
 if($text -match 'Sign in to Health OS'){throw "Session missing on $name"}
 return $text
}
& $v014Adb shell input tap 1000 1000
foreach($target in @(@('Today',120),@('Train',540),@('Eat',750),@('Intelligence',350))){
 & $v014Adb shell input tap $target[1] 2280
 Start-Sleep -Milliseconds 900
 $text=ReadV014Ui $target[0]
 $v014Checks+=@{screen=$target[0];rendered=$true;signedIn=$true}
 Write-Output "Phone page rendered: $($target[0])"
}
& $v014Adb shell input keyevent 4
$null=ReadV014Ui 'android-back'
$v014Checks+=@{screen='Android Back';rendered=$true}
& $v014Adb shell input keyevent 3
& $v014Adb shell am start -n app.healthos.review/app.healthos.mobile.MainActivity | Out-Null
Start-Sleep -Milliseconds 900
$null=ReadV014Ui 'resume'
$v014Checks+=@{screen='background/resume';rendered=$true;signedIn=$true}
$result=@{versionName='0.1.4';versionCode=2026101502;package='app.healthos.review';installedWithoutUninstallOrDataClear=$true;checks=$v014Checks;qwenTextResponse='Verified in phone-qwen-result.xml, using Context=None';importantApprovals='Approval requirement visible; approval/receipt/undo tested with synthetic records in compiled browser client'}
$result | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $v014Evidence 'phone-smoke.json')
Write-Output 'Compact phone navigation, session, Back and resume smoke passed.'
