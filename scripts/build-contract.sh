#!/usr/bin/env bash
# Compila los contratos (escrow y USDC de prueba) a .wasm. NO los despliega: eso se hace en Stellar Lab.
# Uso: bash scripts/build-contract.sh [--sin-pruebas]
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RAIZ/contracts"

if [ "${1:-}" != "--sin-pruebas" ]; then
  echo "==> Pruebas de los contratos"
  cargo test --quiet
fi

echo "==> Compilando (wasm32v1-none, release)"
# soroban-sdk 28 solo se deja compilar a .wasm con la Stellar CLI (v25.2 o superior).
if ! command -v stellar >/dev/null 2>&1; then
  echo "Falta la Stellar CLI: instálala desde https://developers.stellar.org/docs/tools/cli" >&2
  exit 1
fi
stellar contract build

mkdir -p dist
echo
echo "✔ Contratos compilados:"
for NOMBRE in cryptoville_escrow cryptoville_usdc_prueba; do
  cp "target/wasm32v1-none/release/$NOMBRE.wasm" "dist/$NOMBRE.wasm"
  ARCHIVO="$RAIZ/contracts/dist/$NOMBRE.wasm"
  HASH=$(sha256sum "$ARCHIVO" 2>/dev/null | cut -d' ' -f1 || shasum -a 256 "$ARCHIVO" | cut -d' ' -f1)
  echo "  $ARCHIVO"
  echo "    $(wc -c < "$ARCHIVO" | tr -d ' ') bytes · hash $HASH"
done
echo "El hash del escrow es el wasm_hash que pide la función upgrade."
echo "Siguiente paso: súbelos en Stellar Lab → Smart contracts → Upload and deploy contract (docs/guia-stellar-lab.md)."
