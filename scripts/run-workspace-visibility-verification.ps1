param([Parameter(Mandatory=$true)][string]$Root,[string]$Executable='',[string]$RealDocument='',[switch]$Baseline)
$ErrorActionPreference='Stop'
if(Test-Path -LiteralPath $Root){throw 'QA directory already exists'}
New-Item -ItemType Directory -Path $Root | Out-Null
Copy-Item -LiteralPath 'D:/Edity-media-verification/viewer-text-v34-delivery-20261019/base.mp4' -Destination $Root
if(!$Executable){$Executable=(Resolve-Path -LiteralPath "$PSScriptRoot/../dist/app/workspace-visibility-v41/win-unpacked/Edity.exe").Path}
$qaListener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0);$qaListener.Start();$qaPort=$qaListener.LocalEndpoint.Port;$qaListener.Stop()
foreach($qaFlag in @('WORKSPACE_VISIBILITY','EXPORT_PERFORMANCE','WORKSPACE_REOPEN','WORKSPACE_RECOVERY','SEEK_RECOVERY','TIMELINE_WIDTH','MEDIA_INSPECTOR','VIEWER_TEXT','COLOR_PRESETS','TIMELINE_WORKSPACE','MUSIC_FIDELITY','TIMELINE_DROP','COLOR_GRADING','TIMELINE_SCRUB','PLAYBACK_UI','NARRATION')){[Environment]::SetEnvironmentVariable("EDITY_TEST_$qaFlag",'0','Process')}
$env:EDITY_TEST_WORKSPACE_VISIBILITY='1';$env:EDITY_TEST_BASELINE=if($Baseline){'1'}else{'0'}
$env:EDITY_HEADLESS='1';$env:EDITY_VERIFY_BUILD='1';$env:EDITY_TEST_REAL_DOCUMENT=$RealDocument;$env:EDITY_AGENT_BRIDGE='1';$env:EDITY_AGENT_BRIDGE_DIRECTORY="$Root/instances";$env:EDITY_TEST_REPORT="$Root/report.json";$env:EDITY_TEST_PROJECTS="$Root/projects";$env:EDITY_TEST_USER_DATA="$Root/user-data";$env:EDITY_MEDIA_CACHE="$Root/cache";$env:EDITY_BACKEND_PORT="$qaPort"
$env:EDITY_PYTHON=(Resolve-Path -LiteralPath "$PSScriptRoot/../.venv/Scripts/python.exe").Path
$qaProcess=Start-Process -FilePath $Executable -WindowStyle Hidden -PassThru -RedirectStandardOutput "$Root/stdout.log" -RedirectStandardError "$Root/stderr.log"
@{pid=$qaProcess.Id;root=$Root;port=$qaPort}|ConvertTo-Json -Compress
