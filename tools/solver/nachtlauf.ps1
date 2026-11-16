# nachtlauf.ps1 — rechnet alle noch fehlenden Solver-Spots und aktualisiert
# den Index für den Trainer. Bereits gerechnete Spots werden übersprungen;
# ein abgebrochener Lauf macht beim nächsten Start einfach weiter.
#
# Start: Rechtsklick -> "Mit PowerShell ausführen", oder
#   powershell -ExecutionPolicy Bypass -File tools\solver\nachtlauf.ps1
#
# Hält den PC wach, solange das Skript läuft (nur für diesen Prozess,
# keine Energieeinstellung wird geändert). Bildschirm darf ausgehen.
#
# -Full: voller Baum (genauer, ~10 h für alle 30), sonst schnell (~1 h).
param([switch]$Full)

# 'Continue': Windows PowerShell 5.1 macht aus jeder stderr-Zeile eines
# Programms einen Fehler — mit 'Stop' brach der Lauf nach der ersten
# Fortschrittsmeldung ab.
$ErrorActionPreference = 'Continue'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Set-Location $root
$log = Join-Path $PSScriptRoot 'nachtlauf.log'
$exe = Join-Path $PSScriptRoot 'target\release\pt-solver-batch.exe'

if (-not (Test-Path $exe)) {
  Write-Host 'Batch-Programm fehlt, baue es ...'
  $env:Path += ";$env:USERPROFILE\.cargo\bin"
  Push-Location $PSScriptRoot; cargo build --release; Pop-Location
}

Add-Type -Namespace PT -Name Power -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint f);'
# ES_CONTINUOUS | ES_SYSTEM_REQUIRED
[PT.Power]::SetThreadExecutionState([uint32]'0x80000001') | Out-Null

try {
  "=== Start $(Get-Date -Format 'dd.MM.yyyy HH:mm') $(if ($Full) { '(voller Baum)' } else { '(schnell)' }) ===" | Tee-Object -FilePath $log -Append
  if ($Full) {
    # Voller Baum (Turn/River wie im Export), 0,5 % Pot: ~25 min je Spot statt ~3.
    # Rechnet in einen eigenen Ordner (fortsetzbar) und ersetzt danach die
    # schnellen Lösungen in data\solver.
    $env:PT_SOLVE = 'full'
    $out = 'tools\solver\out-full'
    node tools\solver\make-spots.js 2>&1 | Tee-Object -FilePath $log -Append
    & $exe tools\solver\spots.txt $out --exploit 0.5 2>&1 | ForEach-Object { "$_" } | Tee-Object -FilePath $log -Append
    Get-ChildItem "$out\*.json" | Copy-Item -Destination data\solver -Force
    "$((Get-ChildItem "$out\*.json").Count) volle Lösungen nach data\solver kopiert" | Tee-Object -FilePath $log -Append
  } else {
    node tools\solver\make-spots.js 2>&1 | Tee-Object -FilePath $log -Append
    # Genauigkeit 1 % des Pots: für Lernzwecke genug, deutlich schneller als 0,5 %.
    & $exe tools\solver\spots.txt data\solver --exploit 1.0 2>&1 | ForEach-Object { "$_" } | Tee-Object -FilePath $log -Append
  }
  node tools\solver\build-index.js 2>&1 | Tee-Object -FilePath $log -Append
  "=== Ende $(Get-Date -Format 'dd.MM.yyyy HH:mm') ===" | Tee-Object -FilePath $log -Append
} finally {
  [PT.Power]::SetThreadExecutionState([uint32]'0x80000000') | Out-Null
}
