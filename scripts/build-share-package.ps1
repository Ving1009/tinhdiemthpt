$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression.FileSystem

$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$outputDir = Join-Path $projectRoot "outputs"
$outputPath = Join-Path $outputDir "tinh-diem-thpt.zip"
$stagingRoot = Join-Path ([IO.Path]::GetTempPath()) ("tinh-diem-thpt-package-" + [Guid]::NewGuid().ToString("N"))

$runtimeDirectories = @("public", "server", "lib", "supabase")
$runtimeFiles = @(
  "data/universities.json",
  "data/majors.json",
  "data/combinations.json",
  "data/subjects.json",
  "data/transcript-subjects.json",
  "data/certificate-conversions.json",
  ".vscode/settings.json",
  ".vscode/tasks.json",
  ".env.example",
  ".gitignore",
  "package.json",
  "package-lock.json",
  "README.md"
)

try {
  New-Item -ItemType Directory -Path $stagingRoot | Out-Null
  foreach ($directory in $runtimeDirectories) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $directory) -Destination (Join-Path $stagingRoot $directory) -Recurse
  }
  foreach ($file in $runtimeFiles) {
    $source = Join-Path $projectRoot $file
    $destination = Join-Path $stagingRoot $file
    New-Item -ItemType Directory -Path (Split-Path $destination) -Force | Out-Null
    Copy-Item -LiteralPath $source -Destination $destination
  }

  # This ZIP intentionally contains runtime files only. Keep its manifest from
  # advertising checks and packaging commands whose source files are excluded.
  $runtimeManifestPath = Join-Path $stagingRoot "package.json"
  $runtimeManifest = Get-Content -LiteralPath $runtimeManifestPath -Raw | ConvertFrom-Json
  $runtimeManifest.scripts = [ordered]@{
    start = "node server/server.js"
    dev = "node --watch-preserve-output --watch-path=data --watch-path=server --watch-path=lib --watch-path=public server/server.js"
  }
  $runtimeManifestJson = $runtimeManifest | ConvertTo-Json -Depth 20
  [IO.File]::WriteAllText($runtimeManifestPath, $runtimeManifestJson, [Text.UTF8Encoding]::new($false))

  New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
  if (Test-Path -LiteralPath $outputPath) { Remove-Item -LiteralPath $outputPath -Force }
  [IO.Compression.ZipFile]::CreateFromDirectory($stagingRoot, $outputPath, [IO.Compression.CompressionLevel]::Optimal, $false)

  $archive = [IO.Compression.ZipFile]::OpenRead($outputPath)
  try {
    $blocked = @($archive.Entries | Where-Object {
      ($_.FullName -match '(^|[\\/])\.env($|\.)' -and $_.FullName -notmatch '(^|[\\/])\.env\.example$') -or
      $_.FullName -match '(^|[\\/])(node_modules|\.npm-cache|tmp|work)([\\/]|$)'
    })
    if ($blocked.Count) { throw "Bản đóng gói chứa đường dẫn không được phép." }
    foreach ($entry in $archive.Entries) {
      if ($entry.Length -eq 0 -or $entry.Length -gt 2MB -or $entry.FullName -notmatch '\.(env|js|json|html|md|txt|toml|ya?ml)$') { continue }
      $reader = [IO.StreamReader]::new($entry.Open())
      try { $content = $reader.ReadToEnd() } finally { $reader.Dispose() }
      $secretPattern = '(?im)(AIza[0-9A-Za-z_-]{20,}|^[ \t]*(?:GEMINI_API_KEY(?:_\d+)?|GEMINI_API_KEYS|OCR_SPACE_API_KEY(?:_\d+)?|OCR_SPACE_API_KEYS|SUPABASE_SECRET_KEY)[ \t]*=[ \t]*(?![ \t]*(?:$|your[_-]|replace[_-]|change[_-]?me|example|x{3,}))[^ \t\r\n#]{8,}[ \t]*$)'
      if ($content -match $secretPattern) { throw "Phát hiện giá trị giống khóa API trong bản đóng gói." }
    }
    $manifestEntry = $archive.GetEntry("package.json")
    $manifestReader = [IO.StreamReader]::new($manifestEntry.Open())
    try { $packagedManifest = $manifestReader.ReadToEnd() | ConvertFrom-Json } finally { $manifestReader.Dispose() }
    if (-not $packagedManifest.scripts.start -or -not $packagedManifest.scripts.dev) { throw "Bản runtime thiếu lệnh chạy." }
    $packagedScriptNames = @($packagedManifest.scripts.PSObject.Properties.Name)
    if ($packagedScriptNames -contains "check" -or $packagedScriptNames -contains "test" -or $packagedScriptNames -contains "package:share") { throw "Bản runtime còn lệnh cần tệp nguồn đã loại khỏi ZIP." }
    Write-Output ("Created {0} ({1} files, {2:N0} bytes)." -f $outputPath, $archive.Entries.Count, (Get-Item -LiteralPath $outputPath).Length)
  } finally {
    $archive.Dispose()
  }
} finally {
  if (Test-Path -LiteralPath $stagingRoot) { Remove-Item -LiteralPath $stagingRoot -Recurse -Force }
}
