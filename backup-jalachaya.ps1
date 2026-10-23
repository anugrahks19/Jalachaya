param([switch]$KeepStopped, [switch]$PassThru)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'local-tools.ps1')
$root = $PSScriptRoot
$wasRunning = Test-Path -LiteralPath (Join-Path $root '.runtime\processes.json')
if ($wasRunning) { & (Join-Path $root 'stop-jalachaya.ps1') }
$client = New-Object Net.Sockets.TcpClient
try {
    try { $client.Connect('127.0.0.1', 8080); $busy = $true } catch { $busy = $false }
} finally { $client.Close() }
if ($busy) { throw 'A backend is still running on port 8080. Stop it before taking a consistent database and upload backup.' }
$password = Get-LocalDatabasePassword
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$destination = Join-Path $root ".runtime\backups\$stamp"
New-Item -ItemType Directory -Path $destination -Force | Out-Null
try {
    $dump = Get-MySqlTool 'mysqldump.exe'
    $schemaVersion = (Invoke-LocalSql 'SELECT version FROM flyway_schema_history WHERE success = TRUE ORDER BY installed_rank DESC LIMIT 1;' $password).ToString().Trim()
    $tableCount = [int](Invoke-LocalSql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'jalachaya' AND table_type = 'BASE TABLE';" $password)
    $tables = @(Invoke-LocalSql "SELECT table_name FROM information_schema.tables WHERE table_schema = 'jalachaya' AND table_type = 'BASE TABLE' ORDER BY table_name;" $password)
    foreach ($table in $tables) { if ($table -notmatch '^[a-zA-Z0-9_]+$') { throw 'Unexpected table name in backup.' } }
    $countSql = (($tables | ForEach-Object { "SELECT CONCAT('$_', ':', COUNT(*)) FROM $_" }) -join ' UNION ALL ') + ';'
    $rowCounts = [ordered]@{}
    foreach ($line in @(Invoke-LocalSql $countSql $password)) {
        $pair = $line.ToString().Split(':'); $rowCounts[$pair[0]] = [long]$pair[1]
    }
    $extra = @()
    if ((& $dump --help | Out-String) -match '--masking-policies') { $extra += '--skip-masking-policies' }
    $env:MYSQL_PWD = $password
    & $dump -h 127.0.0.1 -u jalachaya --ssl-mode=REQUIRED --single-transaction --no-tablespaces --set-gtid-purged=OFF `
        @extra --result-file="$destination\database.sql" jalachaya 2> "$destination\mysqldump.err.log"
    if ($LASTEXITCODE -ne 0) { throw 'Database backup failed. Incomplete folder has no COMPLETE.json marker.' }
    $dumpErrors = Get-Content -LiteralPath (Join-Path $destination 'mysqldump.err.log') -Raw
    $tablesSaved = @(Select-String -LiteralPath (Join-Path $destination 'database.sql') -Pattern '^CREATE TABLE ').Count
    $footer = Get-Content -LiteralPath (Join-Path $destination 'database.sql') -Tail 5 | Out-String
    if ($dumpErrors -match '(?i)error:' -or $tablesSaved -ne $tableCount -or $footer -notmatch 'Dump completed') {
        throw 'Backup verification failed: check the dump error log, table count and completion footer. No COMPLETE.json marker was written.'
    }
    $uploads = Join-Path $root 'backend\uploads'
    if (Test-Path -LiteralPath $uploads) { Copy-Item -LiteralPath $uploads -Destination (Join-Path $destination 'uploads') -Recurse }
    $files = @(Get-ChildItem -LiteralPath $destination -File -Recurse | ForEach-Object {
        @{ path = $_.FullName.Substring($destination.Length + 1); sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash }
    })
    @{ database = 'jalachaya'; schemaVersion = $schemaVersion; tableCount = $tableCount; rowCounts = $rowCounts; createdAt = (Get-Date).ToUniversalTime().ToString('o'); files = $files } |
        ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $destination 'COMPLETE.json') -Encoding UTF8
    Write-Host "Backup completed and checksummed: $destination"
    Write-Host 'Keep a private copy on another drive. Launcher credentials are not included.'
    if ($PassThru) { Write-Output $destination }
} finally {
    Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue
    $password = $null
    if ($wasRunning -and -not $KeepStopped) { & (Join-Path $root 'start-jalachaya.ps1') -NoBrowser -SkipBackup }
}
