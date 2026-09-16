# Отчёт для проверки глазами: что сборщик вытащил из лобби (HTML по JSON проходов).
#
#   . .\collector\desktop\Report.ps1
#   New-CollectorReport -XPokerJson ... -PPokerJson ... -Out report.html
#
# Метки: уйдёт на сервер / уже идёт / нет старта / отсечено (проверки ConvertTo-XpCollected) /
# проверить имя (иконка прилипла к началу). Суммы: Ginger+ — фишки x 100 руб., Ginger — фишки = $.
# Windows PowerShell 5.1: внутри [ordered]@{} не ставить if и конвейеры («Argument types do not match») —
# значения считаются заранее. Русский текст в строках — файл сохраняется с BOM.

. "$PSScriptRoot\XPoker.ps1"

function Read-PassJson([string]$Path) {
    if (-not $Path -or -not (Test-Path $Path)) { return @() }
    $parsed = Get-Content $Path -Raw -Encoding UTF8 | ConvertFrom-Json
    $items = @($parsed | ForEach-Object { $_ })
    foreach ($item in $items) {
        if ($item.starts_at -is [datetime]) { $item.starts_at = ([DateTimeOffset]$item.starts_at).ToString('yyyy-MM-ddTHH:mm:sszzz') }
    }
    $items
}

function Format-Money([object]$Chips, [decimal]$Rate, [string]$Currency) {
    if ($null -eq $Chips -or "$Chips" -eq '') { return $null }
    $value = [decimal]$Chips
    $result = @{}
    if ($Currency -eq 'RUB') {
        $result.money = ('{0:N0}' -f ($value * $Rate)) + ' ₽'
        $result.chips = ('{0:0.##}' -f $value) + ' фиш.'
    } else {
        $result.money = '$' + ('{0:0.##}' -f ($value * $Rate))
        $result.chips = $null
    }
    $result
}

function Format-Start([string]$Iso) {
    if (-not $Iso) { return $null }
    $moment = [DateTimeOffset]::Parse($Iso, [Globalization.CultureInfo]::InvariantCulture)
    $moment.ToString('dd.MM ddd HH:mm', [Globalization.CultureInfo]::GetCultureInfo('ru-RU'))
}

function Test-StartedAlready([string]$Iso) {
    [DateTimeOffset]::Parse($Iso, [Globalization.CultureInfo]::InvariantCulture) -lt [DateTimeOffset]::Now
}

function Get-NameFlag([string]$Name) {
    # Иконка перед названием читается лишней заглавной буквой: «PSHR», «PGRAND», «OFREEROLL».
    if ($Name -cmatch '^(P|O|S)(SHR|GRAND|FREEROLL|BOUNTY)') { return @{ kind = 'bad'; text = 'проверить имя' } }
    if ($Name -match 'Turbo\s+\d{4,}$') { return @{ kind = 'bad'; text = 'проверить имя' } }
    $null
}

$script:Games = @{ nlh = 'NLH'; plo = 'PLO'; plo5 = 'PLO5'; other = 'другая' }
$script:Bounty = @{ none = $null; pko = 'PKO'; ko = 'KO'; mystery = 'Mystery' }

function New-ReportRow {
    param($Time, $Name, $Buyin, $Guarantee, $Game, $Bounty, $Stack, $Levels, $Late, $Extras, $Flags, $Skip)
    $row = [ordered]@{}
    $row.time = $Time
    $row.name = $Name
    $row.rawName = $null
    $row.buyin = $Buyin
    $row.guarantee = $Guarantee
    $row.game = $Game
    $row.bounty = $Bounty
    $row.stack = $Stack
    $row.levels = $Levels
    $row.late = $Late
    $row.extras = [object[]]$Extras
    $row.flags = [object[]]$Flags
    $row.skip = [bool]$Skip
    $row
}

function Get-SortedPassItems($Items) {
    $Items | Sort-Object @{ Expression = { if ($_.starts_at) { $_.starts_at } else { 'z' } } }, name
}

function Get-XpRows([object[]]$Items) {
    $rows = New-Object System.Collections.Generic.List[object]
    foreach ($item in (Get-SortedPassItems $Items)) {
        $flags = New-Object System.Collections.Generic.List[object]
        $skip = $false
        if ($item.status -ne 'future') {
            $skip = $true
            $flags.Add(@{ kind = 'skip'; text = 'уже идёт' })
        } else {
            $sent = ConvertTo-XpCollected $item
            $sentNames = @($sent.PSObject.Properties.Name)
            if (Test-StartedAlready $item.starts_at) {
                $skip = $true
                $flags.Add(@{ kind = 'skip'; text = 'уже начался' })
            } else {
                $flags.Add(@{ kind = 'ok'; text = 'уйдёт на сервер' })
            }
            foreach ($field in 'start_stack', 'level_minutes', 'late_reg_levels', 'guarantee', 'bounty_share', 'rebuy_terms', 'addon_terms', 'structure') {
                $value = $item.$field
                if ($null -ne $value -and "$value" -ne '' -and $sentNames -notcontains $field) {
                    $flags.Add(@{ kind = 'warn'; text = "отсечено: $field = $value" })
                }
            }
            if ($null -eq $item.guarantee) { $flags.Add(@{ kind = 'warn'; text = 'нет гарантии' }) }
        }
        $nameFlag = Get-NameFlag $item.name
        if ($nameFlag) { $flags.Add($nameFlag) }

        $extras = New-Object System.Collections.Generic.List[string]
        if ($item.rebuy_terms) { $extras.Add("ребай $($item.rebuy_terms)") }
        if ($item.addon_terms) { $extras.Add("аддон $($item.addon_terms)") }
        if ($item.early_bird_bonus) { $extras.Add("EB $($item.early_bird_bonus)") }
        if ($item.structure) { $extras.Add([string]$item.structure) }

        $bounty = $script:Bounty["$($item.bounty_kind)"]
        if ($item.bounty_share) { $bounty = "$bounty · $($item.bounty_share)% в баунти" }
        $stack = $null
        if ($item.start_stack) { $stack = '{0:N0}' -f [decimal]$item.start_stack }
        $buyin = Format-Money $item.buyin 100 'RUB'
        $guarantee = Format-Money $item.guarantee 100 'RUB'
        $game = $script:Games["$($item.game_type)"]
        $time = Format-Start $item.starts_at

        $rows.Add((New-ReportRow -Time $time -Name $item.name -Buyin $buyin -Guarantee $guarantee -Game $game `
            -Bounty $bounty -Stack $stack -Levels $item.level_minutes -Late $item.late_reg_levels `
            -Extras $extras.ToArray() -Flags $flags.ToArray() -Skip $skip))
    }
    , $rows.ToArray()
}

