$ErrorActionPreference = 'Stop'
$env:HOST = '127.0.0.1'
$env:PORT = '3000'
$env:DATA_DIR = 'C:\Suixing\data'
$env:BACKUP_DIR = 'C:\Suixing\backups'
$env:READ_ONLY = '1'
$env:CLOUDBASE_SITE = 'https://zdata-d4g6l75lwebf2dbb0-1485288642.tcloudbaseapp.com/'
Set-Location -LiteralPath 'C:\Suixing\app'
while ($true) {
    $log = 'C:\Suixing\logs\app-' + (Get-Date -Format 'yyyy-MM-dd') + '.log'
    try {
        $ErrorActionPreference = 'Continue'
        & 'C:\Suixing\runtime\node-v22.23.2-win-x64\node.exe' --disable-warning=ExperimentalWarning server.mjs >> $log 2>&1
    } catch {
        $_ | Out-File -FilePath $log -Append
    } finally {
        $ErrorActionPreference = 'Stop'
    }
    Start-Sleep -Seconds 5
}
