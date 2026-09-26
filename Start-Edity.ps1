$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$application = @(
    (Join-Path $projectRoot 'dist\cut-boundaries\win-unpacked\Edity.exe'),
    (Join-Path $projectRoot 'dist\app\win-unpacked\Edity.exe'),
    (Join-Path $projectRoot 'dist\smooth-playback\win-unpacked\Edity.exe')
) | Where-Object { Test-Path -LiteralPath $_ } |
    Sort-Object { (Get-Item -LiteralPath $_).LastWriteTimeUtc } -Descending |
    Select-Object -First 1
$pythonCommand = Join-Path $projectRoot '.venv\Scripts\python.exe'

if (-not (Test-Path -LiteralPath $application) -or -not (Test-Path -LiteralPath $pythonCommand)) {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show('Edity.exe or its Python environment is missing. Build the app and check .venv.', 'Edity') | Out-Null
    exit 1
}

$env:EDITY_PYTHON = $pythonCommand
Start-Process -FilePath $application -WorkingDirectory (Split-Path -Parent $application) | Out-Null
