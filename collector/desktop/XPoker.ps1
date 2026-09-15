# Сборщик турниров X-Poker с десктоп-клиента (решение Ивана 15.09: начинаем с X, OCR локальный).
#
# Клиент открыт в лобби клуба Ginger+ с вкладкой MTT. Лента нужна только чтобы найти карточки
# (по словам «15min»); поля берём из карточки турнира — там обычный шрифт.
# Кликаем только карточки в ленте и «назад» в карточке турнира. Кнопки Register/Unregister/Observe
# внизу карточки и плавающие кнопки справа в ленте в зону кликов не попадают.
#
# Что видно в карточке (разбор 15.09):
#   - «Start Time: 09/15 20:00» — только у ещё не начавшихся; у идущих таймер показывает, сколько
#     турнир уже идёт, а цифры таймера OCR не читает. Идущие пропускаем: утренний проход видит
#     будущие, а начавшиеся уже есть в сетке.
#   - у сателлита внизу «Start: 09/18 18:00» — это старт турнира, КУДА он ведёт, не его самого;
#   - описание под названием: «Гарантия 500 000 рублей», «Buy-in - 1000 руб. - 10000 фишек»;
#   - таблица: Buy-in 4.50+4.50+1 (призовые + баунти + комиссия), стек, уровни, записано,
#     ребай, аддон, структура, размер поля.
#
#   . .\collector\desktop\XPoker.ps1
#   Test-XpParseSaved -Paths (Get-ChildItem $env:TEMP\desk\xpoker\detail-*.png).FullName
#   $items = Invoke-XPokerMttPass -MaxCards 40          # сухой прогон, JSON — в %TEMP%\desk\xpoker
#
# Если клиент вывалился из клуба — иконка клуба GINGER+ 2022497 (не общее лобби приложения).
# В строках кода — только латиница: Windows PowerShell 5.1 читает файл без BOM не в UTF-8.

. "$PSScriptRoot\Desk.ps1"
. "$PSScriptRoot\Ocr.ps1"

$script:XpMatch = 'X-Poker'
$script:XpRubPerChip = 100          # Ginger+: 1 фишка = 100 руб. (clubs.chip_value)
$script:XpListTop = 460             # лента карточек — между фильтрами и нижним меню
$script:XpListBottom = 725
$script:XpSafeRight = 395           # правее — плавающие кнопки клуба («+» создаёт стол)
$script:XpBack = @{ X = 24; Y = 34 }

$script:CyrGuarantee = 'Гарант\S*\s+([\d\s]{4,})'   # Гарантия 500 000
$script:CyrChips = [regex]::Unescape('фишек')             # фишек

function Get-XpCardAnchors {
    param([string]$Shot)
    Get-OcrWords -Path $Shot -Lang en-US -Scale 3 |
        Where-Object { $_.Text -match '^\d{1,2}m[il1]n$' -and $_.Y -gt $script:XpListTop -and $_.Y -lt $script:XpListBottom -and $_.X -lt $script:XpSafeRight } |
        Sort-Object Y, X
}

function Get-XpCell {
    # Значение в таблице карточки: та же строка и колонка, что у подписи.
    param($Lines, [string]$Label, [ValidateSet('left', 'right')][string]$Column)
    $band = @($Lines | Where-Object { $_.Y -ge 495 -and $_.Y -le 655 })
    $labelLine = $band | Where-Object { $_.Text -match $Label } | Select-Object -First 1
    if (-not $labelLine) { return $null }
    $min = if ($Column -eq 'left') { 0 } else { 222 }
    $values = $band | Where-Object {
        [math]::Abs($_.Y - $labelLine.Y) -le 8 -and $_.X -ge $min -and $_.X -lt ($min + 223) -and -not ($_.Text -match $Label)
    } | Sort-Object X
    if (-not $values) { return $null }
    # Хвостовое « O» — это значок «?» рядом со значением.
    (($values.Text -join ' ') -replace '\s+O$', '').Trim()
}

function ConvertTo-XpNumber([string]$Text) {
    if (-not $Text) { return $null }
    $clean = $Text -replace '(?<=\d)[Oo]|[Oo](?=\d)', '0' -replace '(?<=\d),(?=\d{3})', ''
    if ($clean -match '\d+(?:\.\d+)?') { return [decimal]$Matches[0] }
    $null
}

