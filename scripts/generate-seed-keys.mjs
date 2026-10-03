#!/usr/bin/env node
// Genera las llaves de Stellar de los 5 usuarios de ejemplo + la cuenta emisora del USDC de prueba.
// Se generan SIN conexión (no toca la red) y se guardan en .seed-keys.json (ignorado por git).
// Uso: npm run seed:keys            (no sobrescribe si ya existe)
//      npm run seed:keys -- --forzar (genera llaves nuevas)
import { Keypair } from '@stellar/stellar-sdk';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const archivo = path.join(raiz, '.seed-keys.json');
const forzar = process.argv.includes('--forzar');

export const USUARIOS_EJEMPLO = [
  { clave: 'arbitro', nombre: 'Equipo Cryptoville', rol: 'arbitro' },
  { clave: 'ana', nombre: 'Ana Ruiz', rol: 'usuario' },
  { clave: 'luis', nombre: 'Luis Méndez', rol: 'usuario' },
  { clave: 'sofia', nombre: 'Sofía Paredes', rol: 'usuario' },
  { clave: 'diego', nombre: 'Diego Torres', rol: 'usuario' },
];

if (existsSync(archivo) && !forzar) {
  const actual = JSON.parse(readFileSync(archivo, 'utf8'));
  console.log(`Ya existe ${path.relative(raiz, archivo)} con ${actual.usuarios.length} usuarios (usa --forzar para regenerar).`);
  process.exit(0);
}

const par = () => {
  const k = Keypair.random();
  return { publica: k.publicKey(), secreta: k.secret() };
};

const datos = {
  advertencia:
    'LLAVES SOLO PARA TESTNET. No las uses en mainnet ni les envíes dinero real. Este archivo no se sube a git.',
  red: 'testnet',
  creado_en: new Date().toISOString(),
  emisor_usdc: { nombre: 'Emisor del USDC de prueba', ...par() },
  usuarios: USUARIOS_EJEMPLO.map((u) => ({ ...u, ...par() })),
};

writeFileSync(archivo, JSON.stringify(datos, null, 2) + '\n', { mode: 0o600 });
console.log(`Listo: ${path.relative(raiz, archivo)}`);
console.log('  ⚠ Solo para testnet. Siguiente paso: fondéalas en Stellar Lab (docs/guia-stellar-lab.md).');
for (const u of datos.usuarios) console.log(`  ${u.nombre.padEnd(20)} ${u.publica}`);
console.log(`  ${'Emisor USDC'.padEnd(20)} ${datos.emisor_usdc.publica}`);
