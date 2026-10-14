# Regenerates data\world-features.json (check counts, early openness, needed files, emulator systems) from an
# Archipelago source folder. Read-only on that folder. Takes about a minute.
param(
    [string]$ApRoot = (Join-Path $PSScriptRoot '..\..\archipelago-dev\Archipelago')
)

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$ap = Resolve-Path $ApRoot
$python = Join-Path $ap '.venv\Scripts\python.exe'
if (-not (Test-Path $python)) { throw "No venv Python at $python" }

& $python -B -X utf8 -W ignore (Join-Path $root 'engine\seed_engine.py') --ap-root $ap --scan-all (Join-Path $root 'data\world-features.json')
if ($LASTEXITCODE -ne 0) { throw "Scan failed with exit code $LASTEXITCODE" }
