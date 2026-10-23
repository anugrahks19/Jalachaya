# Shared private MySQL access for local maintenance commands.
function Get-LocalDatabasePassword {
    $file = Join-Path $PSScriptRoot '.runtime\credentials.json'
    if (Test-Path -LiteralPath $file) {
        $settings = Get-Content -LiteralPath $file -Raw | ConvertFrom-Json
        $secure = ConvertTo-SecureString $settings.dbPassword
    } else {
        $secure = Read-Host 'Enter the jalachaya MySQL password' -AsSecureString
    }
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

function Get-MySqlTool([string]$name) {
    $found = Get-ChildItem 'C:\Program Files\MySQL' -Filter $name -Recurse -ErrorAction SilentlyContinue |
        Select-Object -First 1 -ExpandProperty FullName
    if ($found) { return $found }
    return (Get-Command $name -ErrorAction Stop).Source
}

function Invoke-LocalSql([string]$sql, [string]$password) {
    $client = Get-MySqlTool 'mysql.exe'
    $env:MYSQL_PWD = $password
    try {
        $result = $sql | & $client -h 127.0.0.1 -u jalachaya --ssl-mode=REQUIRED -D jalachaya -N -B
        if ($LASTEXITCODE -ne 0) { throw 'MySQL maintenance command failed. Check the database login and schema migrations.' }
        return $result
    } finally { Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue }
}
