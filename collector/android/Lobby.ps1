# Проход по лобби на телефоне: листаем список, каждую страницу читает Haiku, карточки склеиваем.
#
# Отличие от десктопного сборщика: там координаты карточек считались по OCR и ломались от каждого
# сдвига окна. Здесь координаты нужны ровно для одного действия - свайпа посреди экрана, а всё
# чтение берёт на себя модель. Поэтому разметка приложения может меняться, проход останется живым.
#
#   . .\collector\android\Lobby.ps1
#   Connect-Phone
#   $cards = Invoke-PpMttPassPhone -OutDir $env:TEMP\pass
#   $cards = Invoke-XpMttPassPhone -OutDir $env:TEMP\pass
#   $cards = Invoke-P21MttPassPhone -OutDir $env:TEMP\pass
#
# Проверено на живом проходе 26.09: PPPoker (Ginger, Go Daddy!, Private.G), X-Poker (GINGER+),
# Poker21 (Ginger21) - 96 турниров. Приложения должны быть уже открыты в лобби нужного клуба.
# В строках кода - только латиница (Windows PowerShell 5.1).

. "$PSScriptRoot\Adb.ps1"
. "$PSScriptRoot\Navigate.ps1"
. "$PSScriptRoot\..\desktop\Haiku.ps1"

$script:PpPackage = 'com.lein.pppoker.android'
$script:XpPackage = 'com.game.android.xpoker'
$script:P21Package = 'com.kmg.pokerseka21'
$script:SupremaPackage = 'com.opt.supremapoker'

# Приложения, которые нельзя перезапускать: X-Poker проверяет сеть только при старте и с VPN
# не поднимается, Suprema теряет сессию и требует ручного входа (оба выяснены 26.09).
$script:NoRestartPackages = @($script:XpPackage, $script:SupremaPackage)

# Гарантии X-Poker в клубе Ginger+ указаны в рублях, а сетка живёт в фишках (1 фишка = 100 руб.).
$script:XpRubPerChipPhone = 100

$script:XpListSchema = @{
    type = 'object'
    additionalProperties = $false
    required = @('is_mtt_list', 'cards')
    properties = @{
        is_mtt_list = @{ type = 'boolean' }
        cards = @{
            type = 'array'
            items = @{
                type = 'object'
                additionalProperties = $false
                required = @('name', 'buyin', 'game', 'bounty', 'guarantee_rub', 'start_time', 'status', 'entries', 'fully_visible')
                properties = @{
                    name = @{ type = 'string' }
                    buyin = New-NullableType 'number'
                    game = @{ type = 'string'; enum = @('nlh', 'plo', 'plo5', 'other') }
                    bounty = @{ type = 'string'; enum = @('none', 'pko', 'ko', 'mystery') }
                    guarantee_rub = New-NullableType 'number'
                    start_time = New-NullableType 'string'
                    status = @{ type = 'string'; enum = @('future', 'running', 'unknown') }
                    entries = New-NullableType 'integer'
                    fully_visible = @{ type = 'boolean' }
                }
            }
        }
    }
}

$script:XpListPrompt = @'
This is the tournament list of a club lobby in the X-Poker mobile app. Extract every row whose left badge says MTT, MAIN or STEP. Skip SNG rows and FLASH rows (those are cash tables), skip banners and filter chips. If the screen shows no such rows at all — a shop, a profile, a table or a cash-only list — answer is_mtt_list=false and cards=[].

For each row:
- name: the tournament title exactly as written (Latin or Cyrillic). Decorative icons (trophy, diamond, crown, clover, globe) are not letters.
- buyin: the number under the "Buy-in" label at the right edge; null if not visible.
- game: from the badge under the title: NLH -> nlh, PLO4 -> plo, PLO5 -> plo5, else other.
- bounty: the coloured badge that belongs to THIS row, next to its own game label: MKO -> mystery, PKO -> pko, KO -> ko. Rows are stacked tightly and a neighbour usually has a badge of its own — never carry it over. A row without its own badge is "none".
- guarantee_rub: the guarantee in rubles when the NAME contains one ("800K" -> 800000, "220k" -> 220000, "15k" -> 15000, "5K" -> 5000). Null when the name has no such number. Never use the prize pool.
- start_time: "MM/DD HH:MM" from a blue "Start: MM/DD HH:MM" label, else null.
- status: "running" when the label says "Registration ended" or "Registration closes in N mins", "future" when a start time is shown, else "unknown".
- entries: the registered players counter ("55/255" -> 55, "12" -> 12), else null.
- fully_visible: false if the row is cut off by the top or bottom edge of the screen.
Use null for anything not visible. Do not guess.
'@

