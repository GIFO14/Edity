param([Parameter(Mandatory=$true)][string]$Root,[string]$Executable='',[ValidateSet('Benchmark','Color')][string]$Mode='Benchmark',[int]$Seconds=8)
$ErrorActionPreference='Stop'
if(Test-Path -LiteralPath $Root){throw 'QA directory already exists'}
New-Item -ItemType Directory -Path $Root | Out-Null
if($Mode -eq 'Benchmark'){Copy-Item -LiteralPath 'D:/Edity-media-verification/export-v40-snapshot.json' -Destination "$Root/snapshot.json"}
else{foreach($qaFile in @('base.mp4','logo.png')){Copy-Item -LiteralPath "D:/Edity-media-verification/color-presets-v33-20261019/$qaFile" -Destination $Root}}
if(!$Executable){$Executable=(Resolve-Path -LiteralPath "$PSScriptRoot/../dist/app/export-performance-v40/win-unpacked/Edity.exe").Path}
$qaListener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0);$qaListener.Start();$qaPort=$qaListener.LocalEndpoint.Port;$qaListener.Stop()
foreach($qaFlag in @('EXPORT_PERFORMANCE','WORKSPACE_REOPEN','WORKSPACE_RECOVERY','SEEK_RECOVERY','TIMELINE_WIDTH','MEDIA_INSPECTOR','VIEWER_TEXT','COLOR_PRESETS','TIMELINE_WORKSPACE','MUSIC_FIDELITY','TIMELINE_DROP','COLOR_GRADING','TIMELINE_SCRUB','PLAYBACK_UI','NARRATION')){[Environment]::SetEnvironmentVariable("EDITY_TEST_$qaFlag",'0','Process')}
$env:EDITY_TEST_EXPORT_PERFORMANCE=if($Mode -eq 'Benchmark'){'1'}else{'0'};$env:EDITY_TEST_COLOR_GRADING=if($Mode -eq 'Color'){'1'}else{'0'};$env:EDITY_TEST_COLOR_RENDER_ONLY='1';$env:EDITY_TEST_BENCH_SECONDS="$Seconds"
$env:EDITY_TEST_SOURCE_DIRECTORY=Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Edity/Projects/agent-bc3ca7128faea25c5ab5bc23a21c2e62'
$env:EDITY_HEADLESS='1';$env:EDITY_VERIFY_BUILD='1';$env:EDITY_AGENT_BRIDGE='1';$env:EDITY_AGENT_BRIDGE_DIRECTORY="$Root/instances";$env:EDITY_TEST_REPORT="$Root/report.json";$env:EDITY_TEST_PROJECTS="$Root/projects";$env:EDITY_TEST_USER_DATA="$Root/user-data";$env:EDITY_MEDIA_CACHE="$Root/cache";$env:EDITY_BACKEND_PORT="$qaPort"
$env:EDITY_PYTHON=(Resolve-Path -LiteralPath "$PSScriptRoot/../.venv/Scripts/python.exe").Path
$qaProcess=Start-Process -FilePath $Executable -WindowStyle Hidden -PassThru -RedirectStandardOutput "$Root/stdout.log" -RedirectStandardError "$Root/stderr.log"
@{pid=$qaProcess.Id;root=$Root;port=$qaPort}|ConvertTo-Json -Compress