function Read-XpTournament {
    param([string]$Shot)
    $en = @(Get-OcrLines -Path $Shot -Lang en-US -Scale 3)
    if (-not ($en | Where-Object { $_.Text -match 'Game Det' })) { return $null }
    $ru = @(Get-OcrLines -Path $Shot -Lang ru -Scale 2 -Gray)
    $all = ($en.Text -join "`n")

    # Название: крупная строка слева от метки MTT-...; кириллицу читает только русский распознаватель.
    $ruName = $ru | Where-Object { $_.Y -ge 305 -and $_.Y -le 332 -and $_.X -lt 350 } | Sort-Object W -Descending | Select-Object -First 1
    $enName = $en | Where-Object { $_.Y -ge 305 -and $_.Y -le 332 } | Sort-Object W -Descending | Select-Object -First 1
    # Английский распознаватель пишет кириллицу кашей со сменой регистра внутри слова («AnxeCTVIB»),
    # русский — наоборот, латиницу кириллицей («гмин кгчоскоит»). Русский берём только в первом случае.
    $enText = if ($enName) { $enName.Text } else { '' }
    $enLooksCyrillic = $enText -cmatch '[a-z][A-Z]'
    $name = if ($ruName -and $enLooksCyrillic -and $ruName.Text -match '[Ѐ-ӿ]{3}') { $ruName.Text } elseif ($enName) { $enText } elseif ($ruName) { $ruName.Text } else { $null }
    if ($name) {
        $name = ($name -replace '\s*MTT-\S+', '' -replace '[^\p{L}\p{N}\s\-\+\.]', '' -replace '\s{2,}', ' ').Trim()
    }

    $startLine = $en | Where-Object { $_.Y -ge 225 -and $_.Y -le 285 -and $_.Text -match 'Start' } | Select-Object -First 1
    if (-not $startLine -or $startLine.Text -notmatch '(\d{2})/(\d{2})\s+(\d{1,2}):(\d{2})') {
        return [pscustomobject]@{ status = 'running'; name = $name; shot = $Shot }
    }
    $now = Get-Date
    $local = Get-Date -Year $now.Year -Month ([int]$Matches[1]) -Day ([int]$Matches[2]) -Hour ([int]$Matches[3]) -Minute ([int]$Matches[4]) -Second 0 -Millisecond 0
    if ($local -lt $now.AddDays(-30)) { $local = $local.AddYears(1) }

    $gameType = $null
    if ($all -match 'MTT-([A-Z0-9]{2,5})') {
        switch -Regex ($Matches[1] -replace '0', 'O') {
            '^NLH$' { $gameType = 'nlh' }
            '^PLO[4]?$' { $gameType = 'plo' }
            '^PLO5$' { $gameType = 'plo5' }
            default { $gameType = 'other' }
        }
    }
    # Метка MTT-... читается не всегда; у клубов союза по умолчанию NLH.
    if (-not $gameType) { $gameType = 'nlh' }

    $buyinRaw = Get-XpCell $en 'Buy.?in' left
    $parts = @([regex]::Matches(($buyinRaw -replace '(?<=\d)[Oo]|[Oo](?=\d)', '0'), '\d+(?:\.\d+)?') | ForEach-Object { [decimal]$_.Value })
    $buyin = if ($parts.Count) { ($parts | Measure-Object -Sum).Sum } else { $null }
    $bountyShare = if ($parts.Count -eq 3 -and ($parts[0] + $parts[1]) -gt 0) { [int][math]::Round($parts[1] / ($parts[0] + $parts[1]) * 100) } else { $null }

    $badge = $en | Where-Object { $_.Text -match '^(MKO|PKO|KO)$' -and $_.Y -lt 340 } | Select-Object -First 1
    $bountyKind = if ($badge) {
        @{ MKO = 'mystery'; PKO = 'pko'; KO = 'ko' }[$badge.Text]
    } elseif ($parts.Count -eq 3) { 'pko' } else { 'none' }

    $description = ($ru | Where-Object { $_.Y -ge 340 -and $_.Y -le 412 }).Text -join ' '
    $guarantee = $null
    if ($description -match $script:CyrGuarantee) {
        $rub = [decimal](($Matches[1]) -replace '\s', '')
        if ($rub -ge 10000) { $guarantee = $rub / $script:XpRubPerChip }
    }
    # «1 000 000 рублей» OCR часто рвёт — тогда гарантия из имени: «SHR 1 MLN GTD», «BOUNTY MAGIC 500K».
    if ($null -eq $guarantee -and $name -match '(\d+(?:[.,]\d+)?)\s*(K|MLN|M)\b') {
        $multiplier = if ($Matches[2] -eq 'K') { 1000 } else { 1000000 }
        $guarantee = [decimal]($Matches[1] -replace ',', '.') * $multiplier / $script:XpRubPerChip
    }

    $lateReg = if ($all -match 'Late Registration:\s*Level\s*(\d+)') { [int]$Matches[1] } else { $null }
    $earlyBonus = $null; $earlyLevels = $null
    if ($all -match '\+\s*(\d{1,3}?)\s*(?:%|0/0|o/o)\s*Chips(?:\s*\(L[VW]([O0-9]+)\))?') {
        $earlyBonus = "+$($Matches[1])% $script:CyrChips"
        if ($Matches[2]) { $lv = [int]($Matches[2] -replace 'O', '0'); if ($lv -gt 0) { $earlyLevels = $lv } }
    }
    $levels = if ((Get-XpCell $en 'Levels' left) -match '\d+(?:/\d+){0,3}') { $Matches[0] } else { $null }
    $rebuy = Get-XpCell $en 'Rebuy' right
    $addon = Get-XpCell $en 'Add.?on' right

    [pscustomobject]@{
        status = 'future'
        starts_at = ([DateTimeOffset]$local).ToString('yyyy-MM-ddTHH:mm:sszzz')
        name = $name
        game_type = $gameType
        bounty_kind = $bountyKind
        buyin = $buyin
        buyin_raw = $buyinRaw
        bounty_share = $bountyShare
        guarantee = $guarantee
        start_stack = ConvertTo-XpNumber (Get-XpCell $en 'Starting Chips' left)
        level_minutes = $levels
        late_reg_levels = $lateReg
        structure = Get-XpCell $en 'Blind Structure' right
        rebuy_terms = if ($rebuy -and $rebuy -notmatch 'Details') { $rebuy } else { $null }
        addon_terms = if ($addon -and $addon -notmatch '^No$') { $addon } else { $null }
        early_bird_bonus = $earlyBonus
        early_bird_levels = $earlyLevels
        entries = Get-XpCell $en '^Entries' left
        players = Get-XpCell $en 'Player Number' right
        shot = $Shot
    }
}

