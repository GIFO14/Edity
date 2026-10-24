param([Parameter(Mandatory=$true)][string]$Root)
$ErrorActionPreference='Stop'
if(Test-Path -LiteralPath "$Root/user-data"){throw 'QA directory already used'}
New-Item -ItemType Directory -Path $Root -Force | Out-Null
ffmpeg -v error -y -f lavfi -i testsrc2=size=320x180:rate=30 -f lavfi -i anullsrc=r=48000:cl=stereo -t 18 -c:v libx264 -preset ultrafast -c:a aac "$Root/base.mp4"
ffmpeg -v error -y -f lavfi -i 'aevalsrc=0.1*sin(2*PI*480*t)|0.08*sin(2*PI*960*t):s=48000:d=18' -c:a pcm_s16le "$Root/music.wav"
$qaListener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0);$qaListener.Start();$qaPort=$qaListener.LocalEndpoint.Port;$qaListener.Stop()
$env:EDITY_HEADLESS='1';$env:EDITY_VERIFY_BUILD='1';$env:EDITY_TEST_MUSIC_STABILITY='1';$env:EDITY_AGENT_BRIDGE='1';$env:EDITY_AGENT_BRIDGE_DIRECTORY="$Root/instances";$env:EDITY_TEST_REPORT="$Root/report.json";$env:EDITY_TEST_PROJECTS="$Root/projects";$env:EDITY_TEST_USER_DATA="$Root/user-data";$env:EDITY_MEDIA_CACHE="$Root/cache";$env:EDITY_BACKEND_PORT="$qaPort";$env:EDITY_PYTHON=(Resolve-Path "$PSScriptRoot/../.venv/Scripts/python.exe").Path
$qaProcess=Start-Process -FilePath (Resolve-Path "$PSScriptRoot/../dist/app/music-stability-v47/win-unpacked/Edity.exe").Path -WindowStyle Hidden -PassThru -RedirectStandardOutput "$Root/stdout.log" -RedirectStandardError "$Root/stderr.log"
@{pid=$qaProcess.Id;root=$Root;port=$qaPort}|ConvertTo-Json -Compress
