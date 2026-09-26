$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop 'Edity.lnk'
$application = @(
    (Join-Path $projectRoot 'dist\app\win-unpacked\Edity.exe'),
    (Join-Path $projectRoot 'dist\smooth-playback\win-unpacked\Edity.exe')
) | Where-Object { Test-Path -LiteralPath $_ } |
    Sort-Object { (Get-Item -LiteralPath $_).LastWriteTimeUtc } -Descending |
    Select-Object -First 1
if (-not $application) {
    throw 'Edity.exe was not found. Run npm run build before creating the shortcut.'
}
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $application
$shortcut.Arguments = ''
$shortcut.WorkingDirectory = Split-Path -Parent $application
$shortcut.Description = 'Open Edity'
$shortcut.IconLocation = $application
$shortcut.Save()
Write-Output $shortcutPath
