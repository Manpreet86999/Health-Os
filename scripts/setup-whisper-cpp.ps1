$ErrorActionPreference = 'Stop'
$cppRoot = Join-Path (Split-Path -Parent $PSScriptRoot) 'runtime/whisper-cpp'
New-Item -ItemType Directory -Force -Path $cppRoot | Out-Null
$cppZip = Join-Path $cppRoot 'whisper-v1.8.5.zip'
& node (Join-Path $PSScriptRoot 'download-runtime.mjs') 'https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.5/whisper-bin-x64.zip' $cppZip '2a0e85915d0ff9e2a1d1b45b19973f05fbcdfb51d3af03557454acf6ccaa5e8a'
if ($LASTEXITCODE -ne 0) { throw 'Whisper archive download failed.' }
if ((Get-FileHash -LiteralPath $cppZip -Algorithm SHA256).Hash.ToLowerInvariant() -ne '2a0e85915d0ff9e2a1d1b45b19973f05fbcdfb51d3af03557454acf6ccaa5e8a') { throw 'Whisper archive checksum mismatch.' }
Expand-Archive -LiteralPath $cppZip -DestinationPath $cppRoot -Force
$cppModel = Join-Path $cppRoot 'ggml-tiny.bin'
& node (Join-Path $PSScriptRoot 'download-runtime.mjs') 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin' $cppModel 'be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21'
if ($LASTEXITCODE -ne 0) { throw 'Whisper model download failed.' }
if ((Get-FileHash -LiteralPath $cppModel -Algorithm SHA256).Hash.ToLowerInvariant() -ne 'be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21') { throw 'Whisper model checksum mismatch.' }
$cppCli = Get-ChildItem -LiteralPath $cppRoot -Filter 'whisper-cli.exe' -Recurse | Select-Object -First 1
if (!$cppCli) { throw 'Whisper CLI was not found in the official archive.' }
if ($cppCli.DirectoryName -ne $cppRoot) { Get-ChildItem -LiteralPath $cppCli.DirectoryName -File | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $cppRoot -Force } }
& (Join-Path $cppRoot 'whisper-cli.exe') --help
if ($LASTEXITCODE -ne 0) { throw 'Whisper CLI failed its runtime check.' }
Write-Output 'Local whisper.cpp v1.8.5 and multilingual tiny model verified. Start your personal worker to use voice.'
