param([Parameter(Mandatory=$true)][string]$Serial,[Parameter(Mandatory=$true)][string]$Fixtures,[Parameter(Mandatory=$true)][string]$EvidenceDirectory,[switch]$ResumeAfterSave)
$ErrorActionPreference='Stop'
$adb=Join-Path (Split-Path -Parent $PSScriptRoot) '.build-tools/android-native/sdk/platform-tools/adb.exe'
if($Serial -notmatch '^emulator-\d+$' -or ((& $adb -s $Serial shell getprop ro.kernel.qemu).Trim() -ne '1')){throw 'Daily-flow testing requires a dedicated emulator.'}
$fixture=(Get-Content -LiteralPath $Fixtures -Raw | ConvertFrom-Json)[0]
if($fixture.email -notmatch '^native-acceptance-.+@example\.invalid$' -or $fixture.password -notmatch '^[A-Za-z0-9!@#._-]+$'){throw 'Unsupported disposable fixture.'}
New-Item -ItemType Directory -Force -Path $EvidenceDirectory | Out-Null
function Read-Ui {
    & $adb -s $Serial shell uiautomator dump /data/local/tmp/healthos-daily-ui.xml > $null
    [xml](& $adb -s $Serial shell cat /data/local/tmp/healthos-daily-ui.xml)
}
function Tap-Node($node){
    if(!$node){throw 'Required UI control unavailable.'}
    $n=[regex]::Matches($node.bounds,'\d+') | ForEach-Object {[int]$_.Value}
    & $adb -s $Serial shell input tap (($n[0]+$n[2])/2) (($n[1]+$n[3])/2)
    Start-Sleep -Milliseconds 700
}
function Tap-Text([string]$label,[int]$scrolls=0){
    for($i=0;$i -le $scrolls;$i++){
        $tree=Read-Ui
        $node=$tree.SelectNodes('//node') | Where-Object { $_.text -ceq $label -or $_.'content-desc' -ceq $label } | Select-Object -Last 1
        if($node){Tap-Node $node; return}
        if($i -lt $scrolls){ & $adb -s $Serial shell input swipe 950 1850 950 650 350 }
    }
    throw "UI control unavailable: $label"
}
function Enter-Field([int]$Index,[string]$Value){
    $tree=Read-Ui
    Tap-Node ($tree.SelectNodes('//node[@class="android.widget.EditText"]')[$Index])
    & $adb -s $Serial shell input keycombination 113 29
    & $adb -s $Serial shell input keyevent 67
    foreach($character in $Value.ToCharArray()){
        & $adb -s $Serial shell input text ([string]$character)
        Start-Sleep -Milliseconds 60
    }
    & $adb -s $Serial shell input keyevent 4
    Start-Sleep -Seconds 1
}
& $adb -s $Serial shell am start -W -n app.healthos.nativeapp/.MainActivity > $null
if(!$ResumeAfterSave){
$tree=Read-Ui
if(!$tree.SelectNodes('//node[@class="android.widget.EditText"]').Count){Tap-Text 'Sign in to see Readiness'; $tree=Read-Ui}
$inputs=$tree.SelectNodes('//node[@class="android.widget.EditText"]')
if($inputs.Count -ne 2){throw 'Expected the native sign-in form.'}
Enter-Field 0 $fixture.email
$tree=Read-Ui
if($tree.SelectNodes('//node[@class="android.widget.EditText"]')[0].text -cne $fixture.email){throw 'Email input did not retain all injected characters.'}
Enter-Field 1 $fixture.password
Tap-Text 'Sign in'
Start-Sleep -Seconds 5
Tap-Text 'Log'
Tap-Text 'Water'
Tap-Text '250 mL'
Tap-Text 'Review entry'
Tap-Text 'Save entry'
}
Tap-Text 'You'
Tap-Text 'Data and sync' 5
Tap-Text 'Retry sync' 5
Start-Sleep -Seconds 4
$tree=Read-Ui
if(!($tree.SelectNodes('//node') | Where-Object text -eq 'No pending entries on this device.')){throw 'The real entry has not synchronized.'}
'PASS: actual native sign-in, reviewed water save and empty synchronized outbox.' | Set-Content (Join-Path $EvidenceDirectory 'daily-flow.txt')
& $adb -s $Serial shell am force-stop app.healthos.nativeapp
& $adb -s $Serial shell am start -W -n app.healthos.nativeapp/.MainActivity > $null
Start-Sleep -Seconds 3
Tap-Text 'You'
Tap-Text 'Data and sync' 5
Tap-Text 'Sign out' 12
Tap-Text 'Sign out'
Start-Sleep -Seconds 2
$tree=Read-Ui
if(!($tree.SelectNodes('//node') | Where-Object text -eq 'Sign in')){throw 'Sign-out form not visible.'}
'PASS: process restart retained the account; explicit sign-out returned to authentication.' | Add-Content (Join-Path $EvidenceDirectory 'daily-flow.txt')
Get-Content (Join-Path $EvidenceDirectory 'daily-flow.txt')
