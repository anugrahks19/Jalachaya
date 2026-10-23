param([switch]$Watch)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
function Read-LocalHealth {
    $states = [ordered]@{}
    try { $java = Invoke-RestMethod 'http://127.0.0.1:8080/api/health' -TimeoutSec 5; $states.backend = $java.status; $states.database = $java.database }
    catch { $states.backend = 'DOWN'; $states.database = 'UNKNOWN' }
    try { $ai = Invoke-RestMethod 'http://127.0.0.1:8000/health' -TimeoutSec 15; $states.aiService = $ai.status; $states.litterModel = if ($ai.pretrainedLitterModel) { 'LOADED' } else { 'VISUAL_ONLY' } }
    catch { $states.aiService = 'DOWN'; $states.litterModel = 'UNKNOWN' }
    try { $page = Invoke-WebRequest 'http://127.0.0.1:5500/login.html' -UseBasicParsing -TimeoutSec 5; $states.frontend = if ($page.StatusCode -eq 200) { 'UP' } else { 'DOWN' } }
    catch { $states.frontend = 'DOWN' }
    $backupRoot = Join-Path $root '.runtime\backups'
    $last = Get-ChildItem -Path "$backupRoot\*\COMPLETE.json" -ErrorAction SilentlyContinue | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
    $states.latestBackupUtc = if ($last) { $last.LastWriteTimeUtc.ToString('o') } else { 'NONE' }
    return $states
}
$previous = ''
do {
    $state = Read-LocalHealth
    $json = $state | ConvertTo-Json
    if ($json -ne $previous) { Write-Host $json; $previous = $json }
    New-Item -ItemType Directory -Path (Join-Path $root '.runtime') -Force | Out-Null
    $json | Set-Content -LiteralPath (Join-Path $root '.runtime\health.json') -Encoding UTF8
    if ($Watch) { Start-Sleep -Seconds 30 }
} while ($Watch)
if ($state.backend -ne 'UP' -or $state.database -ne 'UP' -or $state.aiService -ne 'UP' -or $state.frontend -ne 'UP') { exit 1 }
