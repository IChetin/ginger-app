# Заход в лобби клуба: модель говорит, ГДЕ мы, но не КУДА нажимать.
#
# Первая версия спрашивала у модели координаты крестиков и вкладок — и промахи открыли
# сначала магазин, а потом кэш-стол (30.09). Поэтому правило: нажимаем только по заранее
# известным местам своего приложения, а модель выбирает из них, отвечая одним словом,
# что сейчас на экране. Стол — немедленная остановка: там мы не нажимаем ничего.
#
#   . .\collector\android\Navigate.ps1
#   Connect-Phone
#   Enter-PhoneLobby -Package com.lein.pppoker.android -Club Ginger
#
# В строках кода - только латиница (Windows PowerShell 5.1).

. "$PSScriptRoot\Adb.ps1"
. "$PSScriptRoot\..\desktop\Haiku.ps1"

# Известные места каждого приложения — единственное, куда проходу позволено нажимать.
# Доли экрана, снятые с реальных кадров 1080x2412.
$script:Controls = @{
    'com.lein.pppoker.android' = @{
        Home = @(0.5, 0.965)                      # центр нижней панели — экран с клубами
        ClubGridX = @(0.29, 0.71)                 # сетка клубов: два столбца
        ClubGridY0 = 0.373
        ClubGridStep = 0.232
        TabY = 0.25                               # лента вкладок лобби
        TabX = @(0.12, 0.30, 0.50, 0.70, 0.88)
        Closes = @(@(0.926, 0.080), @(0.896, 0.230), @(0.896, 0.358), @(0.708, 0.198))
        RequireMtt = $true                        # на вкладке ALL у PPPoker кэш, не турниры
    }
    'com.game.android.xpoker' = @{
        Home = @(0.5, 0.965)
        Single = @(0.504, 0.437)                  # дверь единственного клуба
        Closes = @(@(0.877, 0.273), @(0.5, 0.665))
        RequireMtt = $false                       # турниры и SNG идут одним списком
    }
    'com.kmg.pokerseka21' = @{
        Home = @(0.5, 0.965)
        Single = @(0.496, 0.638)                  # фишка клуба
        # Ежедневная награда закрывается кнопкой внизу окна («Receive» / «ОК»): нажать её
        # безопасно, это просто забрать бонус (Иван, 30.09). Дальше — тап мимо окна и крестик.
        Closes = @(@(0.5, 0.782), @(0.5, 0.10), @(0.926, 0.080))
        RequireMtt = $false                       # турниры и столы в одной плитке
    }
}

$script:ScreenSchema = @{
    type = 'object'
    additionalProperties = $false
    required = @('screen', 'overlay', 'club_index', 'list_kind', 'mtt_slot')
    properties = @{
        screen = @{ type = 'string'; enum = @('club_list', 'lobby', 'table', 'other') }
        overlay = @{ type = 'boolean' }
        club_index = New-NullableType 'integer'
        list_kind = @{ type = 'string'; enum = @('tournaments', 'cash', 'mixed', 'none') }
        mtt_slot = New-NullableType 'integer'
    }
}

function Get-PhoneListSignature {
    <#
        .SYNOPSIS
        Грубый слепок левой колонки списка - по нему видно, двигается он ещё или уже упёрся.
    #>
    # Берём узкую полосу у левого края: там фишки игр, а таймеры и счётчики игроков в неё не
    # попадают (по всему кадру сравнивать нельзя - обожглись 26.09). Полосу ужимаем до
    # 16x64 серых точек: фишки в приложении переливаются, и побайтовое сравнение не совпало
    # бы никогда, а на таком масштабе блеск уходит в шум, прокрутка - нет.
    param([Parameter(Mandatory)][string]$Path)
    Add-Type -AssemblyName System.Drawing
    $bitmap = [System.Drawing.Bitmap]::FromFile($Path)
    try {
        $rect = New-Object System.Drawing.Rectangle(
            0, [int]($bitmap.Height * 0.47), [int]($bitmap.Width * 0.2), [int]($bitmap.Height * 0.5))
        $crop = $bitmap.Clone($rect, $bitmap.PixelFormat)
        $small = New-Object System.Drawing.Bitmap 16, 64
        try {
            $canvas = [System.Drawing.Graphics]::FromImage($small)
            $canvas.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $canvas.DrawImage($crop, 0, 0, 16, 64)
            $canvas.Dispose()
            $grey = New-Object 'System.Collections.Generic.List[int]'
            for ($y = 0; $y -lt 64; $y++) {
                for ($x = 0; $x -lt 16; $x++) {
                    $pixel = $small.GetPixel($x, $y)
                    $grey.Add([int](0.299 * $pixel.R + 0.587 * $pixel.G + 0.114 * $pixel.B))
                }
            }
            , $grey.ToArray()
        } finally { $crop.Dispose(); $small.Dispose() }
    } finally { $bitmap.Dispose() }
}

