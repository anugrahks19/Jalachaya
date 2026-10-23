param(
    [switch]$ResetCredentials,
    [switch]$TestMode,
    [switch]$NoBrowser,
    [switch]$SkipBackup,
    [ValidateRange(1, 65535)][int]$BackendPort = 8080,
    [ValidateRange(1, 65535)][int]$AiPort = 8000,
    [ValidateRange(1, 65535)][int]$FrontendPort = 5500
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$runtime = Join-Path $root '.runtime'
$backend = Join-Path $root 'backend'
$aiDir = Join-Path $root 'ai-service'
$credentialsFile = Join-Path $runtime 'credentials.json'
$processFile = Join-Path $runtime 'processes.json'
$siteUrl = "http://127.0.0.1:$FrontendPort/index.html"
$backendUrl = "http://127.0.0.1:$BackendPort"
$aiUrl = "http://127.0.0.1:$AiPort"
New-Item -ItemType Directory -Path $runtime -Force | Out-Null
. (Join-Path $root 'launcher-processes.ps1')

function Get-Plain([Security.SecureString]$secure) {
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

function New-PrivateSecret {
    $bytes = New-Object byte[] 48
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return [Convert]::ToBase64String($bytes)
}

function Wait-Health([string]$url, [int]$seconds) {
    $until = (Get-Date).AddSeconds($seconds)
    while ((Get-Date) -lt $until) {
        try {
            $response = Invoke-RestMethod -Uri $url -TimeoutSec 2
            if ($response.status -eq 'UP') { return }
        } catch { }
        Start-Sleep -Milliseconds 600
    }
    throw "Service did not become healthy: $url"
}

function Port-InUse([int]$port) {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $attempt = $client.BeginConnect('127.0.0.1', $port, $null, $null)
        if (-not $attempt.AsyncWaitHandle.WaitOne(300)) { return $false }
        try { $client.EndConnect($attempt); return $true } catch { return $false }
    } finally { $client.Close() }
}

function Save-ProcessRecord([string]$name, $process) {
    return @{ name = $name; id = $process.Id; startedAt = $process.StartTime.ToUniversalTime().ToString('o') }
}

function Save-LaunchSession {
    $temporary = Join-Path $runtime 'processes.pending.json'
    @{ processes = @($script:started); testMode = [bool]$TestMode;
        startedAt = $script:launchStartedAt; state = $script:launchState } |
        ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $temporary -Encoding UTF8
    Move-Item -LiteralPath $temporary -Destination $processFile -Force
}

$launchLock = $null
try {
    $launchLock = [IO.File]::Open((Join-Path $runtime 'launcher.lock'), [IO.FileMode]::OpenOrCreate,
        [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
} catch {
    Write-Host 'Jalachaya is already starting in another window. Wait for that launch to finish.'
    return
}

try {

if (Test-Path -LiteralPath $processFile) {
    if ((Port-InUse $FrontendPort) -and (Port-InUse $BackendPort) -and (Port-InUse $AiPort)) {
        for ($check = 0; $check -lt 2; $check++) {
            try {
                $existing = Get-Content -LiteralPath $processFile -Raw | ConvertFrom-Json
                $ownedFrontend = @($existing.processes | Where-Object { $_.name -eq 'frontend' } | ForEach-Object { Get-JalachayaOwnedProcess $_ })
                $ownedAi = @($existing.processes | Where-Object { $_.name -eq 'ai' } | ForEach-Object { Get-JalachayaOwnedProcess $_ })
                $ownedJava = Get-JalachayaJavaRecord $runtime
                $frontend = Invoke-WebRequest -Uri $siteUrl -UseBasicParsing -TimeoutSec 5
                $java = Invoke-RestMethod -Uri "$backendUrl/api/health" -TimeoutSec 5
                $ai = Invoke-RestMethod -Uri "$aiUrl/health" -TimeoutSec 15
                if ($ownedFrontend.Count -gt 0 -and $ownedAi.Count -gt 0 -and $ownedJava -and $frontend.StatusCode -eq 200 -and $java.status -eq 'UP' -and $ai.status -eq 'UP') {
                    Write-Host 'Jalachaya is already running. Opening the frontend.'
                    if (-not $NoBrowser) { try { Start-Process $siteUrl } catch { Write-Warning "Open $siteUrl manually." } }
                    return
                }
            } catch { }
        }
    }
    Write-Host 'Recovering the previous launcher session and starting Jalachaya again...'
    Stop-JalachayaSession $runtime
}

foreach ($port in @($AiPort, $BackendPort, $FrontendPort)) {
    if (Port-InUse $port) {
        throw "Port $port is already in use. Stop the existing service before starting Jalachaya."
    }
}

$python = (Get-Command python -ErrorAction Stop).Source
& $python -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)'
if ($LASTEXITCODE -ne 0) { throw 'Python 3.11 or newer is required.' }
if (-not $TestMode -and $BackendPort -ne 8080) {
    throw 'The frontend is configured for backend port 8080. Alternate backend ports are reserved for launcher tests.'
}
$javaCommand = (Get-Command java -ErrorAction Stop).Source
$javaVersion = & $javaCommand --version | Select-Object -First 1
if ($javaVersion -notmatch '^(openjdk|java) (17|1[89]|[2-9][0-9])\.') {
    throw "Java 17 or newer is required. Found: $javaVersion"
}
$maven = Join-Path $backend '.tools\apache-maven-3.9.9\bin\mvn.cmd'
if (-not (Test-Path -LiteralPath $maven)) {
    $maven = (Get-Command mvn.cmd -ErrorAction Stop).Source
}

if ($TestMode) {
    $dbPassword = ''
    $officerPassword = New-PrivateSecret
    $workerPassword = New-PrivateSecret
    $jwtSecret = New-PrivateSecret
    $dbUrl = 'jdbc:h2:mem:launcher_smoke;MODE=MySQL;DB_CLOSE_DELAY=-1'
    $officerEmail = 'officer@launcher.invalid'
    $workerEmail = 'worker@launcher.invalid'
} else {
    if ($ResetCredentials -and (Test-Path -LiteralPath $credentialsFile)) {
        Remove-Item -LiteralPath $credentialsFile -Force
    }
    $newCredentials = -not (Test-Path -LiteralPath $credentialsFile)
    if ($newCredentials) {
        Write-Host 'First run: enter the existing MySQL app password and choose private officer/worker passwords.'
        Write-Host 'They will be encrypted for this Windows account under .runtime.'
        $dbSecure = Read-Host 'jalachaya MySQL password' -AsSecureString
        $officerSecure = Read-Host 'Officer password (12+ characters)' -AsSecureString
        $workerSecure = Read-Host 'Worker password (12+ characters)' -AsSecureString
        $dbPassword = Get-Plain $dbSecure
        $officerPassword = Get-Plain $officerSecure
        $workerPassword = Get-Plain $workerSecure
        $jwtSecret = New-PrivateSecret
        if (-not $dbPassword -or $officerPassword.Length -lt 12 -or $workerPassword.Length -lt 12) {
            throw 'MySQL password is required; officer and worker passwords must have at least 12 characters.'
        }
    } else {
        $saved = Get-Content -LiteralPath $credentialsFile -Raw | ConvertFrom-Json
        $dbPassword = Get-Plain (ConvertTo-SecureString $saved.dbPassword)
        $officerPassword = Get-Plain (ConvertTo-SecureString $saved.officerPassword)
        $workerPassword = Get-Plain (ConvertTo-SecureString $saved.workerPassword)
        $jwtSecret = Get-Plain (ConvertTo-SecureString $saved.jwtSecret)
    }
    $dbUrl = 'jdbc:mysql://127.0.0.1:3306/jalachaya?sslMode=REQUIRED&serverTimezone=UTC'
    $officerEmail = 'officer@example.com'
    $workerEmail = 'worker@example.com'

    $mysqlService = Get-Service -Name 'MySQL*' -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $mysqlService) { throw 'MySQL service was not found. Install or start MySQL before launching Jalachaya.' }
    if ($mysqlService.Status -ne 'Running') {
        try { Start-Service -Name $mysqlService.Name }
        catch { throw "Could not start $($mysqlService.Name). Run the launcher as administrator once or start MySQL manually." }
        Start-Sleep -Seconds 2
    }
    $mysqlClient = Get-ChildItem 'C:\Program Files\MySQL' -Filter mysql.exe -Recurse -ErrorAction SilentlyContinue |
        Select-Object -First 1 -ExpandProperty FullName
    if (-not $mysqlClient) { $mysqlClient = (Get-Command mysql.exe -ErrorAction Stop).Source }
    $env:MYSQL_PWD = $dbPassword
    try {
        $mysqlResult = & $mysqlClient -h 127.0.0.1 -u jalachaya --ssl-mode=REQUIRED -D jalachaya -N -e 'SELECT 1;' 2>&1
        if ($LASTEXITCODE -ne 0 -or $mysqlResult -notcontains '1') {
            throw 'MySQL login failed. Check the saved password using start-jalachaya.ps1 -ResetCredentials.'
        }
    } finally { Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue }
    if ($newCredentials) {
        @{
            dbPassword = $dbSecure | ConvertFrom-SecureString
            officerPassword = $officerSecure | ConvertFrom-SecureString
            workerPassword = $workerSecure | ConvertFrom-SecureString
            jwtSecret = (ConvertTo-SecureString $jwtSecret -AsPlainText -Force | ConvertFrom-SecureString)
        } | ConvertTo-Json | Set-Content -LiteralPath $credentialsFile -Encoding UTF8
    }
    if (-not $SkipBackup) {
        $latestBackup = Get-ChildItem -Path (Join-Path $runtime 'backups\*\COMPLETE.json') -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
        if (-not $latestBackup -or $latestBackup.LastWriteTime.Date -ne (Get-Date).Date) {
            . (Join-Path $root 'local-tools.ps1')
            $hasSchema = [int](Invoke-LocalSql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'jalachaya' AND table_name = 'flyway_schema_history';" $dbPassword)
            if ($hasSchema -gt 0) {
                Write-Host 'Creating the first backup of the day before startup...'
                & (Join-Path $root 'backup-jalachaya.ps1') -KeepStopped
            }
        }
    }
}

Write-Host 'Checking Python dependencies and pretrained model...'
& $python -c 'import fastapi, uvicorn, cv2, PIL, ultralytics, requests, psutil'
if ($LASTEXITCODE -ne 0) {
    & $python -m pip install -r (Join-Path $aiDir 'requirements.txt')
    if ($LASTEXITCODE -ne 0) { throw 'Python dependency installation failed.' }
}
& $python (Join-Path $aiDir 'setup_model.py')
if ($LASTEXITCODE -ne 0) { Write-Warning 'Pretrained model was unavailable; visual comparison will still work.' }

$started = @()
$launchStartedAt = (Get-Date).ToUniversalTime().ToString('o')
$launchState = 'starting'
try {
    $env:AI_BACKEND_URL = $backendUrl
    $aiProcess = Start-Process -FilePath $python -ArgumentList @('-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', "$AiPort") `
        -WorkingDirectory $aiDir -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $runtime 'ai.out.log') -RedirectStandardError (Join-Path $runtime 'ai.err.log')
    $started += Save-ProcessRecord 'ai' $aiProcess
    Save-LaunchSession
    Wait-Health "$aiUrl/health" 45

    $env:JAVA_TOOL_OPTIONS = "-Duser.home=$env:USERPROFILE"
    $env:DB_URL = $dbUrl
    $env:DB_USERNAME = if ($TestMode) { 'sa' } else { 'jalachaya' }
    $env:DB_PASSWORD = $dbPassword
    $env:JWT_SECRET = $jwtSecret
    $env:BOOTSTRAP_OFFICER_EMAIL = $officerEmail
    $env:BOOTSTRAP_OFFICER_PASSWORD = $officerPassword
    $env:BOOTSTRAP_WORKER_EMAIL = $workerEmail
    $env:BOOTSTRAP_WORKER_PASSWORD = $workerPassword
    $env:AI_ENABLED = 'true'
    $env:ENABLE_JUDGE_DEMO = if ($TestMode) { 'false' } else { 'true' }
    $env:DEMO_SAMPLES_DIR = Join-Path $root 'assets\samples'
    $env:AI_SERVICE_URL = $aiUrl
    $env:AI_TIMEOUT_MS = '15000'
    $env:FRONTEND_ORIGINS = "http://127.0.0.1:$FrontendPort,http://localhost:$FrontendPort"
    $env:PORT = "$BackendPort"
    if ($TestMode) { $env:UPLOAD_DIR = (Join-Path $runtime 'test-uploads') }
    $mavenProcess = Start-Process -FilePath $maven -ArgumentList @('-Dmaven.repo.local=.tools\maven-repository', 'spring-boot:run') `
        -WorkingDirectory $backend -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $runtime 'java.out.log') -RedirectStandardError (Join-Path $runtime 'java.err.log')
    $started += Save-ProcessRecord 'maven' $mavenProcess
    Save-LaunchSession
    Wait-Health "$backendUrl/api/health" 120
    $javaRecord = Get-JalachayaJavaRecord $runtime
    if ($javaRecord) { $started += $javaRecord; Save-LaunchSession }

    $frontendProcess = Start-Process -FilePath $python -ArgumentList @(('"' + (Join-Path $root 'serve_frontend.py') + '"'), '--port', "$FrontendPort") `
        -WorkingDirectory $root -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $runtime 'frontend.out.log') -RedirectStandardError (Join-Path $runtime 'frontend.err.log')
    $started += Save-ProcessRecord 'frontend' $frontendProcess
    Save-LaunchSession
    $until = (Get-Date).AddSeconds(20)
    $ready = $false
    while ((Get-Date) -lt $until) {
        try {
            $response = Invoke-WebRequest -Uri $siteUrl -UseBasicParsing -TimeoutSec 2
            if ($response.StatusCode -eq 200) { $ready = $true; break }
        } catch { }
        Start-Sleep -Milliseconds 500
    }
    if (-not $ready) { throw "Frontend did not become ready on port $FrontendPort." }

    $launchState = 'running'
    Save-LaunchSession
    Write-Host "Jalachaya is running. Java: $backendUrl/api/health | AI: $aiUrl/health"
    Write-Host 'MySQL schema migrations run automatically when Java starts. Logs are in .runtime.'
    if (-not $NoBrowser) { try { Start-Process $siteUrl } catch { Write-Warning "Open $siteUrl manually." } }
} catch {
    Stop-JalachayaSession $runtime
    throw
} finally {
    foreach ($name in @('DB_PASSWORD', 'JWT_SECRET', 'BOOTSTRAP_OFFICER_PASSWORD', 'BOOTSTRAP_WORKER_PASSWORD', 'MYSQL_PWD')) {
        Remove-Item "Env:$name" -ErrorAction SilentlyContinue
    }
}
} finally {
    if ($launchLock) { $launchLock.Dispose() }
}
