# Открывает URL в Chrome на телефоне (через adb forward :9222) и считает, сколько байт пришло.
param([string[]]$Urls, [int]$Seconds = 25, [switch]$ShowText)
$ErrorActionPreference = "Stop"

function Send-Cdp($ws, [int]$id, [string]$method, $params) {
    $msg = @{ id = $id; method = $method; params = $params } | ConvertTo-Json -Compress -Depth 5
    $bytes = [Text.Encoding]::UTF8.GetBytes($msg)
    $ws.SendAsync([ArraySegment[byte]]::new($bytes), 'Text', $true, [Threading.CancellationToken]::None).Wait()
}

# Одно висящее чтение без отмены: отмена ReceiveAsync рвёт веб-сокет.
$script:pending = $null
$script:buffer = [byte[]]::new(4MB)
$script:sb = [Text.StringBuilder]::new()
function Receive-Cdp($ws, [int]$waitMs) {
    if (-not $script:pending) {
        $script:pending = $ws.ReceiveAsync([ArraySegment[byte]]::new($script:buffer), [Threading.CancellationToken]::None)
    }
    if (-not $script:pending.Wait($waitMs)) { return $null }
    $res = $script:pending.Result; $script:pending = $null
    [void]$script:sb.Append([Text.Encoding]::UTF8.GetString($script:buffer, 0, $res.Count))
    if (-not $res.EndOfMessage) { return $null }
    $text = $script:sb.ToString(); [void]$script:sb.Clear()
    try { return ($text | ConvertFrom-Json) } catch { return $null }
}

foreach ($url in $Urls) {
    $target = @((Invoke-RestMethod -Uri "http://localhost:9222/json") | ForEach-Object { $_ } | Where-Object { $_.type -eq "page" })[0]
    $ws = [Net.WebSockets.ClientWebSocket]::new()
    $ws.ConnectAsync([Uri]$target.webSocketDebuggerUrl, [Threading.CancellationToken]::None).Wait()
    $script:pending = $null
    Send-Cdp $ws 1 'Network.enable' @{}
    Send-Cdp $ws 2 'Network.setCacheDisabled' @{ cacheDisabled = $true }
    Send-Cdp $ws 3 'Page.enable' @{}
    Send-Cdp $ws 4 'Page.navigate' @{ url = $url }

    $bytes = @{}; $finished = @{}; $failed = @{}; $urlsById = @{}; $docId = $null; $load = $false
    $start = Get-Date; $deadline = $start.AddSeconds($Seconds); $docDoneAt = $null
    while ((Get-Date) -lt $deadline) {
        $evt = Receive-Cdp $ws 300
        if (-not $evt) { continue }
        $p = $evt.params
        switch ($evt.method) {
            'Network.requestWillBeSent' {
                $urlsById[$p.requestId] = $p.request.url
                if (-not $docId -and $p.type -eq 'Document') { $docId = $p.requestId }
            }
            'Network.dataReceived' { $bytes[$p.requestId] += $p.dataLength }
            'Network.loadingFinished' {
                $finished[$p.requestId] = $p.encodedDataLength
                if ($p.requestId -eq $docId) { $docDoneAt = ((Get-Date) - $start).TotalSeconds }
            }
            'Network.loadingFailed' { $failed[$p.requestId] = $p.errorText }
            'Page.loadEventFired' { $load = $true }
        }
    }
    $got = 0; foreach ($k in $urlsById.Keys) { $got += [double]$bytes[$k] }
    $hang = @($urlsById.Keys | Where-Object { -not $finished.ContainsKey($_) -and -not $failed.ContainsKey($_) })
    $doc = if ($docId -and $finished.ContainsKey($docId)) { "doc OK {0:N0} KB in {1:N1}s" -f ([double]$bytes[$docId] / 1KB), $docDoneAt }
           elseif ($docId -and $failed.ContainsKey($docId)) { "doc FAIL $($failed[$docId])" }
           else { "doc HANG at {0:N0} KB" -f ([double]$bytes[[string]$docId] / 1KB) }
    "{0}`n   {1} | load={2} | got {3:N0} KB | req {4}, done {5}, hang {6}, fail {7}" -f $url, $doc, $load, ($got / 1KB), $urlsById.Count, $finished.Count, $hang.Count, $failed.Count
    foreach ($h in ($hang | Select-Object -First 3)) { "   hang: {0} ({1:N0} KB)" -f $urlsById[$h], ([double]$bytes[$h] / 1KB) }
    if ($ShowText) {
        Send-Cdp $ws 99 'Runtime.evaluate' @{ expression = 'document.body.innerText.slice(0,300)' }
        $until = (Get-Date).AddSeconds(5)
        while ((Get-Date) -lt $until) {
            $evt = Receive-Cdp $ws 300
            if ($evt -and $evt.id -eq 99) { '   text: ' + ($evt.result.result.value -replace '\s+', ' '); break }
        }
    }
    $ws.Dispose()
}
