# Распознавание скриншотов лобби через Claude Haiku 4.5 (решение Ивана 16.09 — вместо OCR Windows).
#
# Прямой HTTP к POST /v1/messages (для PowerShell нет официального SDK): картинка base64 + ответ
# строго по JSON-схеме (output_config.format). Ключ — %USERPROFILE%\.ginger\anthropic_key или
# $env:ANTHROPIC_API_KEY (кладёт Иван; в репозиторий не попадает).
#
#   . .\collector\desktop\Haiku.ps1
#   Read-XpCardHaiku -Shot detail.png          # карточка турнира X-Poker
#   Read-PpPageHaiku -Shot list.png            # страница ленты MTT PPPoker
#   Get-HaikuSpend                             # токены и деньги за сессию
#
# Цена Haiku 4.5: $1 / 1M входных, $5 / 1M выходных; картинка ~ ширина*высота/750 токенов.
# В строках кода — только латиница (Windows PowerShell 5.1).

$script:HaikuModel = 'claude-haiku-4-5'
$script:HaikuSpend = @{ Calls = 0; InputTokens = 0; OutputTokens = 0 }
# Потолок на сессию: если проход попал не на тот экран, он не должен жечь деньги молча.
# Один нормальный проход по трём приложениям стоит около десяти центов (30.09 сбитый
# проход по кэш-столам стоил 26 — как раз тот случай, ради которого потолок и нужен).
$script:HaikuBudgetUsd = 0.30

function Set-HaikuBudget {
    param([Parameter(Mandatory)][double]$Usd)
    $script:HaikuBudgetUsd = $Usd
}

function Get-AnthropicKey {
    if ($env:ANTHROPIC_API_KEY) { return $env:ANTHROPIC_API_KEY }
    $file = Join-Path $env:USERPROFILE '.ginger\anthropic_key'
    if (Test-Path $file) { return (Get-Content $file -Raw).Trim() }
    throw "No Anthropic API key: create $file (Ivan)"
}

function Invoke-HaikuVision {
    param(
        [Parameter(Mandatory)][string]$ImagePath,
        [Parameter(Mandatory)][string]$Prompt,
        [Parameter(Mandatory)][hashtable]$Schema,
        [int]$MaxTokens = 4000
    )
    $spent = (Get-HaikuSpend).usd
    if ($spent -ge $script:HaikuBudgetUsd) {
        throw "Haiku budget spent: $spent USD of $($script:HaikuBudgetUsd). Stopped instead of burning more."
    }
    $bytes = [System.IO.File]::ReadAllBytes((Resolve-Path $ImagePath).Path)
    $body = @{
        model = $script:HaikuModel
        max_tokens = $MaxTokens
        output_config = @{ format = @{ type = 'json_schema'; schema = $Schema } }
        messages = @(
            @{
                role = 'user'
                content = @(
                    @{ type = 'image'; source = @{ type = 'base64'; media_type = 'image/png'; data = [Convert]::ToBase64String($bytes) } },
                    @{ type = 'text'; text = $Prompt }
                )
            }
        )
    }
    $json = $body | ConvertTo-Json -Depth 30 -Compress
    $headers = @{ 'x-api-key' = (Get-AnthropicKey); 'anthropic-version' = '2023-06-01' }

    $response = $null
    for ($attempt = 1; $attempt -le 4; $attempt++) {
        try {
            # Invoke-WebRequest, а не Invoke-RestMethod: тело ответа разбираем сами из байтов.
            # PowerShell 5.1 без charset в заголовке читает ответ как Latin-1, и «Магия
            # Тракториста» приезжает как «ÐÐ°Ð³Ð¸Ñ» (обожглись 01.10).
            $raw = Invoke-WebRequest -Method Post -Uri 'https://api.anthropic.com/v1/messages' -Headers $headers `
                -ContentType 'application/json; charset=utf-8' -Body ([System.Text.Encoding]::UTF8.GetBytes($json)) `
                -TimeoutSec 120 -UseBasicParsing
            $response = [System.Text.Encoding]::UTF8.GetString($raw.RawContentStream.ToArray()) | ConvertFrom-Json
            break
        } catch {
            $status = $null
            if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
            # 429 / 5xx / 529 перегрузка / обрыв сети — повторяем с паузой; 4xx — ошибка запроса, сразу наружу.
            $retryable = ($null -eq $status) -or $status -eq 429 -or $status -ge 500
            if (-not $retryable -or $attempt -eq 4) {
                $detail = $_.ErrorDetails.Message
                throw "Haiku request failed (HTTP $status): $detail"
            }
            Start-Sleep -Seconds ([math]::Pow(2, $attempt))
        }
    }

    $script:HaikuSpend.Calls++
    $script:HaikuSpend.InputTokens += [int]$response.usage.input_tokens
    $script:HaikuSpend.OutputTokens += [int]$response.usage.output_tokens
    if ($response.stop_reason -ne 'end_turn') { throw "Haiku stopped with '$($response.stop_reason)'" }
    $text = ($response.content | Where-Object { $_.type -eq 'text' } | Select-Object -First 1).text
    $text | ConvertFrom-Json
}

