#!/usr/bin/env node
// Prepara todo para desarrollo local con un solo comando: `npm run setup`
//  1. Arranca Supabase local (Docker) si no está corriendo.
//  2. Crea/actualiza el .env con las llaves de Supabase local.
//  3. Aplica las migraciones, genera las llaves de ejemplo y carga los datos de ejemplo.
// Luego: `npm run dev` y abre http://localhost:5173
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVICIOS_EXCLUIDOS = 'studio,imgproxy,edge-runtime,logflare,vector,supavisor,mailpit,postgres-meta';

const correr = (cmd, opciones = {}) => execSync(cmd, { cwd: raiz, stdio: 'inherit', ...opciones });
const leer = (cmd) => execSync(cmd, { cwd: raiz, stdio: ['ignore', 'pipe', 'pipe'] }).toString();

function paso(texto) {
  console.log(`\n\x1b[36m▶ ${texto}\x1b[0m`);
}

function estadoSupabase() {
  try {
    const salida = leer('npx supabase status -o json');
    return JSON.parse(salida.slice(salida.indexOf('{')));
  } catch {
    return null;
  }
}

try {
  leer('docker info');
} catch {
  console.error('Docker no está corriendo. Abre Docker Desktop y vuelve a ejecutar `npm run setup`.');
  process.exit(1);
}

paso('Supabase local');
let estado = estadoSupabase();
if (!estado?.API_URL) {
  console.log('Arrancando Supabase local (la primera vez descarga imágenes, puede tardar)…');
  correr(`npx supabase start -x ${SERVICIOS_EXCLUIDOS}`);
  estado = estadoSupabase();
}
if (!estado?.API_URL) {
  console.error('No se pudo leer el estado de Supabase local (`npx supabase status`).');
  process.exit(1);
}
console.log(`Supabase local en ${estado.API_URL}`);

// `supabase start` termina cuando los contenedores arrancan, pero Auth puede tardar unos
// segundos más en responder (pasa sobre todo en CI). Se espera antes de migrar y cargar datos.
async function esperarAuth(url, llave) {
  for (let intento = 1; intento <= 60; intento++) {
    try {
      const r = await fetch(`${url}/auth/v1/health`, { headers: { apikey: llave } });
      if (r.ok) return;
    } catch {
      // Todavía no responde.
    }
    await new Promise((listo) => setTimeout(listo, 2000));
  }
  console.error('Supabase Auth no respondió después de 2 minutos (revisa `npx supabase status`).');
  process.exit(1);
}
await esperarAuth(estado.API_URL, estado.ANON_KEY ?? estado.PUBLISHABLE_KEY);
console.log('Supabase Auth responde.');

paso('Llaves de los usuarios de ejemplo (solo testnet)');
correr('node scripts/generate-seed-keys.mjs');
const llaves = JSON.parse(readFileSync(path.join(raiz, '.seed-keys.json'), 'utf8'));
const arbitroEjemplo = llaves.usuarios.find((u) => u.rol === 'arbitro')?.publica ?? '';

paso('Archivo .env');
const plantilla = readFileSync(path.join(raiz, '.env.local.example'), 'utf8');
const actual = existsSync(path.join(raiz, '.env')) ? readFileSync(path.join(raiz, '.env'), 'utf8') : '';
const valoresActuales = Object.fromEntries(
  actual
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
const automaticos = {
  SUPABASE_URL: estado.API_URL,
  SUPABASE_ANON_KEY: estado.ANON_KEY ?? estado.PUBLISHABLE_KEY,
  SUPABASE_SERVICE_ROLE_KEY: estado.SERVICE_ROLE_KEY ?? estado.SECRET_KEY,
  DATABASE_URL: estado.DB_URL,
  DIRECT_URL: estado.DB_URL,
};
const salida = plantilla
  .split(/\r?\n/)
  .map((linea) => {
    const m = /^([A-Z_]+)=(.*)$/.exec(linea);
    if (!m) return linea;
    const [, nombre, defecto] = m;
    if (automaticos[nombre]) return `${nombre}=${automaticos[nombre]}`;
    // Conserva lo que ya llenaste (contrato, token, árbitro…).
    if (valoresActuales[nombre]) return `${nombre}=${valoresActuales[nombre]}`;
    if (nombre === 'AUTH_PASSWORD_SECRET') return `${nombre}=${randomBytes(32).toString('hex')}`;
    // El árbitro de ejemplo es el admin con el que conviene desplegar el contrato en testnet.
    if (nombre === 'ARBITRO_DIRECCION') return `${nombre}=${arbitroEjemplo}`;
    return `${nombre}=${defecto}`;
  })
  .join('\n');
writeFileSync(path.join(raiz, '.env'), salida);
console.log('.env listo (las variables de Stellar que ya tenías se conservaron).');

paso('Paquete compartido');
correr('npm run build -w @cryptoville/shared');

paso('Migraciones de la base de datos');
correr('npm run db:migrate');

paso('Datos de ejemplo');
correr('npm run db:seed');

console.log('\n\x1b[32m✔ Todo listo.\x1b[0m Ahora ejecuta:  npm run dev   y abre http://localhost:5173');
console.log('  Para probar con las wallets de ejemplo, importa sus llaves secretas (.seed-keys.json) en Freighter (testnet).');
