param([string]$BackupFolder)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'local-tools.ps1')
if (-not $BackupFolder) { $BackupFolder = Read-Host 'Full path to the backup folder containing COMPLETE.json' }
& (Join-Path $PSScriptRoot 'verify-backup.ps1') -BackupFolder $BackupFolder
$folder = (Resolve-Path -LiteralPath $BackupFolder).Path
$manifest = Get-Content -LiteralPath (Join-Path $folder 'COMPLETE.json') -Raw | ConvertFrom-Json
$password = Get-LocalDatabasePassword
$current = (Invoke-LocalSql 'SELECT version FROM flyway_schema_history WHERE success = TRUE ORDER BY installed_rank DESC LIMIT 1;' $password).ToString().Trim()
if ($current -ne $manifest.schemaVersion) { throw 'Restore requires matching schema versions. Use a matching backend version before restoring this snapshot.' }
if ((Read-Host 'This replaces local Jalachaya data. Type RESTORE to continue') -cne 'RESTORE') { Write-Host 'Restore cancelled.'; return }
$safety = & (Join-Path $PSScriptRoot 'backup-jalachaya.ps1') -KeepStopped -PassThru
$oldEncoding = $OutputEncoding
try {
    $env:MYSQL_PWD = $password
    $OutputEncoding = New-Object Text.UTF8Encoding $false
    $client = Get-MySqlTool 'mysql.exe'
    Get-Content -LiteralPath (Join-Path $folder 'database.sql') -Encoding UTF8 |
        & $client -h 127.0.0.1 -u jalachaya --ssl-mode=REQUIRED --default-character-set=utf8mb4 -D jalachaya
    if ($LASTEXITCODE -ne 0) { throw "Database restore failed. Safety snapshot: $safety" }
    $root = [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\')
    $uploads = [IO.Path]::GetFullPath((Join-Path $root 'backend\uploads'))
    $archive = [IO.Path]::GetFullPath((Join-Path $root ('.runtime\pre-restore-uploads-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))))
    if (-not $uploads.StartsWith($root + '\') -or -not $archive.StartsWith($root + '\')) { throw 'Unsafe restore path.' }
    if (Test-Path -LiteralPath $uploads) { Move-Item -LiteralPath $uploads -Destination $archive }
    $savedUploads = Join-Path $folder 'uploads'
    if (Test-Path -LiteralPath $savedUploads) { Copy-Item -LiteralPath $savedUploads -Destination $uploads -Recurse }
    Write-Host "Restore completed. Safety snapshot: $safety"
    Write-Host 'Double-click start-jalachaya.cmd to start the restored application.'
} finally {
    $OutputEncoding = $oldEncoding
    Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue
    $password = $null
}
