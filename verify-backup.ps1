param([string]$BackupFolder)
$ErrorActionPreference = 'Stop'
if (-not $BackupFolder) {
    $latest = Get-ChildItem -Path (Join-Path $PSScriptRoot '.runtime\backups\*\COMPLETE.json') -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
    if (-not $latest) { throw 'No completed backup found.' }
    $BackupFolder = $latest.DirectoryName
}
$folder = (Resolve-Path -LiteralPath $BackupFolder).Path.TrimEnd('\')
$manifest = Get-Content -LiteralPath (Join-Path $folder 'COMPLETE.json') -Raw | ConvertFrom-Json
if ($manifest.database -ne 'jalachaya' -or -not $manifest.files.Count) { throw 'Invalid backup manifest.' }
foreach ($file in $manifest.files) {
    $path = [IO.Path]::GetFullPath((Join-Path $folder $file.path))
    if (-not $path.StartsWith($folder + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Backup manifest contains an unsafe path.' }
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing backup file: $($file.path)" }
    if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -ne $file.sha256) { throw "Checksum mismatch: $($file.path)" }
}
Write-Host "Verified $($manifest.files.Count) backup files: $folder"
