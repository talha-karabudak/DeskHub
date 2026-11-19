$ErrorActionPreference = 'Stop'
$repoDir = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path -LiteralPath (Join-Path $repoDir 'config.json'))) {
    Write-Host '[Pixoo] config.json missing; iPad continues without Pixoo.'
    exit 0
}
try {
    $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8765/health' -TimeoutSec 1
    if ($null -ne $health.connected -and $null -ne $health.serial_port) {
        Write-Host '[Pixoo] Bridge is already running.'
        exit 0
    }
} catch {}
$pythonPath = Join-Path $repoDir '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $pythonPath)) {
    $pythonPath = (Get-Command python.exe -ErrorAction Stop).Source
}
$logDir = Join-Path $repoDir 'data'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$bridgeProcess = Start-Process -FilePath $pythonPath -ArgumentList '-u', 'bridge.py' `
    -WorkingDirectory $repoDir -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $logDir 'bridge.log') `
    -RedirectStandardError (Join-Path $logDir 'bridge-error.log')
Write-Host "[Pixoo] Bridge started in background (PID $($bridgeProcess.Id)); Pixoo may be switched on later."
