# Телефон как сборщик: тонкий слой над adb (снимок экрана, тап, свайп, запуск приложения).
#
# Заменяет Desk.ps1 из десктопного сборщика. Отличия, ради которых всё и затевалось:
# курсор и окна не нужны, проход идёт по сети и не мешает работать за компьютером.
#
#   . .\collector\android\Adb.ps1
#   Connect-Phone                      # адрес из %USERPROFILE%\.ginger\phone или USB
#   $shot = Get-PhoneShot
#   Invoke-PhoneSwipe -FromY 0.78 -ToY 0.30
#
# Координаты везде долевые (0..1): экран телефона может смениться, разметка - нет.
# В строках кода - только латиница (Windows PowerShell 5.1).

$script:Adb = $null
$script:Phone = $null
$script:PhoneSize = $null

function Get-AdbExe {
    if ($script:Adb) { return $script:Adb }
    $candidates = @(
        'adb.exe',
        (Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'),
        (Join-Path $env:ProgramFiles 'platform-tools\adb.exe')
    )
    foreach ($candidate in $candidates) {
        $found = Get-Command $candidate -ErrorAction SilentlyContinue
        if ($found) { $script:Adb = $found.Source; return $script:Adb }
    }
    throw 'adb not found: install platform-tools or put adb.exe on PATH'
}

function Invoke-Adb {
    # Прямой вызов adb к выбранному устройству; stderr приклеиваем к выводу, чтобы видеть причины.
    param([Parameter(ValueFromRemainingArguments)][string[]]$Arguments)
    $exe = Get-AdbExe
    $prefix = @()
    if ($script:Phone) { $prefix = @('-s', $script:Phone) }
    & $exe @prefix @Arguments 2>&1
}

function Invoke-PhoneShell {
    param([Parameter(Mandatory)][string]$Command)
    Invoke-Adb shell $Command
}

function Get-PhoneAddress {
    # Адрес беспроводной отладки живёт в профиле, не в репозитории: он меняется после перезагрузки.
    param([string]$Address)
    if ($Address) { return $Address }
    if ($env:GINGER_PHONE) { return $env:GINGER_PHONE }
    $file = Join-Path $env:USERPROFILE '.ginger\phone'
    if (Test-Path $file) { return (Get-Content $file -Raw).Trim() }
    return $null
}

function Set-PhoneAddress {
    # После перезагрузки телефона порт другой - записываем новый и сразу подключаемся.
    param([Parameter(Mandatory)][string]$Address)
    $dir = Join-Path $env:USERPROFILE '.ginger'
    if (-not (Test-Path $dir)) { [void](New-Item -ItemType Directory -Path $dir) }
    Set-Content -Path (Join-Path $dir 'phone') -Value $Address.Trim() -Encoding Ascii
    Connect-Phone -Address $Address
}

function Find-PhoneByMdns {
    # Телефон объявляет себя как _adb-tls-connect._tcp. Openscreen-бэкенд ищет надёжнее старого Bonjour.
    $exe = Get-AdbExe
    $saved = $env:ADB_MDNS_OPENSCREEN
    $env:ADB_MDNS_OPENSCREEN = '1'
    try { $out = & $exe mdns services 2>&1 } finally { $env:ADB_MDNS_OPENSCREEN = $saved }
    foreach ($line in $out) {
        $match = [regex]::Match("$line", '_adb-tls-connect\._tcp\s+(\d{1,3}(?:\.\d{1,3}){3}):(\d+)')
        if ($match.Success) { return "$($match.Groups[1].Value):$($match.Groups[2].Value)" }
    }
    $null
}

function Test-PhoneConnected {
    param([Parameter(Mandatory)][string]$Target)
    $exe = Get-AdbExe
    $result = & $exe connect $Target 2>&1
    if ("$result" -notmatch 'connected to') { return $false }
    ("$(& $exe -s $Target get-state 2>&1)").Trim() -eq 'device'
}

function Connect-Phone {
    # Порядок: заданный адрес -> сохранённый -> тот же хост на фиксированном порту 5555 ->
    # поиск по mDNS -> единственное устройство по USB. Так переподключение переживает и сон,
    # и перезагрузку телефона, не требуя каждый раз лезть в настройки за новым портом.
    param([string]$Address, [switch]$Quiet)
    $exe = Get-AdbExe
    $script:Phone = $null
    $script:PhoneSize = $null

    $candidates = @()
    foreach ($value in @($Address, (Get-PhoneAddress))) {
        if ($value) {
            $candidates += $value
            $host4 = ($value -split ':')[0]
            if ($value -notmatch ':5555$') { $candidates += "${host4}:5555" }
        }
    }
    $mdns = Find-PhoneByMdns
    if ($mdns) { $candidates += $mdns }

    foreach ($target in ($candidates | Select-Object -Unique)) {
        if (Test-PhoneConnected -Target $target) { $script:Phone = $target; break }
    }
    if (-not $script:Phone) {
        # Кабель: устройство видно сразу после любой перезагрузки, портов не существует.
        # Строки чистим: adb под Windows оставляет возврат каретки, и якорь конца строки не срабатывал.
        $lines = @(& $exe devices | Select-Object -Skip 1 | ForEach-Object { "$_".Trim() } |
            Where-Object { $_ -match '^\S+\s+device\b' -and $_ -notmatch '^\d+\.\d+\.\d+\.\d+:' })
        if ($lines.Count -ne 1) {
            throw "Phone not found (tried: $($candidates -join ', ')). Plug in USB, or read the new port from Wireless debugging and run Set-PhoneAddress."
        }
        $script:Phone = ($lines[0] -split '\s+')[0]
    }
    $size = Get-PhoneSize
    if (-not $Quiet) { Write-Host ("Phone {0}, screen {1}x{2}" -f $script:Phone, $size.Width, $size.Height) }
    $script:Phone
}

function Set-PhoneFixedPort {
    # Уводит adbd на постоянный порт 5555: адрес перестаёт меняться до перезагрузки телефона.
    # Вызывать с любого живого подключения (по кабелю - и подавно).
    param([int]$Port = 5555)
    if (-not $script:Phone) { throw 'Connect-Phone first' }
    $exe = Get-AdbExe
    [void](& $exe -s $script:Phone tcpip $Port 2>&1)
    Start-Sleep -Seconds 3
    $ip = "$(Invoke-PhoneShell 'ip route get 1.1.1.1')" -replace '.*src\s+(\d+\.\d+\.\d+\.\d+).*', '$1'
    if ($ip -notmatch '^\d+\.\d+\.\d+\.\d+$') { $ip = ($script:Phone -split ':')[0] }
    $target = "${ip}:$Port"
    if (-not (Test-PhoneConnected -Target $target)) { throw "Cannot reach $target after tcpip $Port" }
    $script:Phone = $target
    $dir = Join-Path $env:USERPROFILE '.ginger'
    if (-not (Test-Path $dir)) { [void](New-Item -ItemType Directory -Path $dir) }
    Set-Content -Path (Join-Path $dir 'phone') -Value $target -Encoding Ascii
    Write-Host "Phone pinned to $target (until the phone reboots)"
    $target
}

function Get-PhoneSize {
    if ($script:PhoneSize) { return $script:PhoneSize }
    $out = "$(Invoke-PhoneShell 'wm size')"
    # Override size важнее Physical: если разрешение занижено, координаты считаются от него.
    $match = [regex]::Match($out, 'Override size:\s*(\d+)x(\d+)')
    if (-not $match.Success) { $match = [regex]::Match($out, 'Physical size:\s*(\d+)x(\d+)') }
    if (-not $match.Success) { throw "Cannot read screen size: $out" }
    $script:PhoneSize = [pscustomobject]@{ Width = [int]$match.Groups[1].Value; Height = [int]$match.Groups[2].Value }
    $script:PhoneSize
}

function ConvertTo-PhonePoint {
    # Доля -> пиксели. Значение больше 1 считаем уже пикселями: удобно при отладке по скриншоту.
    param([double]$X, [double]$Y)
    $size = Get-PhoneSize
    $px = if ($X -le 1) { [int][math]::Round($X * $size.Width) } else { [int]$X }
    $py = if ($Y -le 1) { [int][math]::Round($Y * $size.Height) } else { [int]$Y }
    , @($px, $py)
}

function Invoke-PhoneTap {
    param([Parameter(Mandatory)][double]$X, [Parameter(Mandatory)][double]$Y, [int]$SettleMs = 600)
    $point = ConvertTo-PhonePoint -X $X -Y $Y
    [void](Invoke-PhoneShell "input tap $($point[0]) $($point[1])")
    Start-Sleep -Milliseconds $SettleMs
}

function Invoke-PhoneSwipe {
    # Медленный свайп (по умолчанию 900 мс) - список не улетает по инерции и страницы не проскакивают.
    param(
        [double]$FromY = 0.78, [double]$ToY = 0.32, [double]$X = 0.5,
        [int]$DurationMs = 900, [int]$SettleMs = 900
    )
    $from = ConvertTo-PhonePoint -X $X -Y $FromY
    $to = ConvertTo-PhonePoint -X $X -Y $ToY
    [void](Invoke-PhoneShell "input swipe $($from[0]) $($from[1]) $($to[0]) $($to[1]) $DurationMs")
    Start-Sleep -Milliseconds $SettleMs
}

function Invoke-PhoneKey {
    param([Parameter(Mandatory)][string]$Key, [int]$SettleMs = 500)
    [void](Invoke-PhoneShell "input keyevent $Key")
    Start-Sleep -Milliseconds $SettleMs
}

function Get-PhoneShot {
    # screencap на телефоне + pull: бинарь через конвейер PowerShell портится, поэтому только файлом.
    param([string]$Path, [int]$MaxSide = 1568)
    if (-not $Path) { $Path = Join-Path $env:TEMP ("ginger-shot-{0}.png" -f (Get-Date -Format 'HHmmss-fff')) }
    $remote = '/sdcard/ginger-shot.png'
    [void](Invoke-PhoneShell "screencap -p $remote")
    $pull = Invoke-Adb pull $remote $Path
    [void](Invoke-PhoneShell "rm -f $remote")
    if (-not (Test-Path $Path)) { throw "screencap failed: $pull" }
    if ($MaxSide -gt 0) { Compress-PhoneShot -Path $Path -MaxSide $MaxSide }
    $Path
}

function Compress-PhoneShot {
    # Экран 1440x3216 - это ~6200 токенов у Haiku за кадр. Уменьшение до 1568 по длинной стороне
    # режет счёт вчетверо и ничего не теряет: модель всё равно ужимает картинку сама.
    param([Parameter(Mandatory)][string]$Path, [int]$MaxSide = 1568)
    Add-Type -AssemblyName System.Drawing
    $full = (Resolve-Path $Path).Path
    $temp = $null
    $source = [System.Drawing.Image]::FromFile($full)
    try {
        $scale = [math]::Min(1.0, $MaxSide / [math]::Max($source.Width, $source.Height))
        if ($scale -ge 1.0) { return }
        $width = [int][math]::Round($source.Width * $scale)
        $height = [int][math]::Round($source.Height * $scale)
        $target = New-Object System.Drawing.Bitmap($width, $height)
        $graphics = [System.Drawing.Graphics]::FromImage($target)
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.DrawImage($source, 0, 0, $width, $height)
        $graphics.Dispose()
        $temp = "$full.tmp.png"
        $target.Save($temp, [System.Drawing.Imaging.ImageFormat]::Png)
        $target.Dispose()
    } finally {
        $source.Dispose()
    }
    if ($temp) {
        [System.IO.File]::Delete($full)
        [System.IO.File]::Move($temp, $full)
    }
}

function Get-PhoneTopPackage {
    $out = "$(Invoke-PhoneShell 'dumpsys window | grep mCurrentFocus')"
    $match = [regex]::Match($out, '\s([A-Za-z0-9_\.]+)/')
    if ($match.Success) { return $match.Groups[1].Value }
    $null
}

function Test-PhoneAwake {
    $out = "$(Invoke-PhoneShell 'dumpsys power | grep mWakefulness=')"
    $out -match 'Awake'
}

function Resume-Phone {
    # Будим и снимаем блокировку свайпом. PIN сборщику не ставим - иначе проход встанет после перезагрузки.
    param([int]$SettleMs = 1200)
    if (-not (Test-PhoneAwake)) { Invoke-PhoneKey 'KEYCODE_WAKEUP' }
    Invoke-PhoneKey 'KEYCODE_MENU' -SettleMs 300
    Invoke-PhoneSwipe -FromY 0.80 -ToY 0.35 -DurationMs 250 -SettleMs $SettleMs
}

function Set-PhoneStayOn {
    # На время прохода экран не гасим, после - возвращаем как было (иначе выгорит лобби в матрицу).
    param([ValidateSet('true', 'false')][string]$Value = 'true')
    [void](Invoke-PhoneShell "svc power stayon $Value")
}

function Start-PhoneApp {
    param([Parameter(Mandatory)][string]$Package, [int]$WaitSeconds = 25)
    [void](Invoke-PhoneShell "monkey -p $Package -c android.intent.category.LAUNCHER 1")
    for ($i = 0; $i -lt $WaitSeconds; $i++) {
        Start-Sleep -Seconds 1
        if ((Get-PhoneTopPackage) -eq $Package) { return $true }
    }
    $false
}

function Stop-PhoneApp {
    param([Parameter(Mandatory)][string]$Package)
    [void](Invoke-PhoneShell "am force-stop $Package")
}

function Get-PhoneBattery {
    # Проход на телефоне без батареи (или на слабом питании) обрывается - лог должен это показывать.
    $out = (Invoke-PhoneShell 'dumpsys battery' | Out-String)
    $read = {
        param($name)
        $m = [regex]::Match($out, "(?m)^\s*$name\s*:\s*(-?\d+)")
        if ($m.Success) { [int]$m.Groups[1].Value } else { $null }
    }
    $temperature = & $read 'temperature'
    [pscustomobject]@{
        level = & $read 'level'
        voltage_mv = & $read 'voltage'
        health = & $read 'health'
        status = & $read 'status'
        temperature_c = $(if ($null -ne $temperature) { $temperature / 10 } else { $null })
    }
}
