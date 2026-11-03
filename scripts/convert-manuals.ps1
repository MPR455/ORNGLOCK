param(
  [string]$ManualsPath = (Join-Path $PSScriptRoot '../工作手冊'),
  [string]$OfficePath = 'C:\Program Files\LibreOffice\program\soffice.com'
)

$ErrorActionPreference = 'Stop'
$manualsRoot = (Resolve-Path -LiteralPath $ManualsPath).Path
if (-not (Test-Path -LiteralPath $OfficePath)) { throw "LibreOffice not found: $OfficePath" }
$profilePath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../qa/manuals/office-profile'))
New-Item -ItemType Directory -Path $profilePath -Force | Out-Null
$profileUri = ([Uri]$profilePath).AbsoluteUri
$documents = @(Get-ChildItem -LiteralPath $manualsRoot -Recurse -File | Where-Object { $_.Extension -in '.doc', '.docx' })
foreach ($document in $documents) {
  $targetPath = [IO.Path]::ChangeExtension($document.FullName, '.pdf')
  if (Test-Path -LiteralPath $targetPath) { continue }
  & $OfficePath "-env:UserInstallation=$profileUri" --headless --convert-to pdf --outdir $document.DirectoryName $document.FullName
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $targetPath)) {
    throw "PDF conversion failed: $($document.FullName)"
  }
}
Write-Output "PDFs ready for $($documents.Count) Word documents. Original files retained."
