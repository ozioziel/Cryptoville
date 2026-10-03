# Compila los contratos (escrow y USDC de prueba) a .wasm. NO los despliega: eso se hace en Stellar Lab.
# Uso (PowerShell):  .\scripts\build-contract.ps1 [-SinPruebas]
param([switch]$SinPruebas)
$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location (Join-Path $raiz 'contracts')

if (-not $SinPruebas) {
  Write-Host '==> Pruebas de los contratos'
  cargo test --quiet
  if ($LASTEXITCODE -ne 0) { throw 'Las pruebas de los contratos fallaron' }
}

Write-Host '==> Compilando (wasm32v1-none, release)'
if (Get-Command stellar -ErrorAction SilentlyContinue) {
  stellar contract build
} else {
  cargo build --target wasm32v1-none --release
}
if ($LASTEXITCODE -ne 0) { throw 'No se pudieron compilar los contratos' }

New-Item -ItemType Directory -Force 'dist' | Out-Null
Write-Host ''
Write-Host 'Contratos compilados:' -ForegroundColor Green
foreach ($nombre in @('cryptoville_escrow', 'cryptoville_usdc_prueba')) {
  Copy-Item "target\wasm32v1-none\release\$nombre.wasm" "dist\$nombre.wasm" -Force
  $archivo = Join-Path $raiz "contracts\dist\$nombre.wasm"
  $hash = (Get-FileHash $archivo -Algorithm SHA256).Hash.ToLower()
  Write-Host "  $archivo"
  Write-Host "    $((Get-Item $archivo).Length) bytes - hash $hash"
}
Write-Host 'El hash del escrow es el wasm_hash que pide la funcion upgrade.'
Write-Host 'Siguiente paso: subelos en Stellar Lab -> Smart contracts -> Upload and deploy contract (docs/guia-stellar-lab.md).'