function Get-HaikuSpend {
    $cost = $script:HaikuSpend.InputTokens * 1e-6 + $script:HaikuSpend.OutputTokens * 5e-6
    [pscustomobject]@{
        calls = $script:HaikuSpend.Calls
        input_tokens = $script:HaikuSpend.InputTokens
        output_tokens = $script:HaikuSpend.OutputTokens
        usd = [math]::Round($cost, 4)
    }
}

function New-NullableType([string]$Type) { @{ anyOf = @(@{ type = $Type }, @{ type = 'null' }) } }

$script:XpCardSchema = @{
    type = 'object'
    additionalProperties = $false
    required = @('is_tournament_card', 'status', 'start_time', 'name', 'game', 'bounty', 'buyin_parts', 'guarantee_rub',
        'starting_chips', 'levels', 'late_reg_level', 'early_bird_bonus_pct', 'early_bird_level', 'rebuy', 'addon', 'structure', 'table_size')
    properties = @{
        is_tournament_card = @{ type = 'boolean' }
        status = @{ type = 'string'; enum = @('future', 'running') }
        start_time = New-NullableType 'string'
        name = @{ type = 'string' }
        game = @{ type = 'string'; enum = @('nlh', 'plo', 'plo5', 'other') }
        bounty = @{ type = 'string'; enum = @('none', 'pko', 'ko', 'mystery') }
        buyin_parts = @{ type = 'array'; items = @{ type = 'number' } }
        guarantee_rub = New-NullableType 'number'
        starting_chips = New-NullableType 'integer'
        levels = New-NullableType 'string'
        late_reg_level = New-NullableType 'integer'
        early_bird_bonus_pct = New-NullableType 'integer'
        early_bird_level = New-NullableType 'integer'
        rebuy = New-NullableType 'string'
        addon = New-NullableType 'string'
        structure = New-NullableType 'string'
        table_size = New-NullableType 'integer'
    }
}

$script:XpCardPrompt = @'
This is a "Game Details" screen of one tournament in the X-Poker poker app (club lobby). Extract the fields exactly as shown.

