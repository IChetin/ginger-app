# Отчёт для проверки глазами: что сборщик вытащил из лобби (HTML по JSON проходов).
#
#   . .\collector\desktop\Report.ps1
#   New-CollectorReport -XPokerJson ... -PPokerJson ... -Out report.html
#
# Метки: уйдёт на сервер / уже идёт / нет старта / отсечено (проверки ConvertTo-XpCollected) /
# проверить имя (иконка прилипла к началу). Суммы: Ginger+ — фишки x 100 руб., Ginger — фишки = $.

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
    $culture = [Globalization.CultureInfo]::GetCultureInfo('ru-RU')
    if ($Currency -eq 'RUB') {
        return @{ money = [string]::Format($culture, '{0:#,0} ₽', $value * $Rate); chips = [string]::Format($culture, '{0:#,0.##} фиш.', $value) }
    }
    @{ money = '$' + [string]::Format($culture, '{0:#,0.##}', $value * $Rate); chips = $null }
}

function Format-Start([string]$Iso) {
    if (-not $Iso) { return $null }
    ([DateTimeOffset]::Parse($Iso, [Globalization.CultureInfo]::InvariantCulture)).ToString('dd.MM ddd HH:mm', [Globalization.CultureInfo]::GetCultureInfo('ru-RU'))
}

function Get-NameFlag([string]$Name) {
    # Иконка перед названием читается лишней заглавной буквой: «PSHR», «PGRAND», «OFREEROLL».
    if ($Name -cmatch '^(P|O|S)(SHR|GRAND|FREEROLL|BOUNTY)') { return @{ kind = 'bad'; text = 'проверить имя' } }
    if ($Name -match '\d{4,}\s*$' -and $Name -match 'Turbo') { return @{ kind = 'bad'; text = 'проверить имя' } }
    $null
}

$script:Games = @{ nlh = 'NLH'; plo = 'PLO'; plo5 = 'PLO5'; other = 'другая' }
$script:Bounty = @{ none = $null; pko = 'PKO'; ko = 'KO'; mystery = 'Mystery' }

function Get-XpRows([object[]]$Items) {
    $now = [DateTimeOffset]::Now
    foreach ($item in ($Items | Sort-Object @{ e = { if ($_.starts_at) { $_.starts_at } else { 'z' } } }, name)) {
        $flags = New-Object System.Collections.Generic.List[object]
        $skip = $false
        if ($item.status -ne 'future') {
            $skip = $true
            $flags.Add(@{ kind = 'skip'; text = 'уже идёт' })
        } else {
            $sent = ConvertTo-XpCollected $item
            $sentNames = @($sent.PSObject.Properties.Name)
            $dropped = @('start_stack', 'level_minutes', 'late_reg_levels', 'guarantee', 'bounty_share', 'rebuy_terms', 'addon_terms', 'structure') |
                Where-Object { $null -ne $item.$_ -and "$($item.$_)" -ne '' -and $sentNames -notcontains $_ }
            $starts = [DateTimeOffset]::Parse($item.starts_at, [Globalization.CultureInfo]::InvariantCulture)
            if ($starts -lt $now) { $flags.Add(@{ kind = 'skip'; text = 'уже начался' }); $skip = $true }
            else { $flags.Add(@{ kind = 'ok'; text = 'уйдёт на сервер' }) }
            foreach ($field in $dropped) { $flags.Add(@{ kind = 'warn'; text = "отсечено: $field = $($item.$field)" }) }
            if ($null -eq $item.guarantee) { $flags.Add(@{ kind = 'warn'; text = 'нет гарантии' }) }
        }
        $nameFlag = Get-NameFlag $item.name
        if ($nameFlag) { $flags.Add($nameFlag) }
        $extras = @()
        if ($item.rebuy_terms) { $extras += "ребай $($item.rebuy_terms)" }
        if ($item.addon_terms) { $extras += "аддон $($item.addon_terms)" }
        if ($item.early_bird_bonus) { $extras += "EB $($item.early_bird_bonus)" }
        if ($item.structure) { $extras += $item.structure }
        [ordered]@{
            time = Format-Start $item.starts_at
            name = $item.name
            rawName = $null
            buyin = Format-Money $item.buyin 100 'RUB'
            guarantee = Format-Money $item.guarantee 100 'RUB'
            game = $script:Games["$($item.game_type)"]
            bounty = if ($item.bounty_share) { "$($script:Bounty["$($item.bounty_kind)"]) · $($item.bounty_share)% в баунти" } else { $script:Bounty["$($item.bounty_kind)"] }
            stack = if ($item.start_stack) { [string]::Format([Globalization.CultureInfo]::GetCultureInfo('ru-RU'), '{0:#,0}', [decimal]$item.start_stack) } else { $null }
            levels = $item.level_minutes
            late = $item.late_reg_levels
            extras = @($extras)
            flags = @($flags)
            skip = $skip
        }
    }
}

