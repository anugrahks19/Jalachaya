$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'local-tools.ps1')
$env:DB_PASSWORD = Get-LocalDatabasePassword
$env:MYSQL_CLIENT_PATH = Get-MySqlTool 'mysql.exe'
try {
    & python (Join-Path $PSScriptRoot 'verify-local.py')
    if ($LASTEXITCODE -ne 0) { throw 'Local verification failed. See the error above.' }
} finally { Remove-Item Env:DB_PASSWORD -ErrorAction SilentlyContinue }
