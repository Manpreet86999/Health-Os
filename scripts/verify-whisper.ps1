$ErrorActionPreference = 'Stop'
$whisperRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $whisperRoot
$whisperScratch = Join-Path $whisperRoot 'scratch/whisper-validation'
New-Item -ItemType Directory -Force -Path $whisperScratch | Out-Null
Add-Type -AssemblyName System.Speech
$whisperSynth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$whisperWav = Join-Path $whisperScratch 'speech.wav'
try {
  $whisperFormat = [System.Speech.AudioFormat.SpeechAudioFormatInfo]::new(48000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
  $whisperSynth.SetOutputToWaveFile($whisperWav, $whisperFormat)
  $whisperSynth.Speak('I drank three hundred and fifty milliliters of water. My weight today is eighty kilograms.')
} finally { $whisperSynth.Dispose() }
$env:TSX_TSCONFIG_PATH = 'tsconfig.server.json'
$env:BODY_OS_DATA_DIR = Join-Path $whisperScratch 'data'
$env:BODY_OS_BACKUP_DIR = Join-Path $whisperScratch 'backups'
& node --import tsx scripts/verify-whisper.ts $whisperWav
if ($LASTEXITCODE -ne 0) { throw 'Local Whisper speech verification failed.' }
Write-Host 'To verify the native browser flow too, set BODY_OS_WHISPER_TEST_WAV to the generated WAV and run tests/e2e/whisper-local.spec.ts with Playwright.'