function Get-PpRows([object[]]$Items) {
    $now = [DateTimeOffset]::Now
    foreach ($item in ($Items | Sort-Object @{ e = { if ($_.starts_at) { $_.starts_at } else { 'z' } } }, name)) {
        $flags = New-Object System.Collections.Generic.List[object]
        $skip = $false
        if ($item.status -eq 'running') {
            $skip = $true; $flags.Add(@{ kind = 'skip'; text = 'уже идёт' })
        } elseif (-not $item.starts_at) {
            $skip = $true; $flags.Add(@{ kind = 'warn'; text = 'нет старта' })
        } elseif ([DateTimeOffset]::Parse($item.starts_at, [Globalization.CultureInfo]::InvariantCulture) -lt $now) {
            $skip = $true; $flags.Add(@{ kind = 'skip'; text = 'уже начался' })
        } else {
            $flags.Add(@{ kind = 'ok'; text = 'уйдёт на сервер' })
        }
        $entries = if ($null -ne $item.entries) { if ($item.max_entries) { "записано $($item.entries)/$($item.max_entries)" } else { "записано $($item.entries)" } } else { $null }
        [ordered]@{
            time = Format-Start $item.starts_at
            name = $item.name
            rawName = $null
            buyin = Format-Money $item.buyin 1 'USD'
            guarantee = Format-Money $item.guarantee 1 'USD'
            game = $script:Games["$($item.game_type)"]
            bounty = $script:Bounty["$($item.bounty_kind)"]
            stack = $null
            levels = $item.level_minutes
            late = $null
            extras = @(@($entries) | Where-Object { $_ })
            flags = @($flags)
            skip = $skip
        }
    }
}

function New-CollectorReport {
    param([string]$XPokerJson, [string]$PPokerJson, [Parameter(Mandatory)][string]$Out)
    $xpRows = @(Get-XpRows (Read-PassJson $XPokerJson))
    $ppRows = @(Get-PpRows (Read-PassJson $PPokerJson))
    $clubs = @()
    foreach ($club in @(
        @{ title = 'Ginger+'; app = 'X-Poker'; rows = $xpRows; source = $XPokerJson; meta = 'Данные — из карточки каждого турнира. Суммы: фишки x 100 ₽.' },
        @{ title = 'Ginger'; app = 'PPPoker'; rows = $ppRows; source = $PPokerJson; meta = 'Данные — из ленты турниров союза, без открытия карточек: стек и поздняя рег. появятся позже. Суммы: 1 фишка = $1.' }
    )) {
        $rows = $club.rows
        $clubs += [ordered]@{
            title = $club.title
            app = $club.app
            meta = $club.meta + ' Проход: ' + $(if ($club.source) { (Get-Item $club.source).LastWriteTime.ToString('dd.MM HH:mm') } else { 'нет данных' }) + '.'
            counts = [ordered]@{
                send = @($rows | Where-Object { $_.flags | Where-Object { $_.kind -eq 'ok' } }).Count
                nostart = @($rows | Where-Object { $_.flags | Where-Object { $_.text -eq 'нет старта' } }).Count
                running = @($rows | Where-Object { $_.flags | Where-Object { $_.kind -eq 'skip' } }).Count
                check = @($rows | Where-Object { $_.flags | Where-Object { $_.kind -in 'warn', 'bad' } }).Count
            }
            rows = $rows
        }
    }
    $data = [ordered]@{
        stamp = 'Сухой проход · ' + (Get-Date).ToString('d MMMM yyyy, HH:mm', [Globalization.CultureInfo]::GetCultureInfo('ru-RU')) + ' МСК'
        clubs = $clubs
    }
    $json = $data | ConvertTo-Json -Depth 8 -Compress
    $json = $json -replace '</', '<\/'
    $template = [System.IO.File]::ReadAllText((Join-Path $PSScriptRoot 'report-template.html'), [System.Text.Encoding]::UTF8)
    [System.IO.File]::WriteAllText($Out, $template.Replace('__DATA__', $json), (New-Object System.Text.UTF8Encoding $false))
    $Out
}
