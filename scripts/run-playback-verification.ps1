param([Parameter(Mandatory=$true)][string]$Root,[switch]$Baseline,[string]$RealDocument='',[switch]$Narration,[switch]$Intro,[string]$Executable='C:/Users/Martí/CutScript/dist/app/export-gpu-v43/win-unpacked/Edity.exe')

$ErrorActionPreference='Stop'

if(Test-Path -LiteralPath $Root){throw 'QA directory already exists'}

New-Item -ItemType Directory -Path $Root | Out-Null

if($Narration){foreach($qaName in @('base.mp4','magenta.png')){Copy-Item -LiteralPath "D:/Edity-media-verification/narration-v17-parent-qa5/$qaName" -Destination $Root}}

else{foreach($qaName in @('base.mp4','broll.mp4')){Copy-Item -LiteralPath "D:/Edity-media-verification/playback-v18-baseline-20261017/$qaName" -Destination $Root}}

$qaListener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0)

$qaListener.Start();$qaPort=$qaListener.LocalEndpoint.Port;$qaListener.Stop()

$env:EDITY_HEADLESS='1';$env:EDITY_VERIFY_BUILD='1';$env:EDITY_TEST_PLAYBACK_UI=if($Narration){'0'}else{'1'}

$env:EDITY_TEST_NARRATION=if($Narration){'1'}else{'0'}

$env:EDITY_TEST_BASELINE=if($Baseline){'1'}else{'0'}

$env:EDITY_TEST_REAL_DOCUMENT=$RealDocument

$env:EDITY_TEST_INTRO=if($Intro){'1'}else{'0'}

$env:EDITY_TEST_REPORT="$Root/report.json";$env:EDITY_TEST_PROJECTS="$Root/projects";$env:EDITY_TEST_USER_DATA="$Root/user-data"

$env:EDITY_MEDIA_CACHE="$Root/cache";$env:EDITY_AGENT_BRIDGE=if($Narration){'1'}else{'0'};$env:EDITY_BACKEND_PORT="$qaPort"

$env:EDITY_AGENT_BRIDGE_DIRECTORY="$Root/instances"

$env:EDITY_PYTHON='C:/Users/Martí/CutScript/.venv/Scripts/python.exe'

$qaProcess=Start-Process -FilePath $Executable -WindowStyle Hidden -PassThru -RedirectStandardOutput "$Root/stdout.log" -RedirectStandardError "$Root/stderr.log"

@{pid=$qaProcess.Id;root=$Root;port=$qaPort}|ConvertTo-Json -Compress

