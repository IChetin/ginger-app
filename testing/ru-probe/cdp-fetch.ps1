# Качает URL через fetch() в открытой вкладке Chrome на телефоне и говорит, сколько байт пришло.
param([string[]]$Urls, [int]$TimeoutSec = 20)
$ErrorActionPreference = "Stop"
$target = @((Invoke-RestMethod -Uri "http://localhost:9222/json") | ForEach-Object { $_ } | Where-Object { $_.type -eq "page" })[0]
$ws = [Net.WebSockets.ClientWebSocket]::new()
$ws.ConnectAsync([Uri]$target.webSocketDebuggerUrl, [Threading.CancellationToken]::None).Wait()
$buffer = [byte[]]::new(1MB)
$id = 100
$ign = @{ id = 50; method = "Security.setIgnoreCertificateErrors"; params = @{ ignore = $true } } | ConvertTo-Json -Compress
$ib = [Text.Encoding]::UTF8.GetBytes($ign); $ws.SendAsync([ArraySegment[byte]]::new($ib), "Text", $true, [Threading.CancellationToken]::None).Wait()
foreach ($url in $Urls) {
    $id++
    $js = @"
(async () => {
  const t0 = performance.now(); let got = 0;
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), $($TimeoutSec * 1000));
  try {
    const r = await fetch('$url', { cache: 'no-store', signal: ctl.signal });
    const reader = r.body.getReader();
    for (;;) { const { done, value } = await reader.read(); if (done) break; got += value.length; }
    return 'OK ' + Math.round(got / 1024) + ' KB in ' + ((performance.now() - t0) / 1000).toFixed(1) + 's';
  } catch (e) {
    return 'STOP at ' + Math.round(got / 1024) + ' KB after ' + ((performance.now() - t0) / 1000).toFixed(1) + 's (' + e.name + ')';
  } finally { clearTimeout(timer); }
})()
"@
    $msg = @{ id = $id; method = 'Runtime.evaluate'; params = @{ expression = $js; awaitPromise = $true; returnByValue = $true } } | ConvertTo-Json -Compress -Depth 5
    $bytes = [Text.Encoding]::UTF8.GetBytes($msg)
    $ws.SendAsync([ArraySegment[byte]]::new($bytes), 'Text', $true, [Threading.CancellationToken]::None).Wait()
    $sb = [Text.StringBuilder]::new()
    while ($true) {
        $t = $ws.ReceiveAsync([ArraySegment[byte]]::new($buffer), [Threading.CancellationToken]::None); $t.Wait()
        [void]$sb.Append([Text.Encoding]::UTF8.GetString($buffer, 0, $t.Result.Count))
        if (-not $t.Result.EndOfMessage) { continue }
        $text = $sb.ToString(); [void]$sb.Clear()
        if ($text -match "`"id`":$id\b") { "{0}`n   {1}" -f $url, (($text | ConvertFrom-Json).result.result.value); break }
    }
}
$ws.Dispose()
