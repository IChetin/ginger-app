# Сборщик лобби на десктопе: скриншот ОДНОГО окна клиента и клик/прокрутка внутри него.
# Проба 15.09: официальные ПК-клиенты PPPoker и Suprema. Экран целиком не снимаем — только окно
# клиента (в кадр не попадает ничего личного). Пароли и вход — только руками Ивана.
#
# Использование (PowerShell):
#   . .\collector\desktop\Desk.ps1
#   Get-DeskWindows -Match 'pppoker|suprema'
#   Save-WindowShot -Match 'PPPoker' -Path shot.png        # координаты кадра = клиентская область окна
#   Invoke-WindowClick -Match 'PPPoker' -X 120 -Y 340      # в координатах кадра
#   Invoke-WindowScroll -Match 'PPPoker' -X 400 -Y 500 -Notches -3

Add-Type -AssemblyName System.Drawing
if (-not ('DeskWin' -as [type])) {
    Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class DeskWin {
    public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr lParam);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder s, int n);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hWnd, out RECT r);
    [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr hWnd, ref POINT p);
    [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdc, uint flags);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int cmd);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint flags, int dx, int dy, int data, IntPtr extra);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")] public static extern IntPtr ChildWindowFromPointEx(IntPtr hWnd, POINT pt, uint flags);
    [DllImport("user32.dll")] public static extern int MapWindowPoints(IntPtr from, IntPtr to, ref POINT pt, uint count);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
}
"@
}
# Без этого на экране с масштабом 125–150% координаты кадра и клика разъезжаются.
[void][DeskWin]::SetProcessDPIAware()

function Get-DeskWindows {
    param([string]$Match = '.')
    $found = New-Object System.Collections.Generic.List[object]
    $callback = [DeskWin+EnumProc]{
        param($hWnd, $lParam)
        if ([DeskWin]::IsWindowVisible($hWnd)) {
            $sb = New-Object System.Text.StringBuilder 512
            [void][DeskWin]::GetWindowText($hWnd, $sb, 512)
            $title = $sb.ToString()
            $procId = 0
            [void][DeskWin]::GetWindowThreadProcessId($hWnd, [ref]$procId)
            $name = (Get-Process -Id $procId -ErrorAction SilentlyContinue).ProcessName
            # Совпадение по заголовку ИЛИ по имени процесса — так работают и якоря: '^PPPoker$'.
            if ($title -and (($title.Trim() -match $Match) -or ($name -match $Match))) {
                $rect = New-Object DeskWin+RECT
                [void][DeskWin]::GetClientRect($hWnd, [ref]$rect)
                $found.Add([pscustomobject]@{
                    Handle = $hWnd; Title = $title; Process = $name; Pid = $procId
                    Width = $rect.Right; Height = $rect.Bottom
                })
            }
        }
        return $true
    }
    [void][DeskWin]::EnumWindows($callback, [IntPtr]::Zero)
    $found
}

function Get-DeskWindow {
    param([Parameter(Mandatory)][string]$Match)
    $window = Get-DeskWindows -Match $Match | Sort-Object { $_.Width * $_.Height } -Descending | Select-Object -First 1
    # Сообщение по-английски: Windows PowerShell 5.1 читает файл без BOM не в UTF-8.
    if (-not $window) { throw "Window '$Match' not found" }
    if ([DeskWin]::IsIconic($window.Handle)) { [void][DeskWin]::ShowWindow($window.Handle, 9) }
    $window
}

function Save-WindowShot {
    param([Parameter(Mandatory)][string]$Match, [Parameter(Mandatory)][string]$Path)
    $window = Get-DeskWindow -Match $Match
    $bitmap = New-Object System.Drawing.Bitmap $window.Width, $window.Height
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $hdc = $graphics.GetHdc()
    # 1 = только клиентская область, 2 = PW_RENDERFULLCONTENT (игровые движки рисуют через GPU).
    $ok = [DeskWin]::PrintWindow($window.Handle, $hdc, 3)
    $graphics.ReleaseHdc($hdc)
    if (-not $ok) {
        # Запасной путь — снять с экрана прямоугольник окна (окно должно быть сверху).
        [void][DeskWin]::SetForegroundWindow($window.Handle)
        Start-Sleep -Milliseconds 300
        $origin = New-Object DeskWin+POINT
        [void][DeskWin]::ClientToScreen($window.Handle, [ref]$origin)
        $graphics.CopyFromScreen($origin.X, $origin.Y, 0, 0, $bitmap.Size)
    }
    $graphics.Dispose()
    $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bitmap.Dispose()
    [pscustomobject]@{ Path = $Path; Width = $window.Width; Height = $window.Height; PrintWindow = $ok }
}

function Move-ToWindowPoint {
    param($Window, [int]$X, [int]$Y)
    [void][DeskWin]::SetForegroundWindow($Window.Handle)
    Start-Sleep -Milliseconds 150
    $point = New-Object DeskWin+POINT
    $point.X = $X; $point.Y = $Y
    [void][DeskWin]::ClientToScreen($Window.Handle, [ref]$point)
    [void][DeskWin]::SetCursorPos($point.X, $point.Y)
    Start-Sleep -Milliseconds 80
}

