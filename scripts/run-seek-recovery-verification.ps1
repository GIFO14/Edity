param([Parameter(Mandatory=$true)][string]$Root,[ValidateSet('Seek','Scrub','Color','Intro')][string]$Mode='Seek',[switch]$Baseline,[string]$RealDocument='', [string]$Executable='')
$ErrorActionPreference='Stop'
if(Test-Path -LiteralPath "$Root/user-data"){throw 'QA directory already used'}
New-Item -ItemType Directory -Path $Root -Force | Out-Null
if(!$Executable){$Executable=(Resolve-Path -LiteralPath "$PSScriptRoot/../dist/app/seek-recovery-v38/win-unpacked/Edity.exe").Path}
if($Mode -eq 'Scrub'){foreach($qaName in @('base.mp4','music.wav')){Copy-Item -LiteralPath "D:/Edity-media-verification/viewer-text-v34-delivery-20261019/$qaName" -Destination $Root}}
if($Mode -eq 'Color'){foreach($qaName in @('base.mp4','logo.png')){Copy-Item -LiteralPath "D:/Edity-media-verification/color-presets-v33-20261019/$qaName" -Destination $Root}}
$qaListener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0);$qaListener.Start();$qaPort=$qaListener.LocalEndpoint.Port;$qaListener.Stop()
foreach($qaFlag in @('SEEK_RECOVERY','TIMELINE_WIDTH','MEDIA_INSPECTOR','VIEWER_TEXT','COLOR_PRESETS','TIMELINE_WORKSPACE','MUSIC_FIDELITY','TIMELINE_DROP','COLOR_GRADING','TIMELINE_SCRUB','PLAYBACK_UI','NARRATION')){[Environment]::SetEnvironmentVariable("EDITY_TEST_$qaFlag",'0','Process')}
$env:EDITY_HEADLESS='1';$env:EDITY_VERIFY_BUILD='1';$env:EDITY_TEST_BASELINE=if($Baseline){'1'}else{'0'}
$env:EDITY_TEST_SEEK_RECOVERY=if($Mode -eq 'Seek'){'1'}else{'0'};$env:EDITY_TEST_TIMELINE_SCRUB=if($Mode -eq 'Scrub'){'1'}else{'0'};$env:EDITY_TEST_COLOR_GRADING=if($Mode -eq 'Color'){'1'}else{'0'};$env:EDITY_TEST_PLAYBACK_UI=if($Mode -eq 'Intro'){'1'}else{'0'};$env:EDITY_TEST_INTRO=if($Mode -eq 'Intro'){'1'}else{'0'}
$env:EDITY_TEST_COLOR_RENDER_ONLY='1';$env:EDITY_TEST_REAL_DOCUMENT=$RealDocument;$env:EDITY_TEST_REFERENCE_MEDIA='1';$env:EDITY_AGENT_BRIDGE='1';$env:EDITY_AGENT_BRIDGE_DIRECTORY="$Root/instances";$env:EDITY_TEST_REPORT="$Root/report.json";$env:EDITY_TEST_PROJECTS="$Root/projects";$env:EDITY_TEST_USER_DATA="$Root/user-data";$env:EDITY_MEDIA_CACHE="$Root/cache";$env:EDITY_BACKEND_PORT="$qaPort"
$env:EDITY_PYTHON=(Resolve-Path -LiteralPath "$PSScriptRoot/../.venv/Scripts/python.exe").Path
$qaProcess=Start-Process -FilePath $Executable -WindowStyle Hidden -PassThru -RedirectStandardOutput "$Root/stdout.log" -RedirectStandardError "$Root/stderr.log"
@{pid=$qaProcess.Id;root=$Root;port=$qaPort}|ConvertTo-Json -Compress
