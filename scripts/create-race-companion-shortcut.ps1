param(
    [string]$ShortcutPath = (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Race Companion.lnk'),
    [string]$IconPath = ''
)

$launcher = Join-Path $PSScriptRoot 'start-race-companion.cmd'
if (-not (Test-Path -LiteralPath $launcher)) {
    throw "Launcher not found: $launcher"
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($ShortcutPath)
$shortcut.TargetPath = $launcher
$shortcut.WorkingDirectory = Split-Path -Parent $launcher
$shortcut.Description = 'Start DeskHub Race Companion'
$shortcut.WindowStyle = 1

if ($IconPath -and (Test-Path -LiteralPath $IconPath)) {
    $shortcut.IconLocation = $IconPath
} else {
    $shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,137"
}

$shortcut.Save()
Write-Host "Shortcut created: $ShortcutPath"
