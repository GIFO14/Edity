param([Parameter(Mandatory=$true)][string]$Root,[ValidateSet('cuts','workspace','scrub','wheel','trim')][string]$Mode='cuts',[string]$Executable='C:/Users/Martí/CutScript/dist/app/timeline-trim-v26/win-unpacked/Edity.exe')
$ErrorActionPreference='Stop'
if(Test-Path -LiteralPath $Root){throw 'QA directory exists'}
New-Item -ItemType Directory -Path $Root | Out-Null
Copy-Item -LiteralPath D:/Edity-media-verification/playback-v18-baseline-20261017/base.mp4 -Destination $Root
$qaListener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0);$qaListener.Start();$qaPort=$qaListener.LocalEndpoint.Port;$qaListener.Stop()
$env:EDITY_TEST_TIMELINE_TRIM=if($Mode -eq 'trim'){'1'}else{'0'}; $env:EDITY_TEST_TIMELINE_WHEEL=if($Mode -eq 'wheel'){'1'}else{'0'}; $env:EDITY_HEADLESS='1';$env:EDITY_VERIFY_BUILD='1';$env:EDITY_TEST_BASE_CUTS=if($Mode -eq 'cuts'){'1'}else{'0'};$env:EDITY_TEST_WORKSPACE_RECOVERY=if($Mode -eq 'workspace'){'1'}else{'0'};$env:EDITY_TEST_TIMELINE_SCRUB=if($Mode -eq 'scrub'){'1'}else{'0'}
$env:EDITY_TEST_REPORT="$Root/report.json";$env:EDITY_TEST_PROJECTS="$Root/projects";$env:EDITY_TEST_USER_DATA="$Root/user-data";$env:EDITY_MEDIA_CACHE="$Root/cache";$env:EDITY_AGENT_BRIDGE='0';$env:EDITY_BACKEND_PORT="$qaPort";$env:EDITY_PYTHON='C:/Users/Martí/CutScript/.venv/Scripts/python.exe'
$qaProcess=Start-Process -FilePath $Executable -WindowStyle Hidden -PassThru -RedirectStandardOutput "$Root/stdout.log" -RedirectStandardError "$Root/stderr.log"
@{pid=$qaProcess.Id;root=$Root;mode=$Mode}|ConvertTo-Json -Compress