function ConvertTo-XpCollected {
    # Турнир в формате приёма сборщика (POST /collector/runs/{id}/snapshots): только известные поля.
    param($Item)
    $fields = 'starts_at', 'name', 'buyin', 'guarantee', 'bounty_kind', 'game_type', 'start_stack',
        'level_minutes', 'late_reg_levels', 'structure', 'rebuy_terms', 'addon_terms', 'bounty_share',
        'early_bird_bonus', 'early_bird_levels'
    # Параметры приёмник применяет к сетке сам — поэтому мусор OCR отсекаем здесь, до отправки.
    $sane = @{
        buyin = { param($v) $v -ge 0 -and $v -le 100000 }
        guarantee = { param($v) $v -ge 1 -and $v -le 10000000 }
        start_stack = { param($v) $v -ge 500 -and $v -le 10000000 }
        level_minutes = { param($v) "$v" -match '^\d{1,2}(/\d{1,2}){0,3}$' }
        late_reg_levels = { param($v) $v -ge 1 -and $v -le 40 }
        bounty_share = { param($v) $v -ge 1 -and $v -le 100 }
        early_bird_levels = { param($v) $v -ge 1 -and $v -le 50 }
        structure = { param($v) "$v".Length -le 32 }
        rebuy_terms = { param($v) "$v".Length -le 32 }
        addon_terms = { param($v) "$v".Length -le 32 }
    }
    $out = [ordered]@{}
    foreach ($field in $fields) {
        $value = $Item.$field
        if ($null -eq $value -or "$value" -eq '') { continue }
        if ($sane.ContainsKey($field) -and -not (& $sane[$field] $value)) { continue }
        $out[$field] = $value
    }
    [pscustomobject]$out
}