function Test-PhoneListSettled {
    # Список считаем остановившимся, когда картинка сдвинулась меньше, чем на уровень шума.
    param($Previous, $Current, [int]$Tolerance = 6)
    if ($null -eq $Previous -or $null -eq $Current) { return $false }
    if ($Previous.Count -ne $Current.Count) { return $false }
    $sum = 0
    for ($i = 0; $i -lt $Current.Count; $i++) { $sum += [math]::Abs($Current[$i] - $Previous[$i]) }
    ($sum / $Current.Count) -lt $Tolerance
}

function Move-PhoneListToTop {
    <#
        .SYNOPSIS
        Пролистать список в самое начало: турниры лежат там, кэш-столы под ними.
    #>
    # Фиксированным числом свайпов не обойтись - в лобби Ginger21 под семьсот позиций, и из
    # глубины списка тридцати флингов не хватало. Листаем, пока отпечаток меняется, и
    # останавливаемся, когда список упёрся. Палец ведём от 0.55 к 0.95: выше 0.46 начинается
    # шапка с фишкой клуба и вкладками, и жест туда до списка просто не доходит (04.10).
    param([int]$MaxRounds = 15, [int]$FlingsPerRound = 6)
    $shot = Join-Path $env:TEMP 'ginger-top.png'
    $previous = $null
    for ($round = 1; $round -le $MaxRounds; $round++) {
        1..$FlingsPerRound | ForEach-Object { Invoke-PhoneSwipe -FromY 0.55 -ToY 0.95 -DurationMs 120 -SettleMs 220 }
        [void](Get-PhoneShot -Path $shot)
        $signature = Get-PhoneListSignature -Path $shot
        if (Test-PhoneListSettled -Previous $previous -Current $signature) { return $true }
        $previous = $signature
    }
    $false
}

function Get-PhoneScreenKind {
    <#
        .SYNOPSIS
        Где мы сейчас: список клубов, лобби, стол или что-то ещё. Координат не спрашиваем.
    #>
    param(
        [Parameter(Mandatory)][string]$Shot,
        [Parameter(Mandatory)][string]$Club
    )
    $prompt = @"
This is a screenshot of a poker app on a phone. The collector is looking for the tournament list of the club named "$Club". Report only what you see; never guess.

- screen: "table" if a poker table with seats and chips is open — that is the most important case, say it even if a popup covers part of it. "club_list" if the screen offers a club to enter and we are not inside one yet: a grid of club cards, a club door, or a single large club chip or badge carrying the club name. The app's main screen counts as "club_list" whenever such a card or chip is on it, however decorated it is — banners, mascots, a bottom navigation bar and buttons like "Create Club" or "Search Club" do not make it anything else. "lobby" if we are inside a club and see a list of games. "other" only when neither applies and no club can be entered from the screen: splash, login, shop, profile, settings, a black screen.
- overlay: true if a popup, notice, reward, daily bonus or tips window covers the screen.
- club_index: only when screen is "club_list" and several club cards are visible. Position of the card named "$Club", counting from 1, left to right then top to bottom. Null if that club is not visible or only one club is shown.
- list_kind: only when screen is "lobby". "tournaments" if the visible rows are tournaments (they show "Buy-in", a start time, a guarantee or a registration countdown). "cash" if the rows are cash tables (blinds like "50-100bb", "1/5", "15/30", seat counters like 0/6). "mixed" if both kinds are on screen. "none" if the list is empty or unreadable.
- mtt_slot: only when screen is "lobby" and a row of tabs is visible (ALL, DRAWMAHA, HOT, NLH, PLO5, MTT, FLASH…). Count the tabs you can see from left to right, starting at 1, and give the position of the tab labelled exactly "MTT". Null when MTT is not among the visible tabs — the row scrolls sideways, so it may be off screen.
"@
    Invoke-HaikuVision -ImagePath $Shot -Prompt $prompt -Schema $script:ScreenSchema -MaxTokens 200
}

