# Проход сборщика с телефона (Планировщик Windows): раз в день, 15:30 МСК.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File D:\...\collector\android\Run-Pass.ps1
#
# Снимает лобби трёх приложений и отправляет в приёмник на проде:
#   PPPoker  → клуб Ginger (1049607),   slug ginger
#   X-Poker  → клуб GINGER+ (2022497),  slug ginger-plus
#   Poker21  → клуб Ginger21 (542765),  slug ginger21
#
# Приложения должны быть уже открыты в лобби нужного клуба на вкладке турниров: проход
# по клубам не ходит и приложения не перезапускает. X-Poker после рестарта упирается в
# проверку сети, Suprema теряет сессию — оба выяснены на живом проходе 26.09.
# Лог, JSON и кадры — в %LOCALAPPDATA%\GingerCollector\<дата>. Второй экземпляр не запускается.
# В строках кода — только латиница (Windows PowerShell 5.1).

param(
    [switch]$NoSend,
    [switch]$SkipPPPoker,
    [switch]$SkipXPoker,
    [switch]$SkipPoker21,
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
$failed = @()

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

    # Без ключа распознавания проход не падает, а работает наблюдателем: снимает лобби и
    # складывает кадры в папку дня. Прочитать их можно потом — глазами или когда появится ключ.
    $noRead = -not ($env:ANTHROPIC_API_KEY -or (Test-Path (Join-Path $env:USERPROFILE '.ginger\anthropic_key')))
    if ($noRead) { Write-Warning 'No Anthropic key: shots only, nothing is parsed or sent' }

    $stamp = Get-Date -Format 'yyyyMMdd-HHmm'
    $passes = @(
        [pscustomobject]@{ Skip = $SkipPPPoker; Name = 'PPPoker'; Tag = 'pppoker-mtt'; Slug = 'ginger'; App = 'pppoker'; Run = { Invoke-PpMttPassPhone -OutDir $day -KeepShots:($KeepShots -or $noRead) -NoRead:$noRead } },
        [pscustomobject]@{ Skip = $SkipXPoker; Name = 'X-Poker'; Tag = 'xpoker-mtt'; Slug = 'ginger-plus'; App = 'xpoker'; Run = { Invoke-XpMttPassPhone -OutDir $day -KeepShots:($KeepShots -or $noRead) -NoRead:$noRead } },
        [pscustomobject]@{ Skip = $SkipPoker21; Name = 'Poker21'; Tag = 'poker21-mtt'; Slug = 'ginger21'; App = 'poker21'; Run = { Invoke-P21MttPassPhone -OutDir $day -KeepShots:($KeepShots -or $noRead) -NoRead:$noRead } }
    )

    foreach ($pass in $passes) {
        if ($pass.Skip) { continue }
        Write-Host ("== {0} pass" -f $pass.Name)
        # Одно упавшее приложение не должно уносить весь проход: остальные всё равно снимаем.
        try {
            $cards = @(& $pass.Run)
            if ($noRead) {
                Write-Host ("{0}: shots saved to {1}" -f $pass.Name, $day)
                continue
            }
            $withStart = @($cards | Where-Object { $_.starts_at }).Count
            Write-Host ("{0}: {1} cards, {2} with start" -f $pass.Name, $cards.Count, $withStart)
            if (-not $cards.Count) { throw 'empty pass' }
            $jsonPath = Export-PhonePass -Cards $cards -Path (Join-Path $day ("{0}-{1}.json" -f $pass.Tag, $stamp))
            if (-not $NoSend -and $withStart) {
                Write-Host ("== {0} send" -f $pass.Name)
                # -Complete: проход прошёл лобби целиком, значит пропавшие турниры сервер снимет сам.
                $result = Send-CollectorSnapshot -JsonPath $jsonPath -ClubSlug $pass.Slug -App $pass.App -Apply -Complete
                $result | ConvertTo-Json -Compress | Write-Host
            }
        } catch {
            $failed += "$($pass.Name): $_"
            Write-Warning ("{0} pass failed: {1}" -f $pass.Name, $_)
        }
    }

    Get-HaikuSpend | Format-List | Out-String | Write-Host
    if ($failed.Count) { throw ("Passes failed - " + ($failed -join '; ')) }
    Write-Host '== done'
} catch {
    Write-Error "Phone pass failed: $_"
    exit 2
} finally {
    # Экран гасим сразу: от USB телефон почти не заряжается, а горящее лобби съедает батарею
    # за ночь (решение Ивана 28.09). Разбудит его следующий проход.
    if ($stayOn) {
        try { Set-PhoneStayOn 'false'; Invoke-PhoneKey 'KEYCODE_SLEEP' -SettleMs 300 }
        catch { Write-Warning "screen off failed: $_" }
    }
    [System.IO.File]::Delete($lock)
    Stop-Transcript | Out-Null
}
