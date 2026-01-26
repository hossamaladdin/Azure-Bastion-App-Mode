# Package Azure Bastion App Mode Extension
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Azure Bastion App Mode - Packager" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$extensionPath = Join-Path $PSScriptRoot "..\extension"
$zipPath = Join-Path $PSScriptRoot "..\..\Azure-Bastion-App-Mode.zip"

# Check if icons exist
$iconsExist = (Test-Path "$extensionPath\icon16.png") -and
               (Test-Path "$extensionPath\icon32.png") -and
               (Test-Path "$extensionPath\icon48.png") -and
               (Test-Path "$extensionPath\icon128.png")

if (-not $iconsExist) {
    Write-Host "WARNING: Icons not found!" -ForegroundColor Yellow
    Write-Host "Please generate icons first:" -ForegroundColor Yellow
    Write-Host "1. Open generate-icons.html in Chrome" -ForegroundColor Yellow
    Write-Host "2. Click 'Generate All Icons' button" -ForegroundColor Yellow
    Write-Host "3. Save all 4 PNG files to this folder" -ForegroundColor Yellow
    Write-Host ""

    # Open the icon generator
    $iconGenPath = Join-Path $extensionPath "generate-icons.html"
    Start-Process $iconGenPath

    Write-Host "Press any key once icons are saved..." -ForegroundColor Yellow
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}

# Files to include in the package
$filesToPackage = @(
    "manifest.json",
    "background.js",
    "content.js",
    "README.txt",
    "icon16.png",
    "icon32.png",
    "icon48.png",
    "icon128.png"
)

# Check all files exist
$allFilesExist = $true
foreach ($file in $filesToPackage) {
    if (-not (Test-Path (Join-Path $extensionPath $file))) {
        Write-Host "ERROR: Missing file: $file" -ForegroundColor Red
        $allFilesExist = $false
    }
}

if (-not $allFilesExist) {
    Write-Host ""
    Write-Host "Cannot package - missing required files!" -ForegroundColor Red
    exit 1
}

# Remove old zip if exists
if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}

# Create the zip file
Write-Host "Creating package..." -ForegroundColor Green

Add-Type -Assembly "System.IO.Compression.FileSystem"
$zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)

foreach ($file in $filesToPackage) {
    $filePath = Join-Path $extensionPath $file
    $entryName = $file
    Write-Host "  Adding: $file"
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $filePath, $entryName, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
}

$zip.Dispose()

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "SUCCESS! Extension packaged" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Package location:" -ForegroundColor Cyan
Write-Host $zipPath -ForegroundColor White
Write-Host ""
Write-Host "To upload to Chrome Web Store:" -ForegroundColor Yellow
Write-Host "1. Go to: https://chrome.google.com/webstore/devconsole" -ForegroundColor Yellow
Write-Host "2. Click 'New Item'" -ForegroundColor Yellow
Write-Host "3. Upload the .zip file" -ForegroundColor Yellow
Write-Host ""
Write-Host "To install locally:" -ForegroundColor Yellow
Write-Host "1. Extract the .zip file" -ForegroundColor Yellow
Write-Host "2. Go to chrome://extensions/" -ForegroundColor Yellow
Write-Host "3. Enable Developer Mode" -ForegroundColor Yellow
Write-Host "4. Click 'Load unpacked' and select the extracted folder" -ForegroundColor Yellow
Write-Host ""

# Open the folder containing the zip
Start-Process explorer.exe -ArgumentList "/select,`"$zipPath`""