$script:P21Schema = @{
    type = 'object'
    additionalProperties = $false
    required = @('is_lobby', 'cards')
    properties = @{
        is_lobby = @{ type = 'boolean' }
        cards = @{
            type = 'array'
            items = @{
                type = 'object'
                additionalProperties = $false
                required = @('name', 'buyin', 'game', 'bounty_mark', 'guarantee', 'start_time', 'status', 'entries', 'level_minutes', 'fully_visible')
                properties = @{
                    name = @{ type = 'string' }
                    buyin = New-NullableType 'number'
                    game = @{ type = 'string'; enum = @('nlh', 'plo', 'plo5', 'other') }
                    bounty_mark = New-NullableType 'string'
                    guarantee = New-NullableType 'number'
                    start_time = New-NullableType 'string'
                    status = @{ type = 'string'; enum = @('future', 'running', 'unknown') }
                    entries = New-NullableType 'integer'
                    level_minutes = New-NullableType 'string'
                    fully_visible = @{ type = 'boolean' }
                }
            }
        }
    }
}

$script:P21Prompt = @'
This is a club lobby in the Poker21 app: a vertical list of wide cards, one per row (an older layout packed the same cards into a two-column grid — read that the same way). Extract only the TOURNAMENT cards - the ones whose round chip on the left says MTT and whose body says "Buy-in:". Skip cash tables: their card says "Blinds:" instead of "Buy-in:", and their chip shows a game name or a number instead of MTT. Judge by "Buy-in:" versus "Blinds:" alone — a card is still a tournament when the small label under its MTT chip reads 21, OFC, DURAK, PLO4 or PLO6 instead of NLH, and when its chip is green rather than gold. If the screen is not a club lobby at all - a shop, a profile, a table - answer is_lobby=false and cards=[].

For each tournament card, top to bottom:
- name: the tournament title printed inside the card on its bottom line, to the right of the clock and player counters ("DV Rebuy", "Tournament Rebuy", "2 билета", "Magic Chest"). Copy it exactly as written, Latin or Cyrillic. It is never the "7 MAX" seat count and never the "Buy-in" or "GTD" labels.
- buyin: the large number under "Buy-in:".
- game: from the label under the MTT chip - NLH -> nlh, PLO4 -> plo, PLO5 -> plo5, PLO6 or "21" -> other.
- bounty_mark: the bounty mark at the right end of THIS card's bottom line, transcribed exactly as its letters appear. It comes in two styles and both count: red capitals standing on their own, or a small round red medallion with the letters written across it — the medallion is much smaller than the word and easy to miss, so look for it. Copy only the letters you actually see and never expand them: a mark reading "Ko" is "KO", not "MKO". Null when this card carries no mark at all. Never take a mark from the card above or below — the cards are stacked tightly.
- guarantee: the large number under "GTD:" ("30,000" -> 30000, "250,000" -> 250000).
- start_time: from "start: YYYY-MM-DD HH:MM" -> "YYYY-MM-DD HH:MM", else null.
- status: "running" when the card says "Registration ended ..." , "future" when it shows a start time, "unknown" when it only shows "Registration closes in ...".
- entries: the players counter next to the small person icon ("2/7" -> 2), else null.
- level_minutes: the level lengths next to the clock icon ("10/10/8m" -> "10/10/8", "8 min" -> "8", "lvl 22/12" -> "22/12"), else null.
- fully_visible: false if the card is cut off by the top or bottom edge.
Use null for anything not visible. Do not guess.
'@

