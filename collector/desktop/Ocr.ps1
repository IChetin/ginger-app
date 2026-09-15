# Локальный OCR сборщика (решение Ивана 15.09): встроенный в Windows 10 распознаватель
# Windows.Media.Ocr — ничего не ставим. Отдаёт слова с прямоугольниками в координатах исходного
# снимка — по ним раскладываем карточки турниров.
#
#   . .\collector\desktop\Ocr.ps1
#   Get-OcrWords -Path shot.png -Lang ru -Scale 2 | Format-Table

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.IRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.SoftwareBitmap, Windows.Graphics, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime]

$script:AsTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
} | Select-Object -First 1

function Wait-WinRt($Operation, [Type]$ResultType) {
    $task = $script:AsTask.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
    [void]$task.Wait(-1)
    $task.Result
}

function New-OcrImage {
    # Игровые шрифты мелкие и на цветном фоне: увеличиваем, по желанию — в серое с усилением контраста.
    param([string]$Path, [double]$Scale, [switch]$Gray)
    $source = [System.Drawing.Image]::FromFile($Path)
    $width = [int]($source.Width * $Scale); $height = [int]($source.Height * $Scale)
    $bitmap = New-Object System.Drawing.Bitmap $width, $height
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    if ($Gray) {
        $matrix = New-Object System.Drawing.Imaging.ColorMatrix
        $k = 1.6
        foreach ($row in 0..2) {
            $matrix.set_Item($row, 0, 0.30 * $k); $matrix.set_Item($row, 1, 0.59 * $k); $matrix.set_Item($row, 2, 0.11 * $k)
        }
        $matrix.set_Item(4, 0, -0.25); $matrix.set_Item(4, 1, -0.25); $matrix.set_Item(4, 2, -0.25)
        $attributes = New-Object System.Drawing.Imaging.ImageAttributes
        $attributes.SetColorMatrix($matrix)
        $graphics.DrawImage($source, (New-Object System.Drawing.Rectangle 0, 0, $width, $height), 0, 0, $source.Width, $source.Height, [System.Drawing.GraphicsUnit]::Pixel, $attributes)
    } else {
        $graphics.DrawImage($source, 0, 0, $width, $height)
    }
    $graphics.Dispose(); $source.Dispose()
    $temp = Join-Path $env:TEMP ("ocr-" + [guid]::NewGuid().ToString('N') + ".png")
    $bitmap.Save($temp, [System.Drawing.Imaging.ImageFormat]::Png)
    $bitmap.Dispose()
    $temp
}

function Get-OcrWords {
    param(
        [Parameter(Mandatory)][string]$Path,
        [string]$Lang = 'ru',
        [double]$Scale = 2,
        [switch]$Gray
    )
    $temp = New-OcrImage -Path (Resolve-Path $Path).Path -Scale $Scale -Gray:$Gray
    try {
        $file = Wait-WinRt ([Windows.Storage.StorageFile]::GetFileFromPathAsync($temp)) ([Windows.Storage.StorageFile])
        $stream = Wait-WinRt ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
        $decoder = Wait-WinRt ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
        $softwareBitmap = Wait-WinRt ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
        $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage((New-Object Windows.Globalization.Language $Lang))
        if (-not $engine) { throw "OCR language '$Lang' is not installed" }
        $result = Wait-WinRt ($engine.RecognizeAsync($softwareBitmap)) ([Windows.Media.Ocr.OcrResult])
        $lineIndex = 0
        foreach ($line in $result.Lines) {
            foreach ($word in $line.Words) {
                $rect = $word.BoundingRect
                [pscustomobject]@{
                    Text = $word.Text
                    X = [int]($rect.X / $Scale); Y = [int]($rect.Y / $Scale)
                    W = [int]($rect.Width / $Scale); H = [int]($rect.Height / $Scale)
                    Line = $lineIndex
                }
            }
            $lineIndex++
        }
        $softwareBitmap.Dispose(); $stream.Dispose()
    } finally {
        Remove-Item $temp -ErrorAction SilentlyContinue
    }
}

function Get-OcrLines {
    # Слова, собранные в строки с общим прямоугольником, — удобнее для разбора карточек.
    param([Parameter(Mandatory)][string]$Path, [string]$Lang = 'ru', [double]$Scale = 2, [switch]$Gray)
    Get-OcrWords -Path $Path -Lang $Lang -Scale $Scale -Gray:$Gray | Group-Object Line | ForEach-Object {
        $words = $_.Group | Sort-Object X
        $left = ($words | Measure-Object X -Minimum).Minimum
        $top = ($words | Measure-Object Y -Minimum).Minimum
        $right = ($words | ForEach-Object { $_.X + $_.W } | Measure-Object -Maximum).Maximum
        $bottom = ($words | ForEach-Object { $_.Y + $_.H } | Measure-Object -Maximum).Maximum
        [pscustomobject]@{
            Text = ($words.Text -join ' '); X = $left; Y = $top; W = $right - $left; H = $bottom - $top
        }
    } | Sort-Object Y, X
}
