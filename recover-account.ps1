param([string]$Email, [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'local-tools.ps1')
if (-not $Email) { $Email = Read-Host 'Email of the account to recover' }
if ($Email.Length -gt 255 -or $Email -notmatch '^[^\s@]+@[^\s@]+\.[^\s@]+$') { throw 'Enter a valid account email.' }
$password = Get-LocalDatabasePassword
$emailBytes = [Text.Encoding]::UTF8.GetBytes($Email.Trim().ToLowerInvariant())
$emailHex = ([BitConverter]::ToString($emailBytes)).Replace('-', '')
$bytes = New-Object byte[] 32
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
$token = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
$sha = [Security.Cryptography.SHA256]::Create()
try { $hash = ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($token)))).Replace('-', '').ToLowerInvariant() }
finally { $sha.Dispose() }
try {
    $emailSql = "CONVERT(0x$emailHex USING utf8mb4) COLLATE utf8mb4_unicode_ci"
    $sql = "START TRANSACTION; SELECT id FROM app_users WHERE email = $emailSql AND active = TRUE FOR UPDATE; " +
        "DELETE FROM password_reset_tokens WHERE user_id IN (SELECT id FROM app_users WHERE email = $emailSql); " +
        "INSERT INTO password_reset_tokens (token_hash, user_id, expires_at, created_at) " +
        "SELECT '$hash', id, DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 30 MINUTE), UTC_TIMESTAMP(6) FROM app_users WHERE email = $emailSql AND active = TRUE; " +
        'SELECT ROW_COUNT(); COMMIT;'
    $result = @(Invoke-LocalSql $sql $password)
    if ($result.Count -eq 0 -or $result[-1].ToString().Trim() -ne '1') { throw 'No active account was found for that email.' }
    $url = "http://127.0.0.1:5500/reset-password.html#token=$token"
    Write-Host 'One-time reset link created. It expires in 30 minutes and revokes old logins after use.'
    if ($NoBrowser) { Write-Host $url } else { Start-Process $url }
} finally { $password = $null; $token = $null }
