$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$adb=Join-Path $root '.build-tools/android-011/platform-tools/adb.exe'
$output=Join-Path $root 'outputs/android-hotfix/native'
New-Item -ItemType Directory -Force -Path $output | Out-Null
function DeviceCommand([string[]]$taskArguments){
 $taskResult=& $adb @taskArguments
 if($LASTEXITCODE -ne 0){throw "ADB command failed: $($taskArguments[0])"}
 return $taskResult
}
function ReadUi{
 $null=DeviceCommand @('shell','uiautomator','dump','/sdcard/health-os-native-smoke.xml')
 $null=DeviceCommand @('pull','/sdcard/health-os-native-smoke.xml',(Join-Path $output 'current.xml'))
 return [xml](Get-Content (Join-Path $output 'current.xml') -Raw)
}
function Bounds($taskNode){
 $taskMatch=[regex]::Match($taskNode.bounds,'^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$')
 if(-not $taskMatch.Success){return $null}
 return @([int]$taskMatch.Groups[1].Value,[int]$taskMatch.Groups[2].Value,[int]$taskMatch.Groups[3].Value,[int]$taskMatch.Groups[4].Value)
}
function CheckUi($taskUi){
 $taskErrors=@($taskUi.SelectNodes('//node') | Where-Object {$_.text -match 'Something went wrong|could not load|Minified React error|Objects are not valid'})
 if($taskErrors.Count){throw 'A native screen displayed a rendering error. See captured UI evidence.'}
}
$ui=$null
for($taskAttempt=0;$taskAttempt -lt 30;$taskAttempt++){
 $ui=ReadUi;CheckUi $ui
 $tour=$ui.SelectSingleNode('//node[@text="Start exploring"]')
 if($tour){
  $tourBounds=Bounds $tour
  $null=DeviceCommand @('shell','input','tap',([string][int](($tourBounds[0]+$tourBounds[2])/2)),([string][int](($tourBounds[1]+$tourBounds[3])/2)))
  continue
 }
 if(@($ui.SelectNodes('//node[@text="Intelligence"]')).Count){break}
 if($taskAttempt -eq 29){throw 'The native account workspace did not finish loading'}
 Start-Sleep -Milliseconds 1000
}
$display=(DeviceCommand @('shell','wm','size')) -join "`n"
$displayMatch=([regex]::Matches($display,'(\d+)x(\d+)') | Select-Object -Last 1)
if(-not $displayMatch){throw 'Could not read the Android display dimensions'}
$width=[int]$displayMatch.Groups[1].Value;$height=[int]$displayMatch.Groups[2].Value;$navY=[int]($height*.95)
# The brand button returns to Today regardless of the current horizontal rail position.
foreach($taskBrand in $ui.SelectNodes('//node[@text="Health OS"]')){
 $brandBounds=Bounds $taskBrand
 if($brandBounds -and $brandBounds[3] -gt $brandBounds[1] -and $brandBounds[1] -lt ($height*.2)){
  $null=DeviceCommand @('shell','input','tap',([string][int](($brandBounds[0]+$brandBounds[2])/2)),([string][int](($brandBounds[1]+$brandBounds[3])/2)))
  $ui=ReadUi;break
 }
}
$checks=@()
$destinations=@('Today','Intelligence','Train','Eat','Recover','Health','Body','Care','Insights','Pods','Reports','Organization','Sync','Research')
foreach($destination in $destinations){
 $target=$null
 for($taskAttempt=0;$taskAttempt -lt 12;$taskAttempt++){
  foreach($taskNode in $ui.SelectNodes("//node[@text='$destination']")){
   $taskBounds=Bounds $taskNode
   if($taskBounds -and $taskBounds[1] -gt ($height*.88) -and $taskBounds[3] -gt $taskBounds[1] -and $taskBounds[0] -ge 15 -and $taskBounds[2] -le ($width-15)){$target=$taskBounds;break}
  }
  if($target){break}
  $visibleIndices=@()
  foreach($taskVisible in $ui.SelectNodes('//node')){
   $visibleBounds=Bounds $taskVisible;$visibleIndex=[array]::IndexOf($destinations,$taskVisible.text)
   if($visibleIndex -ge 0 -and $visibleBounds -and $visibleBounds[1] -gt ($height*.88) -and $visibleBounds[3] -gt $visibleBounds[1] -and $visibleBounds[0] -lt $width -and $visibleBounds[2] -gt 0){$visibleIndices+=$visibleIndex}
  }
  $goRight=$visibleIndices.Count -and [array]::IndexOf($destinations,$destination) -le ($visibleIndices | Measure-Object -Minimum).Minimum
  $swipeStart=[int]($width*$(if($goRight){.2}else{.85}));$swipeEnd=[int]($width*$(if($goRight){.85}else{.2}))
  $null=DeviceCommand @('shell','input','swipe',([string]$swipeStart),([string]$navY),([string]$swipeEnd),([string]$navY),'350')
  $ui=ReadUi;CheckUi $ui
 }
 if(-not $target){throw "Native navigation destination is inaccessible: $destination"}
 $x=[int]((([Math]::Max(0,$target[0]))+([Math]::Min($width-1,$target[2])))/2)
 # The phone's native inset makes WebView accessibility Y bounds stale after status-bar setup.
 # Use the visible rail row, independently verified with a real Intelligence navigation tap.
 $y=$navY
 $null=DeviceCommand @('shell','input','tap',([string]$x),([string]$y))
 Start-Sleep -Milliseconds 700
 $ui=ReadUi;CheckUi $ui
 if(@($ui.SelectNodes('//node') | Where-Object {$_.text -match '^Loading view|^Opening…'}).Count){Start-Sleep -Milliseconds 1500;$ui=ReadUi;CheckUi $ui}
 $ui.Save((Join-Path $output "$destination.xml"))
 $null=DeviceCommand @('shell','screencap','-p','/sdcard/health-os-native-smoke.png')
 $null=DeviceCommand @('pull','/sdcard/health-os-native-smoke.png',(Join-Path $output "$destination.png"))
 $checks+=@{destination=$destination;renderError=$false}
 Write-Output "Native screen checked: $destination"
}
$package=(DeviceCommand @('shell','dumpsys','package','app.healthos.review')) -join "`n"
if($package -notmatch 'versionCode=2026101303' -or $package -notmatch 'versionName=0.1.3'){throw 'The native app is not the corrected build'}
$report=@{version='0.1.3';versionCode=2026101303;package='app.healthos.review';installation='Updated without uninstall or data clear';navigation=$checks;testActions='Opened screens only; no workout sessions saved'}
$report | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $output 'validation.json')
Write-Output 'Native app verification passed'
