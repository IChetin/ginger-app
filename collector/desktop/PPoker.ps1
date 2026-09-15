# Сборщик турниров PPPoker с десктоп-клиента (после X-Poker, решение Ивана 15.09).
#
# Клиент в лобби клуба Ginger с вкладкой MTT. Приложение рисуется колонкой 620x1110 в левом
# верхнем углу большого окна — снимки обрезаем до неё, координаты кликов те же.
#
# Лента PPPoker читается OCR хорошо (обычный шрифт), поэтому ядро расписания берём из ленты,
# без открытия карточек (разбор 15.09):
#   - строка названия; «Buy-in: 16»; «PPST NLH / PPST PLO5»; значок PKO/MKO у бай-ина;
#   - строка «записано/лимит» и «N min» (длина уровня);
#   - нижняя строка ЧЕРЕДУЕТСЯ: гарантия «564+36» и «Start Time: 09/16 03:00» — поэтому по каждой
#     странице делаем несколько снимков с паузой и склеиваем карточку по имени и бай-ину;
#   - у начавшихся — «Registration closes in N min» / «Registration ended»: пропускаем.
# Стек, ребай, поздняя рега и доля баунти — в карточке турнира (Game Info → Details); это следующий шаг.
#
#   . .\collector\desktop\PPoker.ps1
#   Test-PpParseSaved -Paths (Get-ChildItem $env:TEMP\desk\mtt\pp-*.png).FullName
#   $items = Invoke-PPokerMttPass -FromTop
#
# В строках кода — только латиница (Windows PowerShell 5.1).

. "$PSScriptRoot\Desk.ps1"
. "$PSScriptRoot\Ocr.ps1"

$script:PpMatch = '^PPPoker$'
$script:PpWidth = 620
$script:PpHeight = 1110
$script:PpListTop = 400
$script:PpListBottom = 1060

function Save-PpShot {
    param([Parameter(Mandatory)][string]$Path)
    $raw = "$Path.raw.png"
    Save-WindowShot -Match $script:PpMatch -Path $raw | Out-Null
    $image = [System.Drawing.Image]::FromFile($raw)
    $bitmap = New-Object System.Drawing.Bitmap $script:PpWidth, $script:PpHeight
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $rect = New-Object System.Drawing.Rectangle 0, 0, $script:PpWidth, $script:PpHeight
    $graphics.DrawImage($image, $rect, $rect, [System.Drawing.GraphicsUnit]::Pixel)
    $graphics.Dispose(); $image.Dispose()
    $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png); $bitmap.Dispose()
    [System.IO.File]::Delete($raw)
}

function ConvertTo-PpNumber([string]$Text) {
    if (-not $Text) { return $null }
    $clean = $Text -replace '(?<=\d)[Oo]|[Oo](?=\d)', '0' -replace '(?<=\d),(?=\d{3})', ''
    if ($clean -match '\d+(?:\.\d+)?') { return [decimal]$Matches[0] }
    $null
}

function Read-PpListCards {
    param([string]$Shot)
    $lines = @(Get-OcrLines -Path $Shot -Lang en-US -Scale 2 | Where-Object { $_.Y -ge $script:PpListTop -and $_.Y -le $script:PpListBottom })
    $anchors = $lines | Where-Object { $_.X -lt 260 -and $_.Text -match '^Buy.?in:?\s*[\dOo]' }
    foreach ($anchor in $anchors) {
        $near = {
            param([int]$Dy, [int]$Tolerance, [int]$MinX, [int]$MaxX)
            $lines | Where-Object { [math]::Abs($_.Y - ($anchor.Y + $Dy)) -le $Tolerance -and $_.X -ge $MinX -and $_.X -lt $MaxX }
        }
        $nameLine = & $near -20 10 260 560 | Sort-Object W -Descending | Select-Object -First 1
        if (-not $nameLine) { continue }
        $name = $nameLine.Text
        # Иконка-глобус перед названием иногда читается буквой: «e MICRO Z».
        if ($nameLine.X -lt 290 -and $name -match '^\S\s+(.+)$') { $name = $Matches[1] }
        $name = ($name -replace '(?<=[A-Z])0(?=[A-Z0-9])', 'O' -replace '\s{2,}', ' ').Trim()

        $gameText = (((& $near 22 12 60 262).Text -join ' ') + ' ' + $name) -replace '0', 'O'
        $gameType = switch -Regex ($gameText) {
            'PLO5' { 'plo5'; break }
            'PLO4|PLO\b' { 'plo'; break }
            'PLO6|OFC|SD' { 'other'; break }
            default { 'nlh' }
        }
        $badgeText = ((& $near 27 14 195 268).Text -join ' ') + ' ' + $name
        $bountyKind = if ($badgeText -match '\bMKO\b|MYSTERY') { 'mystery' } elseif ($badgeText -match '\bPKO\b') { 'pko' } elseif ($badgeText -match '\bKO\b') { 'ko' } else { 'none' }

        $stat = ((& $near 14 10 260 600).Text -join ' ') -replace '(?<=\d)[Oo]|[Oo](?=\d)', '0'
        $entries = $null; $maxEntries = $null; $levelMinutes = $null
        if ($stat -match '(\d+)\s*/\s*(\d+)') { $entries = [int]$Matches[1]; $maxEntries = [int]$Matches[2] }
        elseif ($stat -match '^\D*(\d+)\s') { $entries = [int]$Matches[1] }
        if ($stat -match '(\d{1,2})\s*min') { $levelMinutes = [int]$Matches[1] }

        $info = ((& $near 41 12 260 600).Text -join ' ')
        $startsAt = $null; $guarantee = $null; $status = 'unknown'
        if ($info -match 'Start\s*Time:?\s*(\d{2})\s*/\s*(\d)\s?(\d)\s+(\d{1,2}):(\d{2})') {
            $now = Get-Date
            $local = Get-Date -Year $now.Year -Month ([int]$Matches[1]) -Day ([int]"$($Matches[2])$($Matches[3])") -Hour ([int]$Matches[4]) -Minute ([int]$Matches[5]) -Second 0 -Millisecond 0
            if ($local -lt $now.AddDays(-30)) { $local = $local.AddYears(1) }
            $startsAt = ([DateTimeOffset]$local).ToString('yyyy-MM-ddTHH:mm:sszzz')
            $status = 'future'
        } elseif ($info -match 'Registration') {
            $status = 'running'
        } elseif ($info -match '([\d.,]+)\s*\+\s*([\d.,]+)') {
            $guarantee = (ConvertTo-PpNumber $Matches[1]) + (ConvertTo-PpNumber $Matches[2])
        } elseif ($info -match '^\D{0,3}([\d][\d.,]*)\s*$') {
            $guarantee = ConvertTo-PpNumber $Matches[1]
        }

        [pscustomobject]@{
            name = $name
            buyin = ConvertTo-PpNumber ($anchor.Text -replace '^Buy.?in:?\s*', '')
            game_type = $gameType
            bounty_kind = $bountyKind
            entries = $entries
            max_entries = $maxEntries
            level_minutes = $levelMinutes
            guarantee = $guarantee
            starts_at = $startsAt
            status = $status
            y = $anchor.Y
        }
    }
}

