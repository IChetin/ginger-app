# Отправка прохода сборщика в приёмник на сервере (POST /api/v1/collector/...).
#
# По умолчанию — сухой прогон: печатает, что уйдёт. Отправка — только с -Apply и токеном
# из переменной окружения COLLECTOR_TOKEN (ставит Иван; сюда секрет не пишем).
#
#   . .\collector\desktop\Send.ps1
#   Send-CollectorSnapshot -JsonPath $env:TEMP\desk\xpoker\xpoker-mtt-20260915-1930.json
#   $env:COLLECTOR_TOKEN = '...'; Send-CollectorSnapshot -JsonPath ... -Apply
#
# Окно сверки: от «сейчас + 10 минут» до последнего увиденного старта. Начавшиеся турниры проход
# пропускает — поэтому окно с будущего, иначе они ушли бы в «пропавшие».
# В строках кода — только латиница (Windows PowerShell 5.1 и UTF-8 без BOM).

. "$PSScriptRoot\XPoker.ps1"

function Invoke-CollectorApi {
    param([string]$Method, [string]$Url, $Body, [string]$Token)
    $json = $Body | ConvertTo-Json -Depth 6
    Invoke-RestMethod -Method $Method -Uri $Url -Headers @{ Authorization = "Bearer $Token" } `
        -ContentType 'application/json; charset=utf-8' -Body ([System.Text.Encoding]::UTF8.GetBytes($json))
}

function Send-CollectorSnapshot {
    param(
        [Parameter(Mandatory)][string]$JsonPath,
        [string]$ClubSlug = 'ginger-plus',
        [string]$App = 'xpoker',
        [string]$BaseUrl = 'https://lisa52.com',
        [switch]$Apply
    )
    # Windows PowerShell 5.1: ConvertFrom-Json отдаёт массив одним объектом (раскрываем конвейером)
    # и сам превращает ISO-даты в DateTime — возвращаем им строку с часовым поясом.
    $parsed = Get-Content $JsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $items = @($parsed | ForEach-Object { $_ })
    foreach ($item in $items) {
        if ($item.starts_at -is [datetime]) {
            $item.starts_at = ([DateTimeOffset]$item.starts_at).ToString('yyyy-MM-ddTHH:mm:sszzz')
        }
    }
    # Уже начавшиеся к моменту отправки турниры не шлём: вне окна сверки приёмник записал бы их «новыми».
    $windowFrom = [DateTimeOffset](Get-Date).AddMinutes(10)
    $future = @($items | Where-Object {
        $_.starts_at -and $_.name -and $_.status -ne 'running' -and
        [DateTimeOffset]::Parse($_.starts_at, [Globalization.CultureInfo]::InvariantCulture) -ge $windowFrom
    })
    if (-not $future.Count) { throw 'No upcoming tournaments in the pass' }

    # Проход PPPoker (лента, есть max_entries) отдаёт только ядро: старт, имя, бай-ин, гарантия, игра, баунти.
    # Длину уровня из ленты («8 min») не шлём — приёмник сам пишет параметры в сетку и затёр бы «15/12/12».
    $isPpPass = [bool]($items | Where-Object { $_.PSObject.Properties.Name -contains 'max_entries' } | Select-Object -First 1)
    $tournaments = @($future | ForEach-Object {
        if ($isPpPass) {
            $core = [ordered]@{ starts_at = $_.starts_at; name = $_.name; buyin = $_.buyin; bounty_kind = $_.bounty_kind; game_type = $_.game_type }
            if ($_.guarantee -ge 1) { $core.guarantee = $_.guarantee }
            [pscustomobject]$core
        } else {
            ConvertTo-XpCollected $_
        }
    })
    $starts = $future | ForEach-Object { [DateTimeOffset]::Parse($_.starts_at, [Globalization.CultureInfo]::InvariantCulture) }
    $windowTo =($starts | Measure-Object -Maximum).Maximum
    $body = [ordered]@{
        club_slug = $ClubSlug
        window_from = $windowFrom.ToString('yyyy-MM-ddTHH:mm:sszzz')
        window_to = ([DateTimeOffset]$windowTo).ToString('yyyy-MM-ddTHH:mm:sszzz')
        tournaments = $tournaments
    }

    if (-not $Apply) {
        Write-Host ("DRY RUN: {0} tournaments, window {1} .. {2}" -f $tournaments.Count, $body.window_from, $body.window_to)
        return ($body | ConvertTo-Json -Depth 6)
    }

    # Токен — из переменной окружения или из файла профиля (кладёт Иван; в репозиторий не попадает).
    $token = $env:COLLECTOR_TOKEN
    $tokenFile = Join-Path $env:USERPROFILE '.ginger\collector_token'
    if (-not $token -and (Test-Path $tokenFile)) { $token = (Get-Content $tokenFile -Raw).Trim() }
    if (-not $token) { throw "No collector token: set `$env:COLLECTOR_TOKEN or create $tokenFile (Ivan)" }
    $api = "$BaseUrl/api/v1/collector"
    $run = Invoke-CollectorApi POST "$api/runs" @{ kind = 'mtt'; app = $App } $token
    try {
        $result = Invoke-CollectorApi POST "$api/runs/$($run.id)/snapshots" $body $token
        [void](Invoke-CollectorApi POST "$api/runs/$($run.id)/finish" @{ status = 'ok'; stats = @{ tournaments = $tournaments.Count } } $token)
        $result
    } catch {
        [void](Invoke-CollectorApi POST "$api/runs/$($run.id)/finish" @{ status = 'failed'; error = "$_" } $token)
        throw
    }
}
