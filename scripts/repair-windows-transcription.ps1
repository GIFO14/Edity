param([string]$Python = 'python')
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'This repair is for Windows NVIDIA installations.' }
$root = Split-Path -Parent $PSScriptRoot
$probe = 'import json,sys; print(json.dumps(dict(executable=sys.executable,venv=sys.prefix!=sys.base_prefix)))' | & $Python -
if ($LASTEXITCODE -ne 0) { throw 'Cannot run the selected Edity Python interpreter.' }
$runtime = $probe | ConvertFrom-Json
$pipArgs = @('-m','pip','install','--disable-pip-version-check')
if (-not $runtime.venv) { $pipArgs += '--user' }
& $runtime.executable @pipArgs 'torch==2.5.1' 'torchaudio==2.5.1' '--index-url' 'https://download.pytorch.org/whl/cu124'
if ($LASTEXITCODE -ne 0) { throw 'CUDA PyTorch installation failed.' }
& $runtime.executable @pipArgs '-r' "$root/backend/requirements-windows-transcription.txt" '-c' "$root/backend/constraints-windows-transcription.txt"
if ($LASTEXITCODE -ne 0) { throw 'Transcription/alignment dependency repair failed.' }
'import torch,whisperx; from crisperwhisper import CrisperWhisperModel; print("Transcription and alignment imports OK"); print("GPU:",torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU")' | & $runtime.executable -
if ($LASTEXITCODE -ne 0) { throw 'The repaired runtime did not pass its import check.' }
