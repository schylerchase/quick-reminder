param(
  [string]$VaultPath
)

$ErrorActionPreference = "Stop"
$Repo = "schylerchase/quick-reminder"
$PluginId = "quick-reminder"
$Assets = @("main.js", "manifest.json", "styles.css")

Write-Host "Quick Reminder installer"
Write-Host ""

if (-not $VaultPath) {
  try {
    Add-Type -AssemblyName System.Windows.Forms
    $Dialog = New-Object System.Windows.Forms.FolderBrowserDialog
    $Dialog.Description = "Select your Obsidian vault folder"
    $Dialog.ShowNewFolderButton = $false
    if ($Dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
      $VaultPath = $Dialog.SelectedPath
    }
  } catch {
    $VaultPath = Read-Host "Enter your Obsidian vault folder path"
  }
}

if (-not $VaultPath) {
  throw "No vault path selected."
}

$ObsidianDir = Join-Path $VaultPath ".obsidian"
if (-not (Test-Path $ObsidianDir)) {
  throw "That does not look like an Obsidian vault: $VaultPath"
}

$InstallDir = Join-Path $ObsidianDir "plugins\$PluginId"
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

foreach ($Asset in $Assets) {
  $Url = "https://github.com/$Repo/releases/latest/download/$Asset"
  $OutFile = Join-Path $InstallDir $Asset
  Write-Host "Downloading $Asset"
  Invoke-WebRequest -Uri $Url -OutFile $OutFile
}

Write-Host ""
Write-Host "Installed Quick Reminder to:"
Write-Host $InstallDir
Write-Host ""
Write-Host "In Obsidian, reload or enable Quick Reminder under Settings > Community plugins."
