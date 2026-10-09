param([string]$Python = 'python', [ValidateSet('tiny','base','small')][string]$Model = 'base')
$ErrorActionPreference = 'Stop'
$whisperRoot = Split-Path -Parent $PSScriptRoot
$whisperRuntime = Join-Path $whisperRoot 'runtime/whisper'
$whisperEnv = Join-Path $whisperRuntime '.venv'
$whisperExe = Join-Path $whisperEnv 'Scripts/python.exe'
New-Item -ItemType Directory -Force -Path $whisperRuntime | Out-Null
if (!(Test-Path -LiteralPath $whisperExe)) {
  & $Python -m venv $whisperEnv
  if ($LASTEXITCODE -ne 0) { throw 'Install Python 3.10 or newer, or pass -Python with its executable path.' }
}
& $whisperExe -m pip install --only-binary=:all: -r (Join-Path $PSScriptRoot 'whisper-requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'Whisper dependency installation failed.' }
$env:HF_HOME = Join-Path $whisperRuntime 'cache'
$env:HF_HUB_DISABLE_TELEMETRY = '1'
$env:HF_HUB_DISABLE_SYMLINKS_WARNING = '1'
$env:BODY_OS_WHISPER_DOWNLOAD_MODEL = $Model
$env:BODY_OS_WHISPER_DOWNLOAD_DIR = Join-Path $whisperRuntime "models/$Model"
& $whisperExe -c "import os,sys; dirs=[os.add_dll_directory(p) for p in (sys.prefix,os.path.join(sys.prefix,'DLLs'),os.path.join(sys.prefix,'Scripts')) if os.path.isdir(p)]; from faster_whisper import download_model, WhisperModel; p=download_model(os.environ['BODY_OS_WHISPER_DOWNLOAD_MODEL'],output_dir=os.environ['BODY_OS_WHISPER_DOWNLOAD_DIR']); WhisperModel(p,device='cpu',compute_type='int8',local_files_only=True); print('Local Whisper model verified: '+p)"
if ($LASTEXITCODE -ne 0) { throw 'Whisper model download or load failed. Rerun setup to resume.' }
Write-Host "Ready. Default model is base. For another installed model set BODY_OS_WHISPER_MODEL=$Model before starting Health OS."
