param([Parameter(Mandatory=$true)][string]$Root)
$ErrorActionPreference='Stop'
if(Test-Path -LiteralPath "$Root/user-data"){throw 'QA directory already used'}
New-Item -ItemType Directory -Path $Root -Force | Out-Null
foreach($name in @('screen-1080p30.mp4','native-60.mp4')){Copy-Item -LiteralPath "D:/Edity-media-verification/interpolation-v48/$name" -Destination "$Root/$name"}
$qaListener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0);$qaListener.Start();$qaPort=$qaListener.LocalEndpoint.Port;$qaListener.Stop()
$env:EDITY_TEST_EXPECT_GPU='1';$env:EDITY_INTERPOLATION_ENGINE='gpu';$env:EDITY_HEADLESS='1';$env:EDITY_VERIFY_BUILD='1';$env:EDITY_TEST_NATIVE_PAINT='1';$env:EDITY_TEST_INTERPOLATION='1';$env:EDITY_AGENT_BRIDGE='1';$env:EDITY_AGENT_BRIDGE_DIRECTORY="$Root/instances";$env:EDITY_TEST_REPORT="$Root/report.json";$env:EDITY_TEST_PROJECTS="$Root/projects";$env:EDITY_TEST_USER_DATA="$Root/user-data";$env:EDITY_MEDIA_CACHE="$Root/cache";$env:EDITY_BACKEND_PORT="$qaPort";$env:EDITY_PYTHON=(Resolve-Path "$PSScriptRoot/../.venv/Scripts/python.exe").Path
$qaProcess=Start-Process -FilePath (Resolve-Path "$PSScriptRoot/../dist/app/interpolation-gpu-v49/win-unpacked/Edity.exe").Path -WindowStyle Hidden -PassThru -RedirectStandardOutput "$Root/stdout.log" -RedirectStandardError "$Root/stderr.log"
@{pid=$qaProcess.Id;root=$Root;port=$qaPort}|ConvertTo-Json -Compress