function Get-PpRows([object[]]$Items) {
    $rows = New-Object System.Collections.Generic.List[object]
    foreach ($item in (Get-SortedPassItems $Items)) {
        $flags = New-Object System.Collections.Generic.List[object]
        $skip = $true
        if ($item.status -eq 'running') {
            $flags.Add(@{ kind = 'skip'; text = 'уже идёт' })
        } elseif (-not $item.starts_at) {
            $flags.Add(@{ kind = 'warn'; text = 'нет старта' })
        } elseif (Test-StartedAlready $item.starts_at) {
            $flags.Add(@{ kind = 'skip'; text = 'уже начался' })
        } else {
            $skip = $false
            $flags.Add(@{ kind = 'ok'; text = 'уйдёт на сервер' })
        }
        $nameFlag = Get-NameFlag $item.name
        if ($nameFlag) { $flags.Add($nameFlag) }

        $extras = New-Object System.Collections.Generic.List[string]
        if ($null -ne $item.entries) {
            if ($item.max_entries) { $extras.Add("записано $($item.entries)/$($item.max_entries)") }
            else { $extras.Add("записано $($item.entries)") }
        }
        $levels = $null
        if ($item.level_minutes) { $levels = [string]$item.level_minutes }
        $buyin = Format-Money $item.buyin 1 'USD'
        $guarantee = Format-Money $item.guarantee 1 'USD'
        $game = $script:Games["$($item.game_type)"]
        $bounty = $script:Bounty["$($item.bounty_kind)"]
        $time = Format-Start $item.starts_at

        $rows.Add((New-ReportRow -Time $time -Name $item.name -Buyin $buyin -Guarantee $guarantee -Game $game `
            -Bounty $bounty -Stack $null -Levels $levels -Late $null `
            -Extras $extras.ToArray() -Flags $flags.ToArray() -Skip $skip))
    }
    , $rows.ToArray()
}

function Get-RowCounts($Rows) {
    $counts = [ordered]@{ send = 0; nostart = 0; running = 0; check = 0 }
    foreach ($row in $Rows) {
        $kinds = @($row.flags | ForEach-Object { $_.kind })
        $texts = @($row.flags | ForEach-Object { $_.text })
        if ($kinds -contains 'ok') { $counts.send++ }
        if ($texts -contains 'нет старта') { $counts.nostart++ }
        if ($kinds -contains 'skip') { $counts.running++ }
        if ($kinds -contains 'warn' -or $kinds -contains 'bad') { $counts.check++ }
    }
    $counts
}

function New-CollectorReport {
    param([string]$XPokerJson, [string]$PPokerJson, [Parameter(Mandatory)][string]$Out)
    $xpRows = Get-XpRows @(Read-PassJson $XPokerJson)
    $ppRows = Get-PpRows @(Read-PassJson $PPokerJson)
    $sources = @(
        @{ title = 'Ginger+'; app = 'X-Poker'; rows = $xpRows; source = $XPokerJson; meta = 'Данные — из карточки каждого турнира. Суммы: фишки x 100 ₽.' },
        @{ title = 'Ginger'; app = 'PPPoker'; rows = $ppRows; source = $PPokerJson; meta = 'Данные — из ленты турниров союза, без открытия карточек: стека и поздней регистрации пока нет. Суммы: 1 фишка = $1.' }
    )
    $clubs = New-Object System.Collections.Generic.List[object]
    foreach ($club in $sources) {
        $passAt = 'нет данных'
        if ($club.source -and (Test-Path $club.source)) { $passAt = (Get-Item $club.source).LastWriteTime.ToString('dd.MM HH:mm') }
        $entry = [ordered]@{}
        $entry.title = $club.title
        $entry.app = $club.app
        $entry.meta = "$($club.meta) Проход: $passAt."
        $entry.counts = Get-RowCounts $club.rows
        $entry.rows = [object[]]$club.rows
        $clubs.Add($entry)
    }
    $data = [ordered]@{}
    $data.stamp = 'Сухой проход · ' + (Get-Date).ToString('d MMMM yyyy, HH:mm', [Globalization.CultureInfo]::GetCultureInfo('ru-RU')) + ' МСК'
    $data.clubs = $clubs.ToArray()
    $json = ($data | ConvertTo-Json -Depth 8 -Compress) -replace '</', '<\/'
    $template = [System.IO.File]::ReadAllText((Join-Path $PSScriptRoot 'report-template.html'), [System.Text.Encoding]::UTF8)
    [System.IO.File]::WriteAllText($Out, $template.Replace('__DATA__', $json), (New-Object System.Text.UTF8Encoding $false))
    $Out
}
