param([Parameter(Mandatory=$true)][string]$Root)
$ErrorActionPreference='Stop'
if(Test-Path -LiteralPath "$Root/user-data"){throw 'QA directory already used'}
$qaListener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0);$qaListener.Start();$qaPort=$qaListener.LocalEndpoint.Port;$qaListener.Stop()
$env:EDITY_HEADLESS='1';$env:EDITY_VERIFY_BUILD='1';$env:EDITY_TEST_TIMELINE_DROP='1';$env:EDITY_TEST_COLOR_GRADING='0';$env:EDITY_TEST_TIMELINE_TRIM='0';$env:EDITY_AGENT_BRIDGE='1';$env:EDITY_AGENT_BRIDGE_DIRECTORY="$Root/instances";$env:EDITY_TEST_REPORT="$Root/report.json";$env:EDITY_TEST_PROJECTS="$Root/projects";$env:EDITY_TEST_USER_DATA="$Root/user-data";$env:EDITY_MEDIA_CACHE="$Root/cache";$env:EDITY_BACKEND_PORT="$qaPort";$env:EDITY_PYTHON='C:/Users/Martí/CutScript/.venv/Scripts/python.exe'
$qaExe=(Resolve-Path -LiteralPath 'dist/app/timeline-drop-v28/win-unpacked/Edity.exe').Path
$qaProcess=Start-Process -FilePath $qaExe -WindowStyle Hidden -PassThru -RedirectStandardOutput "$Root/stdout.log" -RedirectStandardError "$Root/stderr.log"
@{pid=$qaProcess.Id;root=$Root;port=$qaPort}|ConvertTo-Json -Compress
