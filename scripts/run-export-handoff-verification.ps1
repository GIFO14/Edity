param([Parameter(Mandatory=$true)][string]$Root,[ValidateSet('Resolve','Recovery')][string]$Mode='Resolve',[string]$SnapshotPath='',[string]$CacheDirectory='')
$ErrorActionPreference='Stop'
if(Test-Path -LiteralPath "$Root/user-data"){throw 'Choose a new private QA directory'}
New-Item -ItemType Directory -Path $Root -Force | Out-Null
if($Mode -eq 'Recovery'){
 if(!$SnapshotPath){throw 'Recovery needs the frozen authorized export snapshot'}
 Copy-Item -LiteralPath $SnapshotPath -Destination "$Root/snapshot.json"
 Copy-Item -LiteralPath "$PSScriptRoot/../tests/fixtures/composition/base.mp4" -Destination "$Root/base.mp4"
}else{
 if(!(Test-Path -LiteralPath "$Root/base.mp4")){
  & ffmpeg -hide_banner -loglevel error -f lavfi -i 'color=red:size=640x360:rate=60:duration=3' -f lavfi -i 'color=cyan:size=640x360:rate=60:duration=7' -f lavfi -i 'sine=frequency=440:sample_rate=48000:duration=10' -filter_complex '[0:v][1:v]concat=n=2:v=1:a=0,drawgrid=width=80:height=60:thickness=4:color=white@0.7[v]' -map '[v]' -map 2:a -c:v libx264 -preset ultrafast -crf 18 -g 300 -pix_fmt yuv420p -c:a aac -shortest "$Root/base.mp4"
  if($LASTEXITCODE -ne 0){throw 'Fixture video failed'}
 }
 Copy-Item -LiteralPath "$Root/base.mp4" -Destination "$Root/insert.mp4"
 & ffmpeg -hide_banner -loglevel error -y -f lavfi -i 'sine=frequency=880:sample_rate=48000:duration=10' -c:a pcm_s16le "$Root/music.wav"
 if($LASTEXITCODE -ne 0){throw 'Fixture audio failed'}
 & ffmpeg -hide_banner -loglevel error -y -f lavfi -i 'color=yellow:size=160x120' -frames:v 1 -update 1 "$Root/image.png"
 if($LASTEXITCODE -ne 0){throw 'Fixture image failed'}
}
$taskListener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0);$taskListener.Start();$taskPort=$taskListener.LocalEndpoint.Port;$taskListener.Stop()
$env:EDITY_HEADLESS='1';$env:EDITY_VERIFY_BUILD='1';$env:EDITY_TEST_EXPORT_RECOVERY=$(if($Mode -eq 'Recovery'){'1'}else{'0'});$env:EDITY_TEST_RESOLVE_HANDOFF=$(if($Mode -eq 'Resolve'){'1'}else{'0'})
$env:EDITY_AGENT_BRIDGE='1';$env:EDITY_AGENT_BRIDGE_DIRECTORY="$Root/instances";$env:EDITY_TEST_REPORT="$Root/report.json";$env:EDITY_TEST_PROJECTS="$Root/projects";$env:EDITY_TEST_USER_DATA="$Root/user-data";$env:EDITY_MEDIA_CACHE=$(if($CacheDirectory){$CacheDirectory}else{"$Root/cache"});$env:EDITY_BACKEND_PORT="$taskPort";$env:EDITY_PYTHON=(Get-Command python).Source
$taskProcess=Start-Process -FilePath (Resolve-Path "$PSScriptRoot/../dist/app/resolve-handoff-v55/win-unpacked/Edity.exe").Path -WindowStyle Hidden -PassThru -RedirectStandardOutput "$Root/stdout.log" -RedirectStandardError "$Root/stderr.log"
@{pid=$taskProcess.Id;port=$taskPort;root=$Root}|ConvertTo-Json -Compress