function Enter-PhoneLobby {
    <#
        .SYNOPSIS
        Довести приложение до списка турниров клуба, нажимая только по известным местам.

        .DESCRIPTION
        Возвращает $true, если дошли. Бросает исключение, если приложение оказалось за столом
        или если известные места закончились: лучше остановить проход, чем тыкать наугад.
    #>
    param(
        [Parameter(Mandatory)][string]$Package,
        [Parameter(Mandatory)][string]$Club,
        [int]$MaxSteps = 10
    )
    $map = $script:Controls[$Package]
    if (-not $map) { throw "No known controls for $Package" }
    if (-not (Show-PhoneApp -Package $Package)) { throw "Cannot bring $Package to front" }

    $shot = Join-Path $env:TEMP 'ginger-nav.png'
    $closeIndex = 0
    $tabIndex = 0
    $listAtTop = $false

    for ($step = 1; $step -le $MaxSteps; $step++) {
        # Погасший экран даёт чёрный кадр, и модель честно отвечает «other».
        if (-not (Test-PhoneAwake)) { Resume-Phone }
        [void](Get-PhoneShot -Path $shot)
        $screen = Get-PhoneScreenKind -Shot $shot -Club $Club
        Write-Host ("  шаг {0}: {1}, промо {2}, список {3}" -f $step, $screen.screen, $screen.overlay, $screen.list_kind)

        if ($screen.screen -eq 'table') {
            throw "$Package is at a table - the pass is stopped, nothing was tapped"
        }

        # Сначала проверяем, не пришли ли мы, и только потом гасим промо. Иначе тап по
        # «крестику» поверх готового списка попадает в строку и открывает стол (01.10).
        if ($screen.screen -eq 'lobby') {
            $done = $screen.list_kind -eq 'tournaments' -or
                (-not $map.RequireMtt -and $screen.list_kind -eq 'mixed')
            if ($done) { return $true }
        }

        if ($screen.overlay) {
            # Крестики — по своему списку известных мест, по одному за шаг.
            if ($closeIndex -lt $map.Closes.Count) {
                $point = $map.Closes[$closeIndex]
                $closeIndex++
                Invoke-PhoneTap -X $point[0] -Y $point[1] -SettleMs 2500
                continue
            }
            Invoke-PhoneTap -X $map.Home[0] -Y $map.Home[1] -SettleMs 4000
            $closeIndex = 0
            continue
        }

        switch ($screen.screen) {
            'lobby' {
                $ok = $screen.list_kind -eq 'tournaments' -or
                    (-not $map.RequireMtt -and $screen.list_kind -eq 'mixed')
                if ($ok) { return $true }
                # Турниры лежат в самом верху списка, кэш-столы под ними. Видим кэш — значит
                # список оставили прокрученным вниз: поднимаемся до упора и смотрим снова
                # (Иван, 04.10). Заодно это возвращает на экран ленту вкладок — она живёт в
                # шапке, и при прокрученном списке свайпы «по ленте» двигали бы сам список
                # (обожглись 30.09).
                if (-not $listAtTop) {
                    [void](Move-PhoneListToTop)
                    $listAtTop = $true
                    continue
                }
                if (-not $map.TabY) { throw "$Package shows $($screen.list_kind), and it has no tabs to switch" }
                # Модель называет номер видимого слота с вкладкой MTT — выбор из известного
                # ряда, а не координата. Нет в кадре: тянем ленту и смотрим снова.
                if ($null -ne $screen.mtt_slot) {
                    $slot = [int]$screen.mtt_slot - 1
                    if ($slot -lt 0 -or $slot -ge $map.TabX.Count) { throw "${Package}: tab slot $($screen.mtt_slot) is out of the known row" }
                    Invoke-PhoneTap -X $map.TabX[$slot] -Y $map.TabY -SettleMs 4000
                    continue
                }
                if ($tabIndex -ge 3) { throw "${Package}: no MTT tab found in the lobby" }
                $tabIndex++
                [void](Invoke-PhoneShell 'input swipe 950 615 200 615 600')
                Start-Sleep -Milliseconds 1200
                continue
            }
            'club_list' {
                if ($null -ne $screen.club_index -and [int]$screen.club_index -ge 1 -and $map.ClubGridX) {
                    $index = [int]$screen.club_index - 1
                    $x = $map.ClubGridX[$index % 2]
                    $y = $map.ClubGridY0 + [math]::Floor($index / 2) * $map.ClubGridStep
                    Invoke-PhoneTap -X $x -Y $y -SettleMs 9000
                } elseif ($map.Single) {
                    Invoke-PhoneTap -X $map.Single[0] -Y $map.Single[1] -SettleMs 9000
                } else {
                    throw "${Package}: club $Club is not on the screen"
                }
                continue
            }
            default {
                Invoke-PhoneTap -X $map.Home[0] -Y $map.Home[1] -SettleMs 4000
            }
        }
    }
    throw "${Package}: could not reach the $Club lobby in $MaxSteps steps"
}