function Merge-PpCard {
    # Карточка с разных снимков: время старта и гарантия приходят по очереди.
    param([hashtable]$Cards, $Card)
    $key = "$($Card.name)|$($Card.buyin)"
    if (-not $Cards.ContainsKey($key)) { $Cards[$key] = $Card; return $true }
    $known = $Cards[$key]
    foreach ($field in 'starts_at', 'guarantee', 'entries', 'max_entries', 'level_minutes') {
        if ($null -eq $known.$field -and $null -ne $Card.$field) { $known.$field = $Card.$field }
    }
    if ($Card.status -eq 'running') { $known.status = 'running' }
    elseif ($known.status -eq 'unknown' -and $Card.status -eq 'future') { $known.status = 'future' }
    $false
}

function Test-PpParseSaved {
    param([string[]]$Paths)
    foreach ($path in $Paths) {
        "##### $([IO.Path]::GetFileName($path))"
        Read-PpListCards $path | Select-Object name, buyin, game_type, bounty_kind, entries, max_entries, level_minutes, guarantee, starts_at, status |
            Format-Table -AutoSize | Out-String -Width 220
    }
}

function Invoke-PPokerMttPass {
    param([int]$MaxPages = 30, [int]$ShotsPerPage = 3, [switch]$FromTop)
    $dir = Join-Path $env:TEMP 'desk\pp'
    New-Item -ItemType Directory -Force $dir | Out-Null
    if ($FromTop) {
        # PPPoker ignores message drags and wheel (test 15.09) - scroll with the real cursor; pull until the top card stops changing.
        $previous = $null; $same = 0
        for ($i = 0; $i -lt 60 -and $same -lt 2; $i++) {
            Invoke-WindowDrag -Match $script:PpMatch -X 330 -Y 480 -ToX 330 -ToY 1050 -Steps 20; Start-Sleep -Milliseconds 700
            $probe = Join-Path $dir 'top-probe.png'
            Save-PpShot -Path $probe
            $top = (Read-PpListCards $probe | Select-Object -First 1).name
            if ($top -and $top -eq $previous) { $same++ } else { $same = 0 }
            $previous = $top
        }
        Start-Sleep -Seconds 1
    }
    $cards = @{}
    $idle = 0
    for ($page = 0; $page -lt $MaxPages; $page++) {
        $new = 0
        for ($shot = 0; $shot -lt $ShotsPerPage; $shot++) {
            $path = Join-Path $dir ("list-{0:D2}-{1}.png" -f $page, $shot)
            Save-PpShot -Path $path
            foreach ($card in Read-PpListCards $path) { if (Merge-PpCard $cards $card) { $new++ } }
            if ($shot -lt $ShotsPerPage - 1) { Start-Sleep -Milliseconds 2800 }
        }
        if ($new -eq 0) { $idle++ } else { $idle = 0 }
        if ($idle -ge 2) { break }
        Invoke-WindowDrag -Match $script:PpMatch -X 330 -Y 1000 -ToX 330 -ToY 560 -Steps 25
        Start-Sleep -Seconds 2
    }
    $items = @($cards.Values | Sort-Object { if ($_.starts_at) { $_.starts_at } else { 'z' } }, name)
    $out = Join-Path $dir ("pppoker-mtt-{0:yyyyMMdd-HHmm}.json" -f (Get-Date))
    $items | ConvertTo-Json -Depth 4 | Out-File -FilePath $out -Encoding utf8
    Write-Host ("saved {0} cards ({1} with start, {2} running) -> {3}" -f $items.Count, @($items | Where-Object starts_at).Count, @($items | Where-Object status -eq 'running').Count, $out)
    $items
}
