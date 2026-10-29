param([Parameter(Mandatory=$true)][string]$Root,[switch]$Baseline)
$ErrorActionPreference='Stop'
if(Test-Path -LiteralPath "$Root/user-data"){throw 'QA user-data directory already exists'}
New-Item -ItemType Directory -Path $Root -Force | Out-Null
if(!(Test-Path -LiteralPath "$Root/base.mp4")){
 & ffmpeg -hide_banner -loglevel error -f lavfi -i 'color=red:size=640x360:rate=60:duration=3' -f lavfi -i 'color=cyan:size=640x360:rate=60:duration=7' -f lavfi -i 'sine=frequency=440:sample_rate=48000:duration=10' -filter_complex '[0:v][1:v]concat=n=2:v=1:a=0,drawgrid=width=80:height=60:thickness=4:color=white@0.7[v]' -map '[v]' -map 2:a -c:v libx264 -preset ultrafast -crf 18 -g 300 -pix_fmt yuv420p -c:a aac -shortest "$Root/base.mp4"
 if($LASTEXITCODE -ne 0){throw 'Could not create the isolated transition fixture'}
}
$listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0);$listener.Start();$port=$listener.LocalEndpoint.Port;$listener.Stop()
$env:EDITY_HEADLESS='1';$env:EDITY_VERIFY_BUILD='1';$env:EDITY_TEST_BASE_TRANSITIONS='1';$env:EDITY_TEST_TRANSITION_BASELINE=$(if($Baseline){'1'}else{'0'})
$env:EDITY_AGENT_BRIDGE='1';$env:EDITY_AGENT_BRIDGE_DIRECTORY="$Root/instances";$env:EDITY_TEST_REPORT="$Root/report.json";$env:EDITY_TEST_PROJECTS="$Root/projects";$env:EDITY_TEST_USER_DATA="$Root/user-data";$env:EDITY_MEDIA_CACHE="$Root/cache";$env:EDITY_BACKEND_PORT="$port";$env:EDITY_PYTHON=(Get-Command python).Source
$name=if($Baseline){'base-transition-baseline-v51'}else{'base-transitions-v52'}
$exe=(Resolve-Path -LiteralPath "$PSScriptRoot/../dist/app/$name/win-unpacked/Edity.exe").Path
$process=Start-Process -FilePath $exe -WindowStyle Hidden -PassThru -RedirectStandardOutput "$Root/stdout.log" -RedirectStandardError "$Root/stderr.log"
@{pid=$process.Id;root=$Root;port=$port}|ConvertTo-Json -Compress
