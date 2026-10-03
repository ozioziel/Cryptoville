# Contratos de Cryptoville (Rust + Soroban)

Aquí está el contrato de **pago en garantía** (`escrow/`). Se compila en tu PC y se **despliega y usa solo desde [Stellar Lab](https://lab.stellar.org)**. Ni la app ni la API se conectan a la red de Stellar.

## Compilar

Necesitas Rust con el target `wasm32v1-none` y, opcionalmente, la Stellar CLI (solo para compilar y optimizar).

```bash
npm run contract:build
```

Ese comando ejecuta las pruebas, compila y deja el archivo en:

```
contracts/dist/cryptoville_escrow.wasm
```

También muestra el **hash** del `.wasm`, que es el que pide la función `upgrade`.

Para correr solo las pruebas:

```bash
cd contracts && cargo test
```

La prueba de `upgrade` con el `.wasm` real está marcada como `ignore` porque necesita compilar antes:

```bash
cd contracts && cargo test -- --ignored
```

## Desplegar

En Stellar Lab, siguiendo [docs/guia-stellar-lab.md](../docs/guia-stellar-lab.md):

1. **Smart contracts → Upload and deploy contract**.
2. Sube `contracts/dist/cryptoville_escrow.wasm`.
3. Llena los argumentos del constructor y firma con la wallet admin.

La dirección `C…` que te da el Lab va en `ESCROW_CONTRACT_ID` del `.env`.

## Actualizar el contrato sin cambiar su dirección

1. Compila la versión nueva.
2. Súbela en el Lab (solo *Upload*, sin *Deploy*) y copia el hash.
3. Llama a `upgrade(admin, wasm_hash)` desde el Contract Explorer, firmando con la wallet admin.

Los pedidos guardados no se pierden.
