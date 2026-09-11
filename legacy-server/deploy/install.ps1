$ErrorActionPreference = 'Stop'
$root = 'C:\Suixing'
foreach ($folder in 'data','backups','logs') {
    New-Item -ItemType Directory -Force -Path (Join-Path $root $folder) | Out-Null
}
if (!(Test-Path -LiteralPath "$root\data\trips.sqlite")) {
    if (!(Test-Path -LiteralPath "$root\migration\trips.sqlite")) { throw 'Migration database missing' }
    Copy-Item -LiteralPath "$root\migration\trips.sqlite" -Destination "$root\data\trips.sqlite"
}
# The website runs without administrator privileges. Only data and logs are writable.
& icacls.exe $root /grant '*S-1-5-19:(OI)(CI)RX' | Out-Null
foreach ($folder in 'data','backups','logs') {
    & icacls.exe (Join-Path $root $folder) /grant '*S-1-5-19:(OI)(CI)M' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Unable to configure folder permissions' }
}
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File C:\Suixing\app\deploy\run.ps1' -WorkingDirectory "$root\app"
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId 'S-1-5-19' -LogonType ServiceAccount
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName 'Suixing-Web' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Suixing trip assistant; local-only Node server with automatic restart' | Out-Null
Start-ScheduledTask -TaskName 'Suixing-Web'
Write-Output 'Scheduled task installed and started.'
