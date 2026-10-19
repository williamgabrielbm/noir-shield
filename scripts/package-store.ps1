param(
  [string]$Destination
)

$ErrorActionPreference = 'Stop'
$project = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$dist = Join-Path $project 'dist'
$manifestPath = Join-Path $dist 'manifest.json'
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
  throw 'Execute npm run build antes de criar o pacote.'
}
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$manifest.permissions = @($manifest.permissions | Where-Object { $_ -ne 'declarativeNetRequestFeedback' }) + 'activeTab'
if (-not $Destination) {
  $Destination = Join-Path (Split-Path -Parent $project) "NoirShield-CWS-$($manifest.version).zip"
}
$target = [IO.Path]::GetFullPath($Destination)
if (Test-Path -LiteralPath $target) {
  throw "O arquivo já existe: $target. Escolha outro destino para não sobrescrevê-lo."
}
$parent = [IO.Path]::GetDirectoryName($target)
if (-not (Test-Path -LiteralPath $parent -PathType Container)) {
  throw "A pasta de destino não existe: $parent"
}

$files = @('manifest.json', 'background.js', 'content.js', 'youtube-main.js', 'popup.html', 'popup.js', 'options.html', 'options.js', 'ui.css', 'README.md', 'PRIVACY.md', 'LICENSE')
$files += Get-ChildItem -LiteralPath (Join-Path $dist 'docs') -File -Recurse | ForEach-Object { [IO.Path]::GetRelativePath($dist, $_.FullName) }
$files += Get-ChildItem -LiteralPath (Join-Path $dist 'icons') -File -Recurse | ForEach-Object { [IO.Path]::GetRelativePath($dist, $_.FullName) }
$files += Get-ChildItem -LiteralPath (Join-Path $dist 'rules') -File -Recurse | ForEach-Object { [IO.Path]::GetRelativePath($dist, $_.FullName) }
foreach ($relative in $files) {
  if (-not (Test-Path -LiteralPath (Join-Path $dist $relative) -PathType Leaf)) {
    throw "Arquivo obrigatório ausente: $relative"
  }
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::Open($target, [IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($relative in $files) {
    $entry = $relative.Replace('\', '/')
    if ($entry -eq 'manifest.json') {
      $zipEntry = $archive.CreateEntry($entry, [IO.Compression.CompressionLevel]::Optimal)
      $writer = [IO.StreamWriter]::new($zipEntry.Open(), [Text.UTF8Encoding]::new($false))
      try { $writer.Write(($manifest | ConvertTo-Json -Depth 20 -Compress)) } finally { $writer.Dispose() }
    } else {
      [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, (Join-Path $dist $relative), $entry, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
  }
} finally {
  $archive.Dispose()
}
$verify = [IO.Compression.ZipFile]::OpenRead($target)
try {
  $names = @($verify.Entries | ForEach-Object FullName)
  if (-not ($names -contains 'manifest.json') -or ($names | Where-Object { $_ -match '(^|/)_metadata/' })) {
    throw 'Pacote inválido: manifest.json ausente da raiz ou metadados locais incluídos.'
  }
  $manifestEntry = $verify.GetEntry('manifest.json')
  $reader = [IO.StreamReader]::new($manifestEntry.Open())
  try { $packedManifest = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
  foreach ($script in @($packedManifest.content_scripts | ForEach-Object { $_.js }) + @($packedManifest.background.service_worker)) {
    if (-not ($names -contains $script)) { throw "Script declarado no manifest ausente do pacote: $script" }
  }
  if (($packedManifest.permissions -contains 'declarativeNetRequestFeedback') -or -not ($packedManifest.permissions -contains 'activeTab')) {
    throw 'Pacote inválido: permissões de publicação incorretas.'
  }
} finally {
  $verify.Dispose()
}
Write-Output "Pacote Chrome Web Store: $target ($($files.Count) arquivos)"
