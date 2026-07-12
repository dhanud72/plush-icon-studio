# Plush Icon Studio — batch renderer for AI agents and humans.
# Usage:  powershell -File generate.ps1 -Spec recipes-sample.json -Out out
# Each item in the recipe file becomes <Out>\<name>.png. See AGENTS.md.
param(
  [string]$Spec = "recipes-sample.json",
  [string]$Out  = "out"
)
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

# Regenerate engine.js from index.html (single source of truth).
$html = Get-Content "$root\index.html" -Raw -Encoding utf8
if ($html -match '(?s)/\*ENGINE-START\*/(.*?)/\*ENGINE-END\*/') {
  Set-Content "$root\engine.js" $Matches[1] -Encoding utf8
} else {
  throw "ENGINE markers not found in index.html"
}

$edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edge)) { $edge = "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe" }
if (-not (Test-Path $edge)) { throw "Microsoft Edge not found" }

$recipes = Get-Content "$root\$Spec" -Raw -Encoding utf8 | ConvertFrom-Json
New-Item -ItemType Directory -Force "$root\$Out" | Out-Null

foreach ($it in $recipes.items) {
  $it | Add-Member -NotePropertyName export -NotePropertyValue $true -Force
  $size = 512; if ($it.size) { $size = $it.size }
  $page = "index.html"; $wh = "$size,$size"
  if ($it.type -eq "ui") { $page = "ui-kit.html"; $wh = "390,844" }
  $enc = [uri]::EscapeDataString(($it | ConvertTo-Json -Compress -Depth 6))
  $url = "file:///" + ($root -replace '\\','/') + "/$page`?spec=$enc"
  $png = "$root\$Out\$($it.name).png"
  if (Test-Path $png) { Remove-Item $png -Force }
  foreach ($try in 1..3) {
    # fresh profile dir per attempt: parallel/successive Edge instances
    # sharing a profile silently skip the screenshot
    $prof = "$env:TEMP\edge-icongen\$($it.name)-$try"
    $eargs = @("--headless=new","--disable-gpu","--user-data-dir=$prof",
      "--window-size=$wh","--virtual-time-budget=9000","--screenshot=$png",$url)
    Start-Process -FilePath $edge -ArgumentList $eargs -Wait -WindowStyle Hidden
    if (Test-Path $png) { break }
    Start-Sleep -Milliseconds 600
  }
  if (Test-Path $png) {
    Write-Output ("rendered {0} -> {1}\{2}.png" -f $it.name, $Out, $it.name)
  } else {
    Write-Warning ("FAILED: {0}" -f $it.name)
  }
}
Remove-Item "$env:TEMP\edge-icongen" -Recurse -Force -ErrorAction SilentlyContinue
Write-Output "done: $($recipes.items.Count) file(s) in $root\$Out"
