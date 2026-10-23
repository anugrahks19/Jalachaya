param([switch]$Live)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
. (Join-Path $root 'launcher-processes.ps1')
function Assert-True($value, [string]$message) { if (-not $value) { throw $message } }
$testDirectory = Join-Path $root ('.runtime\launcher-regression-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testDirectory | Out-Null
$child = Start-Process -FilePath (Get-Command python).Source -ArgumentList @('-c', '"import time; time.sleep(60)"') -WindowStyle Hidden -PassThru
$record = @{ name = 'frontend'; id = $child.Id; startedAt = $child.StartTime.ToUniversalTime().ToString('o') }
$file = Join-Path $testDirectory 'processes.json'
try {
    Assert-True (Get-JalachayaOwnedProcess $record) 'Fresh process record did not match its own process.'
    $stale = @{ name = 'frontend'; id = $child.Id; startedAt = $child.StartTime.ToUniversalTime().AddDays(-1).ToString('o') }
    @{ processes = @($stale) } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $file
    Stop-JalachayaSession $testDirectory
    Assert-True (Get-Process -Id $child.Id -ErrorAction SilentlyContinue) 'Stale PID record stopped an unrelated process.'
    Write-Host 'PASS: stale or reused PIDs are not stopped'
    @{ processes = @($record) } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $file
    Stop-JalachayaSession $testDirectory
    Assert-True (-not (Get-Process -Id $child.Id -ErrorAction SilentlyContinue)) 'Owned process was not stopped.'
    '{broken-json' | Set-Content -LiteralPath $file
    Stop-JalachayaSession $testDirectory
    Assert-True (-not (Test-Path -LiteralPath $file)) 'Unreadable session record was not cleared.'
    Write-Host 'PASS: owned processes stop and unreadable session records are cleared'
} finally {
    if (Get-JalachayaOwnedProcess $record) { Stop-Process -Id $child.Id -Force }
    if (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file -Force }
    Remove-Item -LiteralPath $testDirectory
}

if ($Live) {
    $sessionFile = Join-Path $root '.runtime\processes.json'
    $before = Get-Content -LiteralPath $sessionFile -Raw
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'start-jalachaya.ps1') -NoBrowser
    Assert-True ($LASTEXITCODE -eq 0) 'Repeated start failed.'
    Assert-True ((Get-Content -LiteralPath $sessionFile -Raw) -eq $before) 'Repeated start replaced the healthy session.'
    Write-Host 'PASS: repeated launch reuses healthy services'

    $session = $before | ConvertFrom-Json
    $frontend = @($session.processes | Where-Object { $_.name -eq 'frontend' })[0]
    $owned = Get-JalachayaOwnedProcess $frontend
    Assert-True $owned 'No owned frontend process available for interrupted-service test.'
    Stop-Process -Id $owned.Id -Force
    $owned.WaitForExit(10000) | Out-Null
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'start-jalachaya.ps1') -NoBrowser
    Assert-True ($LASTEXITCODE -eq 0) 'Automatic recovery failed.'
    foreach ($url in @('http://127.0.0.1:8080/api/health','http://127.0.0.1:8000/health')) {
        Assert-True ((Invoke-RestMethod $url -TimeoutSec 15).status -eq 'UP') "Service was not healthy: $url"
    }
    Assert-True ((Invoke-WebRequest 'http://127.0.0.1:5500/login.html' -UseBasicParsing -TimeoutSec 5).StatusCode -eq 200) 'Frontend did not recover.'
    Write-Host 'PASS: a stopped frontend is repaired by the next launch; all services are healthy'
}
