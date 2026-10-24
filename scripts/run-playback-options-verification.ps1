param([Parameter(Mandatory=$true)][string]$Root)
$ErrorActionPreference='Stop'
if(Test-Path -LiteralPath $Root){throw 'QA directory already exists'}
New-Item -ItemType Directory -Path $Root | Out-Null
Copy-Item -LiteralPath 'D:/Edity-media-verification/playback-options-v46/base.mp4' -Destination "$Root/base.mp4"
$qaListener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0);$qaListener.Start();$qaPort=$qaListener.LocalEndpoint.Port;$qaListener.Stop()
$env:EDITY_HEADLESS='1';$env:EDITY_VERIFY_BUILD='1';$env:EDITY_TEST_NATIVE_PAINT='1';$env:EDITY_TEST_PLAYBACK_OPTIONS='1';$env:EDITY_AGENT_BRIDGE='1';$env:EDITY_AGENT_BRIDGE_DIRECTORY="$Root/instances";$env:EDITY_TEST_REPORT="$Root/report.json";$env:EDITY_TEST_PROJECTS="$Root/projects";$env:EDITY_TEST_USER_DATA="$Root/user-data";$env:EDITY_MEDIA_CACHE="$Root/cache";$env:EDITY_BACKEND_PORT="$qaPort";$env:EDITY_PYTHON=(Resolve-Path "$PSScriptRoot/../.venv/Scripts/python.exe").Path
$qaProcess=Start-Process -FilePath (Resolve-Path "$PSScriptRoot/../dist/app/playback-options-v46/win-unpacked/Edity.exe").Path -WindowStyle Hidden -PassThru -RedirectStandardOutput "$Root/stdout.log" -RedirectStandardError "$Root/stderr.log"
@{pid=$qaProcess.Id;root=$Root;port=$qaPort}|ConvertTo-Json -Compress
