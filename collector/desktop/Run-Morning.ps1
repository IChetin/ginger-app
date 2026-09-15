# Проход сборщика (резервный ПК, Планировщик Windows): два раза в день — 10:00 и 22:00 МСК
# (решение Ивана 15.09: утром — расписание дня, вечером — изменения).
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File D:\...\collector\desktop\Run-Morning.ps1
#
# 1. X-Poker: проход по MTT Ginger+ и отправка в приёмник на проде (если есть токен).
# 2. PPPoker: проход по ленте MTT Ginger; пока без отправки — время старта ловится не у всех турниров,
#    и сервер отметил бы их «пропавшими».
# Лог и JSON — в %LOCALAPPDATA%\GingerCollector\<дата>. Второй экземпляр не запускается.
# Клиенты X-Poker и PPPoker должны быть открыты в лобби клубов (вкладка MTT) и не свёрнуты.
# В строках кода — только латиница (Windows PowerShell 5.1).

param([switch]$NoSend, [switch]$SkipPPPoker)

$ErrorActionPreference = 'Stop'
$root = Join-Path $env:LOCALAPPDATA 'GingerCollector'
$day = Join-Path $root (Get-Date -Format 'yyyy-MM-dd')
New-Item -ItemType Directory -Force $day | Out-Null
$log = Join-Path $day ("morning-{0:HHmm}.log" -f (Get-Date))
Start-Transcript -Path $log -Append | Out-Null

$lock = Join-Path $root 'morning.lock'
if (Test-Path $lock) {
    $age = (Get-Date) - (Get-Item $lock).LastWriteTime
    if ($age.TotalMinutes -lt 60) { Write-Warning "Another pass is running (lock $([int]$age.TotalMinutes) min old) - exit"; Stop-Transcript | Out-Null; exit 1 }
}
Set-Content -Path $lock -Value $PID

try {
    . "$PSScriptRoot\Send.ps1"
    . "$PSScriptRoot\PPoker.ps1"

    Write-Host '== X-Poker MTT pass'
    $xp = Invoke-XPokerMttPass -FromTop -MaxCards 60 -MaxScrolls 20
    $xpJson = Get-ChildItem (Join-Path $env:TEMP 'desk\xpoker') -Filter 'xpoker-mtt-*.json' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    Copy-Item $xpJson.FullName $day
    if (-not $NoSend) {
        Write-Host '== X-Poker send'
        $result = Send-CollectorSnapshot -JsonPath $xpJson.FullName -ClubSlug 'ginger-plus' -App 'xpoker' -Apply
        $result | ConvertTo-Json -Compress | Write-Host
    }

    if (-not $SkipPPPoker) {
        Write-Host '== PPPoker MTT pass (no send yet)'
        $pp = Invoke-PPokerMttPass -FromTop -MaxPages 40
        $ppJson = Get-ChildItem (Join-Path $env:TEMP 'desk\pp') -Filter 'pppoker-mtt-*.json' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
        Copy-Item $ppJson.FullName $day
    }
    Write-Host '== done'
} catch {
    Write-Error "Morning pass failed: $_"
    exit 2
} finally {
    [System.IO.File]::Delete($lock)
    Stop-Transcript | Out-Null
}
