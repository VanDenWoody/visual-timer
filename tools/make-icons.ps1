# Draws the PWA icons: a red 40-minute sector on white.
# Run from this folder: .\make-icons.ps1
Add-Type -AssemblyName System.Drawing

$iconsDir = Join-Path $PSScriptRoot '..\icons'
New-Item -ItemType Directory -Force $iconsDir | Out-Null

foreach ($size in 192, 512) {
  $bmp = [System.Drawing.Bitmap]::new($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::White)
  # 12% padding keeps the disc inside the maskable safe zone (a circle of 80% of the size).
  $pad = [int]($size * 0.12)
  $diameter = $size - 2 * $pad
  $red = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(0xF4, 0x43, 0x36))
  # GDI+ angles start at 3 o'clock; -90 is 12 o'clock. 40 minutes = 240 degrees.
  $g.FillPie($red, $pad, $pad, $diameter, $diameter, -90, 240)
  $bmp.Save((Join-Path $iconsDir "icon-$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $red.Dispose(); $g.Dispose(); $bmp.Dispose()
}
