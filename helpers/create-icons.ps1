# Auto-generate icons using PowerShell
Add-Type -AssemblyName System.Drawing

function Create-Icon {
    param($size, $outputPath)

    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $graphics = [System.Drawing.Graphics]::FromImage($bmp)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

    # Azure blue background
    $azureBlue = [System.Drawing.Color]::FromArgb(0, 120, 212)
    $brush = New-Object System.Drawing.SolidBrush($azureBlue)
    $graphics.FillRectangle($brush, 0, 0, $size, $size)

    # White shield shape
    $whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)

    $points = @(
        [System.Drawing.Point]::new($size/2, $size*0.15),
        [System.Drawing.Point]::new($size*0.8, $size*0.3),
        [System.Drawing.Point]::new($size*0.8, $size*0.65),
        [System.Drawing.Point]::new($size/2, $size*0.85),
        [System.Drawing.Point]::new($size*0.2, $size*0.65),
        [System.Drawing.Point]::new($size*0.2, $size*0.3)
    )

    $graphics.FillPolygon($whiteBrush, $points)

    # Draw "B" in center
    $blueBrush = New-Object System.Drawing.SolidBrush($azureBlue)
    $font = New-Object System.Drawing.Font("Arial", $size*0.35, [System.Drawing.FontStyle]::Bold)
    $format = New-Object System.Drawing.StringFormat
    $format.Alignment = [System.Drawing.StringAlignment]::Center
    $format.LineAlignment = [System.Drawing.StringAlignment]::Center

    $rect = New-Object System.Drawing.RectangleF(0, 0, $size, $size)
    $graphics.DrawString("B", $font, $blueBrush, $rect, $format)

    # Save
    $bmp.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)

    $graphics.Dispose()
    $bmp.Dispose()
    $brush.Dispose()
    $whiteBrush.Dispose()
    $blueBrush.Dispose()
    $font.Dispose()

    Write-Host "Created: $outputPath" -ForegroundColor Green
}

$extensionPath = Join-Path $PSScriptRoot "..\extension"

Write-Host "Generating extension icons..." -ForegroundColor Cyan
Write-Host "Output folder: $extensionPath" -ForegroundColor Gray
Write-Host ""

Create-Icon -size 16 -outputPath (Join-Path $extensionPath "icon16.png")
Create-Icon -size 32 -outputPath (Join-Path $extensionPath "icon32.png")
Create-Icon -size 48 -outputPath (Join-Path $extensionPath "icon48.png")
Create-Icon -size 128 -outputPath (Join-Path $extensionPath "icon128.png")

Write-Host ""
Write-Host "All icons created successfully!" -ForegroundColor Green
