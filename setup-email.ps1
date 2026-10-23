param([switch]$NoRestart)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
. (Join-Path $root 'local-tools.ps1')
function Get-MailPlain([Security.SecureString]$secret) {
    $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}
Write-Host 'Gmail sender setup. First enable Google 2-Step Verification and create an app password for Jalachaya.'
Write-Host 'Enter the app password here only; do not paste it into chat or commit it to Git.'
$sender = (Read-Host 'Gmail address to send alerts FROM').Trim()
if ($sender -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') { throw 'Enter a valid sender email address.' }
$secure = Read-Host 'Google app password (hidden)' -AsSecureString
$plain = (Get-MailPlain $secure) -replace '\s', ''
if ($plain.Length -ne 16) { throw 'Gmail app passwords have 16 characters. Use an app password, not your normal Google password.' }
$encrypted = ConvertFrom-SecureString (ConvertTo-SecureString $plain -AsPlainText -Force)
$plain = $null
$runtime = Join-Path $root '.runtime'
New-Item -ItemType Directory -Force -Path $runtime | Out-Null
@{ host='smtp.gmail.com'; port=587; username=$sender; from=$sender; password=$encrypted } |
    ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runtime 'mail-settings.json') -Encoding UTF8
Write-Host 'Mail settings saved with a Windows-user-encrypted app password.'
if ($NoRestart) { Write-Host 'Restart Jalachaya to load the settings, then use Send test email in the officer overview.'; return }
& (Join-Path $root 'stop-jalachaya.ps1')
& (Join-Path $root 'start-jalachaya.ps1') -NoBrowser -SkipBackup
Write-Host 'Jalachaya restarted. Log in as a real Panchayat officer, open Overview, and click Send test email.'
Write-Host 'Check the configured recipient inbox and spam folder. The dashboard distinguishes pending, retry, and sent-to-server status.'
