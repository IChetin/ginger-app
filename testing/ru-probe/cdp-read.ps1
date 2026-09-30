# Открывает страницу в Chrome на телефоне и возвращает её текст и ссылки (для сайтов,
# которые не открываются с ПК за VPN). Нужен adb forward tcp:9222 localabstract:chrome_devtools_remote.
param([string]$Url, [int]$WaitSec = 8, [int]$MaxChars = 6000, [string]$LinkFilter = "")
$ErrorActionPreference = "Stop"
$target = @((Invoke-RestMethod -Uri "http://localhost:9222/json") | ForEach-Object { $_ } | Where-Object { $_.type -eq "page" })[0]
$ws = [Net.WebSockets.ClientWebSocket]::new()
$ws.ConnectAsync([Uri]$target.webSocketDebuggerUrl, [Threading.CancellationToken]::None).Wait()
$buffer = [byte[]]::new(4MB)

function Invoke-Cdp([int]$id, [string]$method, $params) {
    $msg = @{ id = $id; method = $method; params = $params } | ConvertTo-Json -Compress -Depth 5
    $b = [Text.Encoding]::UTF8.GetBytes($msg)
    $ws.SendAsync([ArraySegment[byte]]::new($b), 'Text', $true, [Threading.CancellationToken]::None).Wait()
    $sb = [Text.StringBuilder]::new()
    while ($true) {
        $t = $ws.ReceiveAsync([ArraySegment[byte]]::new($buffer), [Threading.CancellationToken]::None); $t.Wait()
        [void]$sb.Append([Text.Encoding]::UTF8.GetString($buffer, 0, $t.Result.Count))
        if (-not $t.Result.EndOfMessage) { continue }
        $text = $sb.ToString(); [void]$sb.Clear()
        if ($text -match "^\{`"id`":$id,") { return ($text | ConvertFrom-Json) }
    }
}

[void](Invoke-Cdp 1 'Page.navigate' @{ url = $Url })
Start-Sleep -Seconds $WaitSec
$js = @"
(() => {
  const text = document.body ? document.body.innerText.replace(/\n{2,}/g, '\n').slice(0, $MaxChars) : '';
  const re = new RegExp('$LinkFilter', 'i');
  const links = [...document.querySelectorAll('a[href]')]
    .map(a => (a.innerText.trim().replace(/\s+/g, ' ').slice(0, 60) + ' -> ' + a.href))
    .filter(l => '$LinkFilter' && re.test(l));
  return location.href + '\n' + text + '\n--- links ---\n' + [...new Set(links)].slice(0, 40).join('\n');
})()
"@
$r = Invoke-Cdp 2 'Runtime.evaluate' @{ expression = $js; returnByValue = $true }
$r.result.result.value
$ws.Dispose()
