param([string]$Url = 'http://localhost:10000')
$ErrorActionPreference = 'Stop'
$address = [Uri]$Url
if ($address.Scheme -ne 'http' -or $address.Host -notin @('localhost','127.0.0.1') -or $address.Port -ne 10000) {
  throw 'Health Os only opens its local app address.'
}
$default = (Get-ItemProperty -LiteralPath 'HKCU:\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice' -ErrorAction SilentlyContinue).ProgId
$edgePaths = @(
  (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
  (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe'),
  (Join-Path $env:LOCALAPPDATA 'Microsoft\Edge\Application\msedge.exe')
)
$chromePaths = @(
  (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
  (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
  (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')
)
$browser = $null
if ($default -like 'MSEdge*') { $browser = $edgePaths | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1 }
elseif ($default -like 'Chrome*') { $browser = $chromePaths | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1 }
elseif (!$default) { $browser = $edgePaths + $chromePaths | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1 }
if ($browser) {
  # Explicitly create a visible app window, using the browser's existing profile.
  # Do not inherit the hidden console's window style through the URL handler.
  $process = Start-Process -FilePath $browser -ArgumentList @('--app=' + $Url) -WindowStyle Normal -PassThru -ErrorAction Stop
  Write-Output ('Health Os app window requested: ' + [IO.Path]::GetFileName($browser) + ' PID ' + $process.Id)
} else {
  # Other registered browsers keep their default handling and existing profile.
  Start-Process -FilePath $Url -WindowStyle Normal -ErrorAction Stop
  Write-Output 'Health Os opened using the default browser.'
}
