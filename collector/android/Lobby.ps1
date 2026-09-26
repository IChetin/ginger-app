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
#
# В строках кода - только латиница (Windows PowerShell 5.1).

. "$PSScriptRoot\Adb.ps1"
. "$PSScriptRoot\..\desktop\Haiku.ps1"

$script:PpPackage = 'com.lein.pppoker.android'
$script:XpPackage = 'com.game.android.xpoker'
$script:SupremaPackage = 'com.opt.supremapoker'

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
This is the MTT tab of a club lobby in the X-Poker mobile app. Extract every tournament row, top to bottom. Skip banners, filters and tabs.

For each row:
- name: the tournament title exactly as written (Latin or Cyrillic). Decorative icons (trophy, diamond, crown, globe) are not letters.
- buyin: the number in the "Buy-in" cell or pill; null if not visible.
- game: from the badge "MTT-NLH" (nlh), "MTT-PLO4" or "PLO4" (plo), "MTT-PLO5" or "PLO5" (plo5), else other.
- bounty: badge next to the title: MKO -> mystery, PKO -> pko, KO -> ko, else none.
- guarantee_rub: guarantee in rubles if the row shows one ("500 000", "1 MLN" -> 1000000); null otherwise. Never use the current prize pool.
- start_time: "MM/DD HH:MM" if the row shows a start date and time, "HH:MM" if only the time is shown, else null.
- status: "running" if the row says registration is closed or the tournament is late-registering, "future" if it shows a start time, else "unknown".
- entries: the registered players counter if visible ("18/34" -> 18), else null.
- fully_visible: false if the row is cut off by the top or bottom edge of the screen.
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

function ConvertTo-PhoneStart {
    # "MM/DD HH:MM" или "HH:MM" -> ISO с поясом. Без даты считаем ближайшее наступление времени.
    param([string]$Text)
    if (-not $Text) { return $null }
    $now = Get-Date
    if ($Text -match '^(\d{1,2})/(\d{1,2})\s+(\d{1,2}):(\d{2})$') {
        $local = Get-Date -Year $now.Year -Month ([int]$Matches[1]) -Day ([int]$Matches[2]) `
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
    # Останов: список перестал двигаться (кадр совпал с прошлым) либо две страницы без новых карточек.
    param(
        [Parameter(Mandatory)][string]$Package,
        [Parameter(Mandatory)][scriptblock]$Reader,
        [Parameter(Mandatory)][string]$Tag,
        [string]$OutDir,
        [int]$MaxPages = 12,
        [int]$ShotsPerPage = 3,
        [int]$ShotPauseMs = 1300,
        [switch]$KeepShots
    )
    if (-not $OutDir) { $OutDir = Join-Path $env:LOCALAPPDATA ("GingerCollector\{0}" -f (Get-Date -Format 'yyyy-MM-dd')) }
    if (-not (Test-Path $OutDir)) { [void](New-Item -ItemType Directory -Path $OutDir -Force) }

    $top = Get-PhoneTopPackage
    if ($top -ne $Package) {
        if (-not (Start-PhoneApp -Package $Package)) { throw "Cannot bring $Package to front (top is $top)" }
        Start-Sleep -Seconds 6
    }

    $cards = [ordered]@{}
    $previousHash = $null
    $emptyPages = 0
    for ($page = 1; $page -le $MaxPages; $page++) {
        $newOnPage = 0
        $pageHash = $null
        for ($shot = 1; $shot -le $ShotsPerPage; $shot++) {
            $path = Join-Path $OutDir ("{0}-p{1:d2}-{2}.png" -f $Tag, $page, $shot)
            [void](Get-PhoneShot -Path $path)
            if ($shot -eq 1) { $pageHash = (Get-FileHash $path -Algorithm MD5).Hash }
            $items = @(& $Reader $path)
            foreach ($item in $items) {
                $key = Get-PhoneCardKey $item
                if ($key -eq '|') { continue }
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
        Write-Host ("  page {0}: +{1} new, {2} total" -f $page, $newOnPage, $cards.Count)
        if ($previousHash -and $pageHash -eq $previousHash) { break }
        $previousHash = $pageHash
        if ($newOnPage -eq 0) { $emptyPages++ } else { $emptyPages = 0 }
        if ($emptyPages -ge 2) { break }
        Invoke-PhoneSwipe -FromY 0.78 -ToY 0.32
    }
    @($cards.Values)
}

function Invoke-PpMttPassPhone {
    # PPPoker: лента MTT клуба Ginger. Читает та же схема, что и на десктопе - приложение одно и то же.
    param([string]$OutDir, [int]$MaxPages = 12, [switch]$KeepShots)
    Invoke-PhoneListPass -Package $script:PpPackage -Tag 'pppoker-mtt' -OutDir $OutDir -MaxPages $MaxPages `
        -KeepShots:$KeepShots -Reader { param($shot) Read-PpPageHaiku -Shot $shot }
}

function Invoke-XpMttPassPhone {
    # X-Poker: вкладка MTT клуба GINGER+ 2022497. Карточки не открываем - список даёт всё для сетки.
    param([string]$OutDir, [int]$MaxPages = 12, [switch]$KeepShots)
    Invoke-PhoneListPass -Package $script:XpPackage -Tag 'xpoker-mtt' -OutDir $OutDir -MaxPages $MaxPages `
        -KeepShots:$KeepShots -Reader { param($shot) Read-XpListPageHaiku -Shot $shot }
}

function Export-PhonePass {
    # Тот же формат файла, что у десктопного прохода: его понимает Send-CollectorSnapshot.
    param([Parameter(Mandatory)]$Cards, [Parameter(Mandatory)][string]$Path)
    $json = @($Cards) | ConvertTo-Json -Depth 6
    [System.IO.File]::WriteAllText($Path, $json, (New-Object System.Text.UTF8Encoding $false))
    $Path
}
