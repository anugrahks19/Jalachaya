# Match both PID and exact creation time. Windows can reuse PIDs after a reboot.
function Get-JalachayaOwnedProcess($record) {
    if (-not $record -or -not $record.id -or -not $record.startedAt) { return $null }
    $process = Get-Process -Id ([int]$record.id) -ErrorAction SilentlyContinue
    if (-not $process) { return $null }
    try {
        $expected = [datetimeoffset]::Parse($record.startedAt).UtcDateTime
        if ($process.StartTime.ToUniversalTime().Ticks -ne $expected.Ticks) { return $null }
        $allowed = switch ($record.name) {
            'ai' { '^python(w)?$' }
            'frontend' { '^python(w)?$' }
            'maven' { '^cmd$' }
            'java' { '^java(w)?$' }
            default { '^$' }
        }
        if ($process.ProcessName -notmatch $allowed) { return $null }
        return $process
    } catch { return $null }
}

function Get-JalachayaJavaRecord([string]$runtimeDirectory) {
    $logFile = Join-Path $runtimeDirectory 'java.out.log'
    if (-not (Test-Path -LiteralPath $logFile)) { return $null }
    $content = Get-Content -LiteralPath $logFile -Raw
    if (-not $content) { return $null }
    $entries = [regex]::Matches($content, '(?m)^(?<at>\d{4}-\d{2}-\d{2}T\S+)\s+INFO\s+(?<processId>\d+)\s+---.*?JalachayaApplication\s*:\s*Starting\b')
    if ($entries.Count -eq 0) { return $null }
    $entry = $entries[$entries.Count - 1]
    $process = Get-Process -Id ([int]$entry.Groups['processId'].Value) -ErrorAction SilentlyContinue
    if (-not $process -or $process.ProcessName -notmatch '^java(w)?$') { return $null }
    try {
        $logged = [datetimeoffset]::Parse($entry.Groups['at'].Value).UtcDateTime
        $created = $process.StartTime.ToUniversalTime()
        $seconds = ($logged - $created).TotalSeconds
        if ($seconds -lt -1 -or $seconds -gt 60) { return $null }
        return @{ name = 'java'; id = $process.Id; startedAt = $created.ToString('o') }
    } catch { return $null }
}

function Stop-JalachayaSession([string]$runtimeDirectory) {
    $sessionFile = Join-Path $runtimeDirectory 'processes.json'
    $records = @()
    if (Test-Path -LiteralPath $sessionFile) {
        try {
            $session = Get-Content -LiteralPath $sessionFile -Raw | ConvertFrom-Json
            $records = @($session.processes)
        } catch { Write-Host 'Discarding an unreadable launcher session record.' }
    }
    $javaRecord = Get-JalachayaJavaRecord $runtimeDirectory
    if ($javaRecord) { $records = @($javaRecord) + $records }
    foreach ($record in $records) {
        $process = Get-JalachayaOwnedProcess $record
        if (-not $process) { continue }
        try {
            Stop-Process -Id $process.Id -Force -ErrorAction Stop
            $process.WaitForExit(10000) | Out-Null
            Write-Host "Stopped $($record.name) ($($record.id))"
        } catch {
            if (Get-JalachayaOwnedProcess $record) { throw "Could not stop the previous $($record.name) process. Close it and start again." }
        }
    }
    if (Test-Path -LiteralPath $sessionFile) { Remove-Item -LiteralPath $sessionFile -Force }
}
