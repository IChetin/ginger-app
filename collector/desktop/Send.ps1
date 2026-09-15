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
    $items = @(Get-Content $JsonPath -Raw -Encoding UTF8 | ConvertFrom-Json)
    $future = @($items | Where-Object { $_.status -eq 'future' -and $_.starts_at -and $_.name })
    if (-not $future.Count) { throw 'No future tournaments in the pass' }

    $tournaments = @($future | ForEach-Object { ConvertTo-XpCollected $_ })
    $starts = $future | ForEach-Object { [DateTimeOffset]::Parse($_.starts_at) }
    $windowFrom = [DateTimeOffset](Get-Date).AddMinutes(10)
    $windowTo = ($starts | Measure-Object -Maximum).Maximum
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

    $token = $env:COLLECTOR_TOKEN
    if (-not $token) { throw 'Set $env:COLLECTOR_TOKEN first (Ivan)' }
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
