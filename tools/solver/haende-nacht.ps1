# haende-nacht.ps1 — rechnet die eigenen Hände (my-hands.js) mit vollem Baum.
# Eingabe und Ergebnisse liegen privat in Dokumente\Poker-Handlog\solver,
# nicht im Repo. Fortsetzbar: fertige Spots werden übersprungen.
#
#   powershell -ExecutionPolicy Bypass -File tools\solver\haende-nacht.ps1 [-Max 20]
param([int]$Max = 20)

$ErrorActionPreference = 'Continue'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Set-Location $root
$dir = Join-Path $env:USERPROFILE 'Documents\Poker-Handlog\solver'
New-Item -ItemType Directory -Force $dir | Out-Null
$log = Join-Path $dir 'nachtlauf.log'
$exe = Join-Path $PSScriptRoot 'target\release\pt-solver-batch.exe'

Add-Type -Namespace PT -Name Power -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint f);'
[PT.Power]::SetThreadExecutionState([uint32]'0x80000001') | Out-Null   # wach bleiben, Bildschirm darf aus
try {
  "=== Start $(Get-Date -Format 'dd.MM.yyyy HH:mm') (eigene Hände, voller Baum) ===" | Tee-Object -FilePath $log -Append
  node tools\solver\my-hands.js --max $Max 2>&1 | Tee-Object -FilePath $log -Append
  & $exe (Join-Path $dir 'hands-spots.txt') (Join-Path $dir 'out') --exploit 0.5 2>&1 | ForEach-Object { "$_" } | Tee-Object -FilePath $log -Append
  "=== Ende $(Get-Date -Format 'dd.MM.yyyy HH:mm') ===" | Tee-Object -FilePath $log -Append
} finally {
  [PT.Power]::SetThreadExecutionState([uint32]'0x80000000') | Out-Null
}
