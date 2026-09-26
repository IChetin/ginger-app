# Проход сборщика с телефона (Планировщик Windows): два раза в день — 10:00 и 22:00 МСК.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File D:\...\collector\android\Run-Pass.ps1
#
# 1. Подключение к телефону по беспроводной отладке (адрес — в %USERPROFILE%\.ginger\phone).
# 2. X-Poker: вкладка MTT клуба Ginger+ → отправка в приёмник на проде (если есть токен).
# 3. PPPoker: лента MTT клуба Ginger → отправка ядра полей (старт, имя, бай-ин, гарантия).
# Лог, JSON и последние кадры — в %LOCALAPPDATA%\GingerCollector\<дата>. Второй экземпляр не запускается.
# Телефон должен быть на зарядке, приложения — залогинены в нужных клубах.
# В строках кода — только латиница (Windows PowerShell 5.1).

param(
    [switch]$NoSend,
    [switch]$SkipPPPoker,
    [switch]$SkipXPoker,
    [string]$PhoneAddress,
    [switch]$KeepShots
)

$ErrorActionPreference = 'Stop'
$root = Join-Path $env:LOCALAPPDATA 'GingerCollector'
$day = Join-Path $root (Get-Date -Format 'yyyy-MM-dd')
New-Item -ItemType Directory -Force $day | Out-Null
$log = Join-Path $day ("phone-{0:HHmm}.log" -f (Get-Date))
Start-Transcript -Path $log -Append | Out-Null

$lock = Join-Path $root 'phone.lock'
if (Test-Path $lock) {
    $age = (Get-Date) - (Get-Item $lock).LastWriteTime
    if ($age.TotalMinutes -lt 60) { Write-Warning "Another pass is running (lock $([int]$age.TotalMinutes) min old) - exit"; Stop-Transcript | Out-Null; exit 1 }
}
Set-Content -Path $lock -Value $PID
$stayOn = $false

try {
    . "$PSScriptRoot\Lobby.ps1"
    . "$PSScriptRoot\..\desktop\Send.ps1"

    Write-Host '== connect'
    [void](Connect-Phone -Address $PhoneAddress)
    Resume-Phone
    Set-PhoneStayOn 'true'
    $stayOn = $true
    $battery = Get-PhoneBattery
    Write-Host ("Battery: level {0}%, {1} mV, health {2}, {3} C" -f $battery.level, $battery.voltage_mv, $battery.health, $battery.temperature_c)

    $stamp = Get-Date -Format 'yyyyMMdd-HHmm'
    if (-not $SkipXPoker) {
        Write-Host '== X-Poker MTT pass'
        $xp = @(Invoke-XpMttPassPhone -OutDir $day -KeepShots:$KeepShots)
        Write-Host ("X-Poker: {0} cards, {1} with start" -f $xp.Count, @($xp | Where-Object { $_.starts_at }).Count)
        $xpJson = Export-PhonePass -Cards $xp -Path (Join-Path $day "xpoker-mtt-$stamp.json")
        if (-not $NoSend -and $xp.Count) {
            Write-Host '== X-Poker send'
            $result = Send-CollectorSnapshot -JsonPath $xpJson -ClubSlug 'ginger-plus' -App 'xpoker' -Apply
            $result | ConvertTo-Json -Compress | Write-Host
        }
    }

    if (-not $SkipPPPoker) {
        Write-Host '== PPPoker MTT pass'
        $pp = @(Invoke-PpMttPassPhone -OutDir $day -KeepShots:$KeepShots)
        Write-Host ("PPPoker: {0} cards, {1} with start" -f $pp.Count, @($pp | Where-Object { $_.starts_at }).Count)
        $ppJson = Export-PhonePass -Cards $pp -Path (Join-Path $day "pppoker-mtt-$stamp.json")
        if (-not $NoSend -and @($pp | Where-Object { $_.starts_at }).Count) {
            Write-Host '== PPPoker send'
            $result = Send-CollectorSnapshot -JsonPath $ppJson -ClubSlug 'ginger' -App 'pppoker' -Apply
            $result | ConvertTo-Json -Compress | Write-Host
        }
    }

    Get-HaikuSpend | Format-List | Out-String | Write-Host
    Write-Host '== done'
} catch {
    Write-Error "Phone pass failed: $_"
    exit 2
} finally {
    if ($stayOn) { try { Set-PhoneStayOn 'false' } catch { Write-Warning "stayon reset failed: $_" } }
    [System.IO.File]::Delete($lock)
    Stop-Transcript | Out-Null
}
