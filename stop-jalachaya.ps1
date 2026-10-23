$ErrorActionPreference = 'Stop'
$runtime = Join-Path $PSScriptRoot '.runtime'
. (Join-Path $PSScriptRoot 'launcher-processes.ps1')
Stop-JalachayaSession $runtime
Write-Host 'Jalachaya launcher services stopped. MySQL remains running.'
