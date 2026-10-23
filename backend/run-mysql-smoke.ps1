# Prompts locally for the database password and runs only the MySQL smoke test.
# Works in Windows PowerShell 5.1 and PowerShell 7.
$ErrorActionPreference = 'Stop'
$mysqlSmokeMaven = Join-Path $PSScriptRoot '.tools\apache-maven-3.9.9\bin\mvn.cmd'
if (-not (Test-Path -LiteralPath $mysqlSmokeMaven)) {
    throw "Maven was not found at $mysqlSmokeMaven"
}

$mysqlSmokeSecurePassword = Read-Host 'Enter the working jalachaya MySQL password' -AsSecureString
$mysqlSmokeBstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($mysqlSmokeSecurePassword)
try {
    $env:DB_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($mysqlSmokeBstr)
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($mysqlSmokeBstr)
}
if ([string]::IsNullOrEmpty($env:DB_PASSWORD)) {
    throw 'No password was entered. The MySQL smoke test was not started.'
}

$env:DB_URL = 'jdbc:mysql://localhost:3306/jalachaya?sslMode=REQUIRED&serverTimezone=UTC'
$env:DB_USERNAME = 'jalachaya'
$env:RUN_MYSQL_TEST = 'true'

Push-Location $PSScriptRoot
try {
    Write-Host 'MySQL password configured for this test. Starting Maven...'
    & $mysqlSmokeMaven '-o' '-Dmaven.repo.local=.tools\maven-repository' '-Dtest=MySqlSmokeIntegrationTest' 'test'
    if ($LASTEXITCODE -ne 0) {
        throw "MySQL smoke test failed with Maven exit code $LASTEXITCODE."
    }
} finally {
    Pop-Location
    Remove-Item Env:DB_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:RUN_MYSQL_TEST -ErrorAction SilentlyContinue
}
