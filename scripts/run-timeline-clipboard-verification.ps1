param([Parameter(Mandatory=$true)][string]$Root)
$ErrorActionPreference='Stop'
if(Test-Path -LiteralPath "$Root/user-data"){throw 'QA user-data directory already exists'}
$listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0);$listener.Start();$port=$listener.LocalEndpoint.Port;$listener.Stop()
$env:EDITY_HEADLESS='1';$env:EDITY_VERIFY_BUILD='1';$env:EDITY_TEST_TIMELINE_CLIPBOARD='1'
$env:EDITY_AGENT_BRIDGE='1';$env:EDITY_AGENT_BRIDGE_DIRECTORY="$Root/instances";$env:EDITY_TEST_REPORT="$Root/report.json"
$env:EDITY_TEST_PROJECTS="$Root/projects";$env:EDITY_TEST_USER_DATA="$Root/user-data";$env:EDITY_MEDIA_CACHE="$Root/cache";$env:EDITY_BACKEND_PORT="$port"
$env:EDITY_PYTHON=(Get-Command python).Source
$exe=(Resolve-Path -LiteralPath "$PSScriptRoot/../dist/app/timeline-clipboard-v51/win-unpacked/Edity.exe").Path
$process=Start-Process -FilePath $exe -WindowStyle Hidden -PassThru -RedirectStandardOutput "$Root/stdout.log" -RedirectStandardError "$Root/stderr.log"
@{pid=$process.Id;root=$Root;port=$port}|ConvertTo-Json -Compress
