$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'local-tools.ps1')
$env:DB_PASSWORD = Get-LocalDatabasePassword
$env:DB_URL = 'jdbc:mysql://127.0.0.1:3306/jalachaya?sslMode=REQUIRED&serverTimezone=UTC'
$env:MYSQL_CLIENT_PATH = Get-MySqlTool 'mysql.exe'
$env:MYSQL_SMOKE_UPLOAD_DIR = Join-Path $PSScriptRoot 'backend\uploads'
$wasRunning = Test-Path -LiteralPath (Join-Path $PSScriptRoot '.runtime\processes.json')
if ($wasRunning) { & (Join-Path $PSScriptRoot 'stop-jalachaya.ps1') }
try {
    & python (Join-Path $PSScriptRoot 'ai-service\integration_smoke.py') --mysql --browser
    if ($LASTEXITCODE -ne 0) { throw 'Full MySQL workflow failed. See the error above.' }
} finally {
    Remove-Item Env:DB_PASSWORD -ErrorAction SilentlyContinue
    if ($wasRunning) { & (Join-Path $PSScriptRoot 'start-jalachaya.ps1') -NoBrowser }
}