- is_tournament_card: false if this is not a tournament "Game Details" screen.
- status: "future" if the screen shows "Start Time: MM/DD HH:MM" under the big timer; "running" if it shows "Registration ended" or "Registration closes in ..." instead.
- start_time: "MM/DD HH:MM" from the "Start Time" line under the timer, else null. Ignore the bottom line "Next step ... Start: ..." of satellites: that is the start of the target tournament.
- name: the tournament title under the timer, exactly as written (Latin or Cyrillic). Skip decorative icons (trophies, diamonds, crowns) - they are not letters.
- game: from the badge "MTT-NLH" / "MTT-PLO4" (plo) / "MTT-PLO5"; nlh if unclear.
- bounty: "mystery" for an MKO badge, "pko" for PKO, "ko" for KO, else "none".
- buyin_parts: numbers of the "Buy-in" cell in the table, e.g. "4.50+4.50+1" -> [4.5, 4.5, 1].
- guarantee_rub: the guarantee in rubles from the description text under the title ("Garantiya 500 000 rublei" -> 500000), else null. Do not use the prize pool.
- starting_chips, levels (e.g. "15/12/10"), late_reg_level ("Late Registration: Level 9" -> 9).
- early_bird_bonus_pct and early_bird_level from "+10% Chips (LV0)" -> 10 and 0; null if there is no Early Bird.
- rebuy / addon: the cell text ("No Limit/2x/10", "4x/3"); null if "No" or "Details".
- structure: "Blind Structure" cell (Turbo, Deep Stack, Standard...).
- table_size: from the "7MAX"/"8MAX" label, else null.
Use null for anything that is not visible. Do not guess.
'@

$script:PpPageSchema = @{
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
                required = @('name', 'buyin', 'game', 'bounty', 'entries', 'max_entries', 'level_minutes', 'guarantee', 'start_time', 'status', 'fully_visible')
                properties = @{
                    name = @{ type = 'string' }
                    buyin = @{ type = 'number' }
                    game = @{ type = 'string'; enum = @('nlh', 'plo', 'plo5', 'other') }
                    bounty = @{ type = 'string'; enum = @('none', 'pko', 'ko', 'mystery') }
                    entries = New-NullableType 'integer'
                    max_entries = New-NullableType 'integer'
                    level_minutes = New-NullableType 'integer'
                    guarantee = New-NullableType 'number'
                    start_time = New-NullableType 'string'
                    status = @{ type = 'string'; enum = @('future', 'running', 'unknown') }
                    fully_visible = @{ type = 'boolean' }
                }
            }
        }
    }
}

$script:PpPagePrompt = @'
This is a club lobby in the PPPoker poker app, and the collector wants its MTT list.

Cash tables must never be collected, so first decide what kind of list this is.

- If the row of tabs (ALL, NLH, PLO5, MTT, FLASH…) is visible and the selected tab is not MTT, answer is_mtt_list=false and cards=[].
- If the tab row is scrolled out of sight, judge by the rows themselves: tournaments carry a blue "Buy-in: N" pill and a line with a start time, a registration countdown or a guarantee; cash tables instead show blinds ("50-100bb", "1/5", "15/30") and seat counters ("0/6"). Answer is_mtt_list=false only when the visible rows are cash.

For an MTT list extract every tournament card with a blue "Buy-in" pill, top to bottom. Skip promo banners without a Buy-in pill (e.g. "Diamond Tournament").

For each card:
- name: title to the right of the pill, exactly as written. The small globe icon before the title is not a letter.
- buyin: the number in "Buy-in: N".
- game: from the text under the buy-in ("PPST NLH", "PPST PLO5", "PLO4" -> plo, "PLO6" -> other).
- bounty: the small badge inside THIS card, right of its game label: PKO -> pko, MKO -> mystery, KO -> ko. Cards sit close together and neighbours often carry a badge — never take one from the card above or below. No badge of its own means "none".
- entries / max_entries: the person-icon counter "18/34" -> 18 and 34; a single number "16" -> entries 16, max_entries null.
- level_minutes: the clock-icon value "8 min" -> 8.
- The bottom line of a card is ONE of: "Start Time: MM/DD HH:MM" (-> start_time "MM/DD HH:MM", status "future"); a guarantee with a coin-stack icon before it, like "564+36" or "1,600" (-> guarantee = the sum, 600 or 1600; the icon is not a digit; status "unknown"); "Registration closes in N min" or "Registration ended" (-> status "running").
- fully_visible: false if the card is cut off by the top or bottom edge.
Use null for anything not visible. Do not guess.
'@