function Test-XpParseSaved {
    param([string[]]$Paths)
    foreach ($path in $Paths) {
        "##### $([IO.Path]::GetFileName($path))"
        $item = Read-XpTournament $path
        if (-not $item) { 'not a tournament card'; continue }
        $item | Select-Object * -ExcludeProperty shot | Format-List | Out-String -Width 200
    }
}

function Test-XpClubLobby {
    param([string]$Shot)
    [bool](Get-OcrLines -Path $Shot -Lang en-US -Scale 2 | Where-Object { $_.Text -match '2022497' })
}

function Invoke-XPokerMttPass {
    param([int]$MaxCards = 60, [int]$MaxScrolls = 15, [switch]$FromTop)
    $dir = Join-Path $env:TEMP 'desk\xpoker'
    New-Item -ItemType Directory -Force $dir | Out-Null
    if ($FromTop) {
        # Лента могла остаться прокрученной — сначала в самый верх.
        for ($i = 0; $i -lt 8; $i++) { Invoke-WindowPostDrag -Match $script:XpMatch -X 222 -Y 480 -ToX 222 -ToY 720 -Steps 12; Start-Sleep -Milliseconds 500 }
        Start-Sleep -Seconds 2
    }
    $seen = @{}
    $items = New-Object System.Collections.Generic.List[object]
    $opened = 0
    $idle = 0

    for ($scroll = 0; $scroll -le $MaxScrolls -and $opened -lt $MaxCards; $scroll++) {
        $listShot = Join-Path $dir "list-$scroll.png"
        Save-WindowShot -Match $script:XpMatch -Path $listShot | Out-Null
        if (-not (Test-XpClubLobby $listShot)) { Write-Warning 'Not in Ginger+ club lobby - stop'; break }
        $anchors = @(Get-XpCardAnchors $listShot)
        $newHere = 0

        foreach ($anchor in $anchors) {
            if ($opened -ge $MaxCards) { break }
            $tapX = $anchor.X + 5; $tapY = $anchor.Y - 30
            Invoke-WindowPostClick -Match $script:XpMatch -X $tapX -Y $tapY
            Start-Sleep -Milliseconds 3500
            $detailShot = Join-Path $dir ("detail-{0:D2}-{1:D2}.png" -f $scroll, $opened)
            Save-WindowShot -Match $script:XpMatch -Path $detailShot | Out-Null
            $item = Read-XpTournament $detailShot
            if (-not $item) {
                # Карточка не открылась — «назад» не жмём: из лобби он выводит из клуба.
                Write-Warning "Card at $tapX,$tapY did not open"
                continue
            }
            $opened++
            Invoke-WindowPostClick -Match $script:XpMatch -X $script:XpBack.X -Y $script:XpBack.Y
            Start-Sleep -Milliseconds 2500
            $key = "$($item.status)|$($item.starts_at)|$($item.name)|$($item.buyin_raw)"
            if (-not $seen.ContainsKey($key)) {
                $seen[$key] = $true
                $items.Add($item)
                $newHere++
            }
            $backShot = Join-Path $dir 'back.png'
            Save-WindowShot -Match $script:XpMatch -Path $backShot | Out-Null
            if (-not (Test-XpClubLobby $backShot)) { Write-Warning 'Lost the club lobby after back - stop'; $scroll = $MaxScrolls + 1; break }
        }

        if ($newHere -eq 0) { $idle++ } else { $idle = 0 }
        if ($idle -ge 2 -or $scroll -gt $MaxScrolls) { break }
        Invoke-WindowPostDrag -Match $script:XpMatch -X 222 -Y 700 -ToX 222 -ToY 480
        Start-Sleep -Seconds 2
    }

    $out = Join-Path $dir ("xpoker-mtt-{0:yyyyMMdd-HHmm}.json" -f (Get-Date))
    $items | ConvertTo-Json -Depth 4 | Out-File -FilePath $out -Encoding utf8
    Write-Host ("saved {0} ({1} future, {2} running) -> {3}" -f $items.Count, @($items | Where-Object status -eq 'future').Count, @($items | Where-Object status -eq 'running').Count, $out)
    $items
}