function Read-XpListPageHaiku {
    param([Parameter(Mandatory)][string]$Shot)
    $page = Invoke-HaikuVision -ImagePath $Shot -Prompt $script:XpListPrompt -Schema $script:XpListSchema -MaxTokens 4000
    if (-not $page.is_mtt_list) { return @() }
    foreach ($card in $page.cards) {
        if (-not $card.fully_visible) { continue }
        $startsAt = ConvertTo-PhoneStart $card.start_time
        $status = $card.status
        if ($startsAt) { $status = 'future' }
        $guarantee = $null
        if ($card.guarantee_rub) { $guarantee = [decimal]$card.guarantee_rub / $script:XpRubPerChipPhone }
        [pscustomobject]@{
            name = $card.name
            buyin = $(if ($null -ne $card.buyin) { [decimal]$card.buyin } else { $null })
            game_type = $card.game
            bounty_kind = $card.bounty
            guarantee = $guarantee
            entries = $card.entries
            starts_at = $startsAt
            status = $status
        }
    }
}

function ConvertTo-PhoneBounty {
    # Значок баунти разбираем сами: модель только переписывает буквы, какие видит. Классификацию
    # ей не доверяем - круглую медальку «Ko» она охотно дочитывала до «MKO» (04.10).
    param([string]$Mark)
    $letters = ("$Mark" -replace '[^A-Za-zА-Яа-я]', '').ToUpperInvariant()
    switch ($letters) {
        'MKO' { 'mystery' }
        'МКО' { 'mystery' }
        'PKO' { 'pko' }
        'РКО' { 'pko' }
        'KO' { 'ko' }
        'КО' { 'ko' }
        default { 'none' }
    }
}

function Read-P21PageHaiku {
    param([Parameter(Mandatory)][string]$Shot)
    $page = Invoke-HaikuVision -ImagePath $Shot -Prompt $script:P21Prompt -Schema $script:P21Schema -MaxTokens 4000
    if (-not $page.is_lobby) { return @() }
    foreach ($card in $page.cards) {
        if (-not $card.fully_visible) { continue }
        $startsAt = ConvertTo-PhoneStart $card.start_time
        $status = $card.status
        if ($startsAt) { $status = 'future' }
        [pscustomobject]@{
            name = $card.name
            buyin = $(if ($null -ne $card.buyin) { [decimal]$card.buyin } else { $null })
            game_type = $card.game
            bounty_kind = ConvertTo-PhoneBounty $card.bounty_mark
            guarantee = $card.guarantee
            entries = $card.entries
            level_minutes = $card.level_minutes
            starts_at = $startsAt
            status = $status
        }
    }
}

function ConvertTo-PhoneStart {
    # Три формата сразу: Poker21 пишет полную дату с годом, PPPoker и X-Poker - "MM/DD HH:MM",
    # изредка попадается голое время. Без даты берём ближайшее наступление.
    param([string]$Text)
    if (-not $Text) { return $null }
    $now = Get-Date
    if ($Text -match '^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})$') {
        $local = Get-Date -Year ([int]$Matches[1]) -Month ([int]$Matches[2]) -Day ([int]$Matches[3]) `
            -Hour ([int]$Matches[4]) -Minute ([int]$Matches[5]) -Second 0 -Millisecond 0
        return ([DateTimeOffset]$local).ToString('yyyy-MM-ddTHH:mm:sszzz')
    }
    if ($Text -match '^(\d{1,2})[/.](\d{1,2})\s+(\d{1,2}):(\d{2})$') {
        # PPPoker и X-Poker пишут MM/DD, Suprema - DD/MM. Отличаем по значению: месяца больше 12 не бывает.
        $first = [int]$Matches[1]
        $second = [int]$Matches[2]
        $month = $first
        $day = $second
        if ($first -gt 12) { $month = $second; $day = $first }
        $local = Get-Date -Year $now.Year -Month $month -Day $day `
            -Hour ([int]$Matches[3]) -Minute ([int]$Matches[4]) -Second 0 -Millisecond 0
        if ($local -lt $now.AddDays(-30)) { $local = $local.AddYears(1) }
        return ([DateTimeOffset]$local).ToString('yyyy-MM-ddTHH:mm:sszzz')
    }
    if ($Text -match '^(\d{1,2}):(\d{2})$') {
        $local = Get-Date -Hour ([int]$Matches[1]) -Minute ([int]$Matches[2]) -Second 0 -Millisecond 0
        if ($local -lt $now.AddMinutes(-5)) { $local = $local.AddDays(1) }
        return ([DateTimeOffset]$local).ToString('yyyy-MM-ddTHH:mm:sszzz')
    }
    $null
}