function Read-XpCardHaiku {
    param([Parameter(Mandatory)][string]$Shot)
    $card = Invoke-HaikuVision -ImagePath $Shot -Prompt $script:XpCardPrompt -Schema $script:XpCardSchema -MaxTokens 1500
    if (-not $card.is_tournament_card) { return $null }
    $startsAt = $null
    $status = $card.status
    if ($card.start_time -and $card.start_time -match '^(\d{1,2})/(\d{1,2})\s+(\d{1,2}):(\d{2})$') {
        $now = Get-Date
        $local = Get-Date -Year $now.Year -Month ([int]$Matches[1]) -Day ([int]$Matches[2]) -Hour ([int]$Matches[3]) -Minute ([int]$Matches[4]) -Second 0 -Millisecond 0
        if ($local -lt $now.AddDays(-30)) { $local = $local.AddYears(1) }
        $startsAt = ([DateTimeOffset]$local).ToString('yyyy-MM-ddTHH:mm:sszzz')
    } else {
        $status = 'running'
    }
    $parts = @($card.buyin_parts | ForEach-Object { [decimal]$_ })
    $buyin = $null
    if ($parts.Count) { $buyin = ($parts | Measure-Object -Sum).Sum }
    $bountyShare = $null
    if ($parts.Count -eq 3 -and ($parts[0] + $parts[1]) -gt 0) { $bountyShare = [int][math]::Round($parts[1] / ($parts[0] + $parts[1]) * 100) }
    $guarantee = $null
    if ($card.guarantee_rub) { $guarantee = [decimal]$card.guarantee_rub / $script:XpRubPerChip }
    $earlyBonus = $null
    $earlyLevels = $null
    if ($null -ne $card.early_bird_bonus_pct) {
        $earlyBonus = "+$($card.early_bird_bonus_pct)% " + [regex]::Unescape('фишек')
        if ($card.early_bird_level -gt 0) { $earlyLevels = [int]$card.early_bird_level }
    }
    [pscustomobject]@{
        status = $status
        starts_at = $startsAt
        name = $card.name
        game_type = $card.game
        bounty_kind = $card.bounty
        buyin = $buyin
        buyin_raw = ($parts -join '+')
        bounty_share = $bountyShare
        guarantee = $guarantee
        start_stack = $card.starting_chips
        level_minutes = $card.levels
        late_reg_levels = $card.late_reg_level
        structure = $card.structure
        rebuy_terms = $card.rebuy
        addon_terms = $card.addon
        early_bird_bonus = $earlyBonus
        early_bird_levels = $earlyLevels
        table_size = $card.table_size
        shot = $Shot
    }
}

function Read-PpPageHaiku {
    param([Parameter(Mandatory)][string]$Shot)
    $page = Invoke-HaikuVision -ImagePath $Shot -Prompt $script:PpPagePrompt -Schema $script:PpPageSchema -MaxTokens 4000
    if (-not $page.is_mtt_list) { return @() }
    foreach ($card in $page.cards) {
        if (-not $card.fully_visible) { continue }
        $startsAt = $null
        if ($card.start_time -and $card.start_time -match '^(\d{1,2})/(\d{1,2})\s+(\d{1,2}):(\d{2})$') {
            $now = Get-Date
            $local = Get-Date -Year $now.Year -Month ([int]$Matches[1]) -Day ([int]$Matches[2]) -Hour ([int]$Matches[3]) -Minute ([int]$Matches[4]) -Second 0 -Millisecond 0
            if ($local -lt $now.AddDays(-30)) { $local = $local.AddYears(1) }
            $startsAt = ([DateTimeOffset]$local).ToString('yyyy-MM-ddTHH:mm:sszzz')
        }
        $status = $card.status
        if ($startsAt) { $status = 'future' }
        [pscustomobject]@{
            name = $card.name
            buyin = [decimal]$card.buyin
            game_type = $card.game
            bounty_kind = $card.bounty
            entries = $card.entries
            max_entries = $card.max_entries
            level_minutes = $card.level_minutes
            guarantee = $card.guarantee
            starts_at = $startsAt
            status = $status
            y = 0
        }
    }
}
