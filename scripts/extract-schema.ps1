# Regenerates data\schema.json from the Archipelago source clone. Read-only on that clone.
param(
    [string]$ApRoot = (Join-Path $PSScriptRoot '..\..\archipelago-dev\Archipelago')
)

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$ap = Resolve-Path $ApRoot
$python = Join-Path $ap '.venv\Scripts\python.exe'
if (-not (Test-Path $python)) { throw "No venv Python at $python" }

& $python -W ignore (Join-Path $root 'extractor\schema_extract.py') --ap-root $ap --out (Join-Path $root 'data\schema.json')
if ($LASTEXITCODE -ne 0) { throw "Extraction failed with exit code $LASTEXITCODE" }