function Get-PhoneCardKey {
    param($Card)
    $name = ("$($Card.name)" -replace '\s+', ' ').Trim().ToLowerInvariant()
    $buyin = $(if ($null -ne $Card.buyin) { [string]$Card.buyin } else { '' })
    "$name|$buyin"
}

function Merge-PhoneCard {
    # Нижняя строка карточки в лобби крутится (старт -> гарантия -> регистрация), поэтому
    # за одну страницу снимаем несколько кадров и дополняем уже известную карточку.
    param($Known, $Fresh)
    foreach ($property in $Fresh.PSObject.Properties) {
        $value = $property.Value
        if ($null -eq $value -or "$value" -eq '' -or "$value" -eq 'unknown') { continue }
        $current = $Known.$($property.Name)
        if ($null -eq $current -or "$current" -eq '' -or "$current" -eq 'unknown') {
            $Known | Add-Member -NotePropertyName $property.Name -NotePropertyValue $value -Force
        }
    }
    $Known
}


function Invoke-PhoneListPass {
    # Общий проход по любому списку: снять страницу -> прочитать -> свайпнуть -> повторить.
    # Останов - по содержимому: страница не дала новых карточек дважды подряд либо набор
    # названий совпал с предыдущей страницей. По кадрам сравнивать нельзя: в них тикают таймеры
    # и счётчики игроков, поэтому одинаковые экраны дают разные картинки (обожглись 26.09).
    param(
        [Parameter(Mandatory)][string]$Package,
        [Parameter(Mandatory)][scriptblock]$Reader,
        [Parameter(Mandatory)][string]$Tag,
        [string]$OutDir,
        [int]$MaxPages = 16,
        [int]$ShotsPerPage = 2,
        [int]$ShotPauseMs = 2200,
        [int]$MaxSide = 1568,
        [double]$SwipeFrom = 0.75,
        [double]$SwipeTo = 0.45,
        [switch]$KeepShots,
        # Без ключа распознавания проход всё равно полезен: снимает лобби и складывает кадры,
        # читать их можно потом. Конец списка в этом режиме не виден — листаем до MaxPages.
        [switch]$NoRead,
        # Клуб, в лобби которого должен оказаться проход: приложение уходит на главный экран
        # само, и без этого шага кадры снимаются с заставки (обожглись 29.09).
        [string]$Club
    )
    if (-not $OutDir) { $OutDir = Join-Path $env:LOCALAPPDATA ("GingerCollector\{0}" -f (Get-Date -Format 'yyyy-MM-dd')) }
    if (-not (Test-Path $OutDir)) { [void](New-Item -ItemType Directory -Path $OutDir -Force) }
    if ($Club -and -not $NoRead) {
        if (-not (Enter-PhoneLobby -Package $Package -Club $Club)) { throw "Cannot reach the $Club lobby in $Package" }
    } elseif (-not (Show-PhoneApp -Package $Package)) {
        throw "Cannot bring $Package to front (top is $(Get-PhoneTopPackage))"
    }

    $cards = [ordered]@{}
    $previousKeys = @()
    $emptyPages = 0
    for ($page = 1; $page -le $MaxPages; $page++) {
        $newOnPage = 0
        $pageKeys = New-Object System.Collections.Generic.List[string]
        for ($shot = 1; $shot -le $ShotsPerPage; $shot++) {
            $path = Join-Path $OutDir ("{0}-p{1:d2}-{2}.png" -f $Tag, $page, $shot)
            [void](Get-PhoneShot -Path $path -MaxSide $MaxSide)
            if ($NoRead) {
                if ($shot -lt $ShotsPerPage) { Start-Sleep -Milliseconds $ShotPauseMs }
                continue
            }
            $items = @(& $Reader $path)
            if ($page -eq 1 -and $shot -eq 1 -and -not $items.Count -and $Club) {
                # Пустая первая страница — либо промо поверх лобби, либо мы не на той вкладке.
                # Переспрашиваем дорогу: Enter-PhoneLobby нажимает только по известным местам
                # и только когда модель подтвердила, что там промо. Раньше здесь была серия
                # тапов вслепую — один из них открыл кэш-стол (30.09), больше так не делаем.
                [void](Enter-PhoneLobby -Package $Package -Club $Club)
                [void](Get-PhoneShot -Path $path -MaxSide $MaxSide)
                $items = @(& $Reader $path)
            }
            foreach ($item in $items) {
                $key = Get-PhoneCardKey $item
                if ($key -eq '|') { continue }
                $pageKeys.Add($key)
                if ($cards.Contains($key)) {
                    $cards[$key] = Merge-PhoneCard -Known $cards[$key] -Fresh $item
                } else {
                    $cards[$key] = $item
                    $newOnPage++
                }
            }
            if (-not $KeepShots -and $shot -lt $ShotsPerPage) { [System.IO.File]::Delete((Resolve-Path $path).Path) }
            if ($shot -lt $ShotsPerPage) { Start-Sleep -Milliseconds $ShotPauseMs }
        }
        if ($NoRead) {
            Write-Host ("  page {0}: кадры сняты" -f $page)
            Invoke-PhoneSwipe -FromY $SwipeFrom -ToY $SwipeTo
            continue
        }
        Write-Host ("  page {0}: +{1} new, {2} total" -f $page, $newOnPage, $cards.Count)

        $keys = @($pageKeys | Select-Object -Unique)
        $sameAsPrevious = $previousKeys.Count -and $keys.Count -eq $previousKeys.Count -and
            -not @(Compare-Object $keys $previousKeys).Count
        if ($sameAsPrevious) { break }
        $previousKeys = $keys
        if ($newOnPage -eq 0) { $emptyPages++ } else { $emptyPages = 0 }
        if ($emptyPages -ge 2) { break }
        Invoke-PhoneSwipe -FromY $SwipeFrom -ToY $SwipeTo
    }
    @($cards.Values)
}