function Invoke-WindowClick {
    param([Parameter(Mandatory)][string]$Match, [int]$X, [int]$Y)
    $window = Get-DeskWindow -Match $Match
    Move-ToWindowPoint -Window $window -X $X -Y $Y
    [DeskWin]::mouse_event(0x0002, 0, 0, 0, [IntPtr]::Zero)  # LEFTDOWN
    Start-Sleep -Milliseconds 60
    [DeskWin]::mouse_event(0x0004, 0, 0, 0, [IntPtr]::Zero)  # LEFTUP
}

function Invoke-WindowPostClick {
    # Клик сообщениями прямо в окно: курсор и фокус Ивана не трогаются, окно может быть за другими
    # (но не свёрнуто). Работает не во всех движках — проверять снимком.
    param([Parameter(Mandatory)][string]$Match, [int]$X, [int]$Y)
    $window = Get-DeskWindow -Match $Match
    $point = New-Object DeskWin+POINT
    $point.X = $X; $point.Y = $Y
    # Рисует часто дочернее окно движка — сообщение шлём ему, в его координатах.
    $target = [DeskWin]::ChildWindowFromPointEx($window.Handle, $point, 0x0001)  # CWP_SKIPINVISIBLE
    if ($target -eq [IntPtr]::Zero) { $target = $window.Handle }
    if ($target -ne $window.Handle) { [void][DeskWin]::MapWindowPoints($window.Handle, $target, [ref]$point, 1) }
    $lParam = [IntPtr](($point.Y -shl 16) -bor ($point.X -band 0xFFFF))
    [void][DeskWin]::PostMessage($target, 0x0200, [IntPtr]::Zero, $lParam)  # WM_MOUSEMOVE
    Start-Sleep -Milliseconds 40
    [void][DeskWin]::PostMessage($target, 0x0201, [IntPtr]1, $lParam)       # WM_LBUTTONDOWN
    Start-Sleep -Milliseconds 90
    [void][DeskWin]::PostMessage($target, 0x0202, [IntPtr]::Zero, $lParam)  # WM_LBUTTONUP
}

function Invoke-WindowPostDrag {
    # Прокрутка ленты перетаскиванием — сообщениями, курсор Ивана не трогается.
    param([Parameter(Mandatory)][string]$Match, [int]$X, [int]$Y, [int]$ToX, [int]$ToY, [int]$Steps = 20)
    $window = Get-DeskWindow -Match $Match
    $origin = New-Object DeskWin+POINT
    $origin.X = $X; $origin.Y = $Y
    $target = [DeskWin]::ChildWindowFromPointEx($window.Handle, $origin, 0x0001)
    if ($target -eq [IntPtr]::Zero) { $target = $window.Handle }
    $post = {
        param([uint32]$Message, [int]$WParam, [int]$PX, [int]$PY)
        $point = New-Object DeskWin+POINT
        $point.X = $PX; $point.Y = $PY
        if ($target -ne $window.Handle) { [void][DeskWin]::MapWindowPoints($window.Handle, $target, [ref]$point, 1) }
        $lParam = [IntPtr](($point.Y -shl 16) -bor ($point.X -band 0xFFFF))
        [void][DeskWin]::PostMessage($target, $Message, [IntPtr]$WParam, $lParam)
    }
    & $post 0x0200 0 $X $Y
    & $post 0x0201 1 $X $Y
    for ($i = 1; $i -le $Steps; $i++) {
        Start-Sleep -Milliseconds 16
        & $post 0x0200 1 ([int]($X + ($ToX - $X) * $i / $Steps)) ([int]($Y + ($ToY - $Y) * $i / $Steps))
    }
    Start-Sleep -Milliseconds 120
    & $post 0x0202 0 $ToX $ToY
}

function Invoke-WindowScroll {
    param([Parameter(Mandatory)][string]$Match, [int]$X, [int]$Y, [int]$Notches = -3)
    $window = Get-DeskWindow -Match $Match
    Move-ToWindowPoint -Window $window -X $X -Y $Y
    [DeskWin]::mouse_event(0x0800, 0, 0, 120 * $Notches, [IntPtr]::Zero)  # WHEEL
}

function Invoke-WindowDrag {
    # Лобби мобильных движков часто листаются перетаскиванием, а не колёсиком.
    param([Parameter(Mandatory)][string]$Match, [int]$X, [int]$Y, [int]$ToX, [int]$ToY, [int]$Steps = 12)
    $window = Get-DeskWindow -Match $Match
    Move-ToWindowPoint -Window $window -X $X -Y $Y
    [DeskWin]::mouse_event(0x0002, 0, 0, 0, [IntPtr]::Zero)
    for ($i = 1; $i -le $Steps; $i++) {
        $point = New-Object DeskWin+POINT
        $point.X = [int]($X + ($ToX - $X) * $i / $Steps); $point.Y = [int]($Y + ($ToY - $Y) * $i / $Steps)
        [void][DeskWin]::ClientToScreen($window.Handle, [ref]$point)
        [void][DeskWin]::SetCursorPos($point.X, $point.Y)
        Start-Sleep -Milliseconds 15
    }
    [DeskWin]::mouse_event(0x0004, 0, 0, 0, [IntPtr]::Zero)
}