function Invoke-PpMttPassPhone {
    # PPPoker: лента MTT клуба. Читает та же схема, что и на десктопе - приложение одно и то же.
    # Нижняя строка карточки крутится, поэтому кадров на страницу три.
    param([string]$OutDir, [int]$MaxPages = 16, [switch]$KeepShots, [switch]$NoRead, [string]$Club = "Ginger")
    Invoke-PhoneListPass -Package $script:PpPackage -Tag 'pppoker-mtt' -OutDir $OutDir -MaxPages $MaxPages `
        -ShotsPerPage 3 -KeepShots:$KeepShots -NoRead:$NoRead -Club $Club -Reader { param($shot) Read-PpPageHaiku -Shot $shot }
}

function Invoke-XpMttPassPhone {
    # X-Poker: вкладка турниров клуба GINGER+ 2022497. Ниже списка турниров идут SNG и FLASH -
    # их схема отбрасывает сама, а проход останавливается на двух страницах без новых карточек.
    param([string]$OutDir, [int]$MaxPages = 12, [switch]$KeepShots, [switch]$NoRead, [string]$Club = "GINGER +")
    Invoke-PhoneListPass -Package $script:XpPackage -Tag 'xpoker-mtt' -OutDir $OutDir -MaxPages $MaxPages `
        -KeepShots:$KeepShots -NoRead:$NoRead -Club $Club -Reader { param($shot) Read-XpListPageHaiku -Shot $shot }
}

function Invoke-P21MttPassPhone {
    # Poker21: список в один столбец, турниры идут перед кэш-столами. Шрифт мелкий, поэтому
    # кадр не ужимаем - иначе модель начинает путать цифры бай-ина и гарантии.
    # Страниц больше, чем у плитки: в один столбец на экран помещается вдвое меньше карточек
    # (Иван сменил вид лобби 04.10 — читать стало точнее, но листать приходится дольше).
    param([string]$OutDir, [int]$MaxPages = 14, [switch]$KeepShots, [switch]$NoRead, [string]$Club = "Ginger21")
    Invoke-PhoneListPass -Package $script:P21Package -Tag 'poker21-mtt' -OutDir $OutDir -MaxPages $MaxPages `
        -MaxSide 0 -ShotsPerPage 1 -KeepShots:$KeepShots -NoRead:$NoRead -Club $Club -Reader { param($shot) Read-P21PageHaiku -Shot $shot }
}

function Export-PhonePass {
    # Тот же формат файла, что у десктопного прохода: его понимает Send-CollectorSnapshot.
    param([Parameter(Mandatory)]$Cards, [Parameter(Mandatory)][string]$Path)
    $json = @($Cards) | ConvertTo-Json -Depth 6
    [System.IO.File]::WriteAllText($Path, $json, (New-Object System.Text.UTF8Encoding $false))
    $Path
}
