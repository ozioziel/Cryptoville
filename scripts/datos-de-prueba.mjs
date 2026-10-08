// Datos de prueba de Cryptoville v2: cuentas «prueba-…» listas para probar cada función, SOLO en local y testnet.
//
// Uso (desde la raíz del proyecto):
//   npm run datos:prueba -- --llaves   1) genera las llaves y muestra las direcciones para desplegar el contrato v2
//   npm run datos:prueba               2) crea todo (con la API corriendo: npm run dev)
//   npm run datos:prueba -- --borrar   borra solo las cuentas «prueba-…» (conserva las llaves)
//   npm run datos:prueba -- --arbitro  da el rol de árbitro a la cuenta que entró con la wallet de ARBITRO_DIRECCION
//
// - Las llaves van a .prueba-keys.json (ignorado por git). Solo sirven en testnet.
// - Los pedidos se crean DE VERDAD en el contrato v2 de testnet: el script hace de wallet de cada cuenta
//   (pide la transacción a la API, la firma con la llave de prueba y la envía), igual que la app.
// - No borra nada más y no toca a los usuarios de ejemplo del seed (Ana, Luis, Sofía, Diego).
// - Qué probar con cada cuenta: docs/propuestas/guia-de-pruebas.md.
import { Address, BASE_FEE, Contract, Keypair, Networks, TransactionBuilder, nativeToScVal, rpc } from '@stellar/stellar-sdk';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import pg from 'pg';
import { DOCUMENTOS_LEGALES, usdcAUnidades } from '../packages/shared/dist/index.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(raiz, '.env'), quiet: true });

const ARCHIVO_LLAVES = path.join(raiz, '.prueba-keys.json');
const ARCHIVO_DATOS = path.join(raiz, '.prueba-datos.json');
const API = (process.env.DATOS_PRUEBA_API ?? 'http://localhost:3000').replace(/\/$/, '') + '/api';
const RPC = process.env.STELLAR_RPC_URL || 'https://soroban-testnet.stellar.org';
const DIA = 86_400_000;
const enDias = (d) => new Date(Date.now() + d * DIA).toISOString();
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const args = process.argv.slice(2);

// Cuentas con sesión en la app (cada una prueba algo). Las de relleno se crean según haga falta.
const CUENTAS = [
  'prueba-cliente',
  'prueba-proveedor',
  'prueba-arbitro',
  'prueba-sebusca',
  'prueba-locales',
  'prueba-portafolio',
  'prueba-chat-a',
  'prueba-chat-b',
  'prueba-wallets',
  'prueba-kyc',
  'prueba-reportado',
];
const RELLENO_MAX = 7;
// Llaves sin cuenta en la app: tesorería del contrato v2, llave de mantenimiento y la segunda wallet de prueba-wallets.
const EXTRA = ['tesoreria', 'mantenimiento', 'prueba-wallets-2'];

// ---------------------------------------------------------------
// Llaves
// ---------------------------------------------------------------

function llaves() {
  if (process.env.STELLAR_NETWORK === 'mainnet') {
    console.error('Los datos de prueba no corren en mainnet.');
    process.exit(1);
  }
  const actual = existsSync(ARCHIVO_LLAVES) ? JSON.parse(readFileSync(ARCHIVO_LLAVES, 'utf8')) : null;
  const datos = actual ?? {
    advertencia: 'LLAVES SOLO PARA TESTNET Y DATOS DE PRUEBA. No las uses en mainnet ni les envíes dinero real. Este archivo no se sube a git.',
    red: 'testnet',
    creado_en: new Date().toISOString(),
    cuentas: {},
    extra: {},
  };
  const nueva = () => {
    const k = Keypair.random();
    return { publica: k.publicKey(), secreta: k.secret() };
  };
  let cambio = !actual;
  for (const c of [...CUENTAS, ...Array.from({ length: RELLENO_MAX }, (_, i) => `prueba-relleno-${String(i + 1).padStart(2, '0')}`)]) {
    if (!datos.cuentas[c]) {
      datos.cuentas[c] = nueva();
      cambio = true;
    }
  }
  for (const e of EXTRA) {
    if (!datos.extra[e]) {
      datos.extra[e] = nueva();
      cambio = true;
    }
  }
  if (cambio) writeFileSync(ARCHIVO_LLAVES, JSON.stringify(datos, null, 2) + '\n', { mode: 0o600 });
  return datos;
}

async function friendbot(direccion) {
  const r = await fetch(`https://friendbot.stellar.org/?addr=${direccion}`);
  // Si ya estaba fondeada, Friendbot responde con error: no pasa nada.
  if (!r.ok && !(await r.text()).includes('createAccountAlreadyExist')) console.warn(`  (Friendbot no fondeó ${direccion.slice(0, 6)}…)`);
}

// ---------------------------------------------------------------
// API de Cryptoville (con reintentos si el límite de peticiones frena)
// ---------------------------------------------------------------

async function api(ruta, { token, cuerpo, metodo } = {}) {
  for (let intento = 0; intento < 8; intento++) {
    const r = await fetch(API + ruta, {
      method: metodo ?? (cuerpo ? 'POST' : 'GET'),
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    if (r.status === 429) {
      process.stdout.write('  (la API pide esperar: límite de peticiones; reintento en 20 s)\n');
      await espera(20_000);
      continue;
    }
    const datos = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${metodo ?? (cuerpo ? 'POST' : 'GET')} ${ruta} → ${r.status}: ${JSON.stringify(datos.mensaje ?? datos)}`);
    return datos;
  }
  throw new Error(`${ruta}: la API siguió frenando las peticiones`);
}

function firmaSep53(secreta, mensaje) {
  const hash = createHash('sha256').update(Buffer.concat([Buffer.from('Stellar Signed Message:\n', 'utf8'), Buffer.from(mensaje, 'utf8')])).digest();
  return Buffer.from(Keypair.fromSecret(secreta).sign(hash)).toString('base64');
}

async function entrar(nombre, llave) {
  const d = await api('/auth/desafio', { cuerpo: { direccion: llave.publica } });
  const v = await api('/auth/verificar', { cuerpo: { direccion: llave.publica, nonce: d.nonce, firma: firmaSep53(llave.secreta, d.mensaje) } });
  return { nombre, id: v.usuario.id, token: v.access_token, ...llave };
}

/** Hace de wallet: la API arma la transacción, se firma con la llave de prueba y la API la envía y la verifica. */
async function firmar(s, cuerpo) {
  const p = await api('/transacciones/preparar', { token: s.token, cuerpo: { ...cuerpo, direccion: s.publica } });
  const tx = TransactionBuilder.fromXDR(p.xdr, p.passphrase);
  tx.sign(Keypair.fromSecret(s.secreta));
  return api('/transacciones/enviar', { token: s.token, cuerpo: { id: p.id, xdr_firmado: tx.toXDR() } });
}

/** Emite USDC de prueba con el emisor del token (el de .seed-keys.json). */
async function emitirUsdc(token, emisor, destino, usdc) {
  const servidor = new rpc.Server(RPC, { allowHttp: RPC.startsWith('http://') });
  const par = Keypair.fromSecret(emisor.secreta);
  const cuenta = await servidor.getAccount(par.publicKey());
  const tx = new TransactionBuilder(cuenta, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
    .addOperation(new Contract(token).call('mint', new Address(destino).toScVal(), nativeToScVal(BigInt(usdcAUnidades(usdc)), { type: 'i128' })))
    .setTimeout(120)
    .build();
  const lista = await servidor.prepareTransaction(tx);
  lista.sign(par);
  const envio = await servidor.sendTransaction(lista);
  if (envio.status === 'ERROR') throw new Error(`mint a ${destino.slice(0, 6)}… rechazado`);
  for (let i = 0; i < 30; i++) {
    const r = await servidor.getTransaction(envio.hash);
    if (r.status === 'SUCCESS') return;
    if (r.status === 'FAILED') throw new Error(`mint a ${destino.slice(0, 6)}… falló`);
    await espera(1000);
  }
  throw new Error('la red no confirmó el mint a tiempo');
}

/** PNG de un color con una franja (sin librerías), para las fotos del portafolio. */
function png(ancho, alto, [r, g, b], [r2, g2, b2]) {
  const filas = [];
  for (let y = 0; y < alto; y++) {
    const fila = Buffer.alloc(1 + ancho * 3);
    for (let x = 0; x < ancho; x++) {
      const franja = y > alto * 0.62 && y < alto * 0.78;
      fila.set(franja ? [r2, g2, b2] : [r, g, b], 1 + x * 3);
    }
    filas.push(fila);
  }
  const crc = (buf) => {
    let c = ~0;
    for (const byte of buf) {
      c ^= byte;
      for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    }
    return ~c >>> 0;
  };
  const bloque = (tipo, datos) => {
    const t = Buffer.from(tipo, 'ascii');
    const largo = Buffer.alloc(4);
    largo.writeUInt32BE(datos.length);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(Buffer.concat([t, datos])));
    return Buffer.concat([largo, t, datos, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloque('IHDR', ihdr), bloque('IDAT', deflateSync(Buffer.concat(filas))), bloque('IEND', Buffer.alloc(0))]);
}

async function subirFoto(s, colores) {
  const archivo = png(480, 360, ...colores);
  const sub = await api('/uploads/foto', { token: s.token, cuerpo: { tipo: 'image/png', tamano: archivo.length } });
  const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { error } = await supa.storage.from('fotos').uploadToSignedUrl(sub.ruta, sub.token, archivo, { contentType: 'image/png' });
  if (error) throw new Error(`no se pudo subir la foto: ${error.message}`);
  return sub.url_publica;
}

// ---------------------------------------------------------------
// --llaves: lo que hace falta para desplegar el contrato v2
// ---------------------------------------------------------------

async function soloLlaves() {
  const ll = llaves();
  console.log('Fondeando con XLM de prueba (Friendbot) el árbitro, la tesorería y la llave de mantenimiento…');
  for (const d of [ll.cuentas['prueba-arbitro'].publica, ll.extra.tesoreria.publica, ll.extra.mantenimiento.publica]) await friendbot(d);
  console.log(`
Listo: ${path.relative(raiz, ARCHIVO_LLAVES)} (solo testnet, no se sube a git).

1) Despliega el contrato v2 en Stellar Lab (docs/guia-stellar-lab.md, sección «Contrato v2») con:
     arbitro    = ${ll.cuentas['prueba-arbitro'].publica}
     tesoreria  = ${ll.extra.tesoreria.publica}
     admin      = tu cuenta (por ejemplo, la del Equipo Cryptoville de .seed-keys.json)
     token      = tu PAYMENT_TOKEN_ID

2) Pon en tu .env:
     ESCROW_V2_CONTRACT_ID=C…   (el id que te dio el Lab)
     ARBITRO_DIRECCION=${ll.cuentas['prueba-arbitro'].publica}
     TESORERIA_DIRECCION=${ll.extra.tesoreria.publica}
     LLAVE_MANTENIMIENTO=        (opcional: la «secreta» de extra.mantenimiento en ${path.basename(ARCHIVO_LLAVES)})

3) Reinicia la API (npm run dev) y corre: npm run datos:prueba`);
}

// ---------------------------------------------------------------
// --arbitro
// ---------------------------------------------------------------

/** Da el rol de árbitro a la cuenta que tiene la wallet del árbitro del contrato (si ya entró una vez en la app). */
async function rolDelArbitroDelContrato(db, direccion) {
  const { rows } = await db.query(
    `UPDATE usuarios SET rol = 'arbitro' WHERE id IN (SELECT usuario_id FROM wallets WHERE direccion = $1) OR direccion = $1 RETURNING nombre`,
    [direccion],
  );
  if (rows.length) console.log(`  ✓ Rol de árbitro para «${rows[0].nombre ?? direccion}» (la wallet del árbitro del contrato).`);
  else console.warn(`  ⚠ Nadie entró todavía con la wallet del árbitro (${direccion}). Entra con ella en la app y corre: npm run datos:prueba -- --arbitro`);
  return rows.length > 0;
}

async function soloArbitro() {
  const config = await api('/config').catch(() => {
    throw new Error(`La API no responde en ${API}. Levántala con «npm run dev» y vuelve a intentar.`);
  });
  if (!config.arbitro) throw new Error('Falta ARBITRO_DIRECCION en el .env.');
  const db = new pg.Client({ connectionString: process.env.DIRECT_URL });
  await db.connect();
  const listo = await rolDelArbitroDelContrato(db, config.arbitro);
  await db.end();
  if (!listo) process.exitCode = 1;
}

// ---------------------------------------------------------------
// --borrar
// ---------------------------------------------------------------

async function borrar() {
  const ll = llaves();
  const direcciones = Object.values(ll.cuentas).map((c) => c.publica);
  const db = new pg.Client({ connectionString: process.env.DIRECT_URL });
  await db.connect();
  const { rows } = await db.query('SELECT id, nombre FROM usuarios WHERE direccion = ANY($1)', [direcciones]);
  if (!rows.length) {
    console.log('No hay cuentas «prueba-…» que borrar.');
    await db.end();
    return;
  }
  const ids = rows.map((r) => r.id);
  // Los pedidos no se borran solos con la cuenta (los referencian los servicios): primero ellos.
  await db.query('DELETE FROM pedidos WHERE cliente_id = ANY($1) OR proveedor_id = ANY($1)', [ids]);
  await db.end();
  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  for (const r of rows) {
    const { error } = await admin.auth.admin.deleteUser(r.id);
    console.log(error ? `  ✗ ${r.nombre}: ${error.message}` : `  ✓ ${r.nombre}`);
  }
  console.log(`Borradas ${rows.length} cuentas. Las llaves se conservan en ${path.basename(ARCHIVO_LLAVES)} (los pedidos viejos siguen en el contrato de testnet; no molestan).`);
}

// ---------------------------------------------------------------
// Crear todo
// ---------------------------------------------------------------

async function crear() {
  const ll = llaves();
  const config = await api('/config').catch(() => {
    throw new Error(`La API no responde en ${API}. Levántala con «npm run dev» y vuelve a intentar.`);
  });
  if (config.red !== 'testnet') throw new Error('La API no está en testnet.');
  if (!config.contrato_v2_id) throw new Error('Falta ESCROW_V2_CONTRACT_ID en el .env (paso «npm run datos:prueba -- --llaves»).');
  if (!config.token_id) throw new Error('Falta PAYMENT_TOKEN_ID en el .env.');
  const arbitroEsDePrueba = config.arbitro === ll.cuentas['prueba-arbitro'].publica;
  if (!arbitroEsDePrueba) {
    console.warn('⚠ El árbitro del contrato (ARBITRO_DIRECCION) no es prueba-arbitro: prueba-arbitro ve los reportes y el expediente,');
    console.warn('  pero para RESOLVER una disputa hay que entrar con la wallet del árbitro y darle el rol (npm run datos:prueba -- --arbitro).');
  }

  const semilla = path.join(raiz, '.seed-keys.json');
  if (!existsSync(semilla)) throw new Error('No existe .seed-keys.json (npm run setup): hace falta el emisor del USDC de prueba.');
  const emisor = JSON.parse(readFileSync(semilla, 'utf8')).emisor_usdc;

  const db = new pg.Client({ connectionString: process.env.DIRECT_URL });
  await db.connect();
  const ya = await db.query('SELECT count(*)::int AS n FROM usuarios WHERE direccion = ANY($1)', [Object.values(ll.cuentas).map((c) => c.publica)]);
  if (ya.rows[0].n > 0) {
    await db.end();
    throw new Error('Ya hay cuentas «prueba-…». Para empezar de cero: npm run datos:prueba -- --borrar');
  }

  const paso = (texto) => console.log(`\n▸ ${texto}`);
  const resumen = { pedidos: {}, cuentas: {} };

  paso('XLM de prueba (Friendbot) y USDC de prueba');
  const conDinero = { 'prueba-cliente': '500', 'prueba-sebusca': '100', 'prueba-locales': '20', 'prueba-proveedor': '10' };
  for (const c of ['prueba-cliente', 'prueba-proveedor', 'prueba-arbitro', 'prueba-sebusca', 'prueba-locales', 'prueba-wallets']) {
    await friendbot(ll.cuentas[c].publica);
  }
  await friendbot(ll.extra.tesoreria.publica);
  for (const [c, monto] of Object.entries(conDinero)) {
    await emitirUsdc(config.token_id, emisor, ll.cuentas[c].publica, monto);
    console.log(`  ${c}: ${monto} USDC de prueba`);
  }

  paso('Cuentas (inicio de sesión con la firma de cada wallet)');
  const s = {};
  for (const c of CUENTAS) {
    s[c] = await entrar(c, ll.cuentas[c]);
    await api('/yo', { token: s[c].token, metodo: 'PATCH', cuerpo: { nombre: c, bio: `Cuenta de prueba (${c}). Ver la guía de pruebas.` } });
    // Todas aceptan los documentos legales, menos prueba-kyc (con ella se prueba esa pantalla).
    if (c !== 'prueba-kyc') {
      await api('/legal/aceptar', { token: s[c].token, cuerpo: { documentos: DOCUMENTOS_LEGALES.filter((d) => d.requiereAceptacion).map((d) => ({ id: d.id, version: d.version })) } });
    }
    console.log(`  ✓ ${c}`);
  }
  await db.query(`UPDATE usuarios SET rol = 'arbitro' WHERE id = $1`, [s['prueba-arbitro'].id]);
  // Con Didit encendido, abrir un local, cobrar y reseñar piden la identidad verificada. Las cuentas de prueba
  // quedan verificadas de mentira (solo en la base local), menos prueba-kyc: con ella se prueba esa pantalla.
  await db.query(`UPDATE usuarios SET verificado = true WHERE id = ANY($1::uuid[])`, [CUENTAS.filter((c) => c !== 'prueba-kyc').map((c) => s[c].id)]);
  if (!arbitroEsDePrueba) await rolDelArbitroDelContrato(db, config.arbitro);

  paso('Locales y servicios');
  const P = s['prueba-proveedor'];
  const taller = await api('/mi-local', { token: P.token, metodo: 'PUT', cuerpo: { nombre: 'Taller prueba-proveedor', barrio: 'tech', descripcion: 'Local de prueba: pedidos con garantía, por etapas y directos.' } });
  const estudio = await api('/locales', { token: P.token, cuerpo: { nombre: 'Estudio prueba-proveedor', barrio: 'creativo', descripcion: 'Segundo local de prueba (para las propuestas).' } });
  const servicio = async (local, titulo, precio, dias) =>
    (await api('/servicios', { token: P.token, cuerpo: { local_id: local, titulo, descripcion: `${titulo}: servicio de prueba para la guía de pruebas.`, precio_usdc: precio, dias_entrega: dias } })).id;
  const svGarantia = await servicio(taller.id, 'Página web (prueba garantía)', '10', 5);
  const svEtapas = await servicio(taller.id, 'Tienda en línea (prueba etapas)', '30', 14);
  const svDirecto = await servicio(taller.id, 'Arreglo rápido (prueba directo)', '5', 2);
  await servicio(estudio.id, 'Logo (prueba)', '8', 4);

  const L = s['prueba-locales'];
  await api('/mi-local', { token: L.token, metodo: 'PUT', cuerpo: { nombre: 'Local 1 de prueba-locales', barrio: 'audiovisual' } });
  await api('/locales', { token: L.token, cuerpo: { nombre: 'Local 2 de prueba-locales', barrio: 'creativo' } });
  await api('/locales', { token: L.token, cuerpo: { nombre: 'Local 3 de prueba-locales', barrio: 'academy' } });

  const R = s['prueba-reportado'];
  const localReportado = await api('/mi-local', { token: R.token, metodo: 'PUT', cuerpo: { nombre: 'Local reportado (prueba)', barrio: 'audiovisual' } });

  paso('Portafolios (con fotos y videos)');
  const F = s['prueba-portafolio'];
  await api('/mi-local', { token: F.token, metodo: 'PUT', cuerpo: { nombre: 'Galería prueba-portafolio', barrio: 'creativo', descripcion: 'Entra: los proyectos destacados cuelgan en la pared.' } });
  await api('/portafolio/experiencias', { token: F.token, cuerpo: { puesto: 'Ilustradora', lugar: 'Por mi cuenta', desde: '2022-02-01', hasta: null, descripcion: 'Ilustración editorial y murales (dato de prueba).' } });
  await api('/portafolio/experiencias', { token: F.token, cuerpo: { puesto: 'Diseñadora junior', lugar: 'Estudio de branding', desde: '2020-03-01', hasta: '2022-01-31', descripcion: 'Logos y piezas para redes.' } });
  const proyecto = async (sesion, titulo, colores, destacado, video) =>
    (
      await api('/portafolio/proyectos', {
        token: sesion.token,
        cuerpo: {
          titulo,
          descripcion: `${titulo}: proyecto de prueba para la guía de pruebas.`,
          fecha: '2026-05-01',
          fotos: colores ? [await subirFoto(sesion, colores)] : [],
          enlaces: [{ url: 'https://example.com/proyecto', titulo: 'Ver el proyecto' }],
          videos: video ? [{ tipo: 'youtube', url: video }] : [],
          destacado,
        },
      })
    ).id;
  await proyecto(F, 'Mural para una escuela', [[233, 180, 76], [224, 122, 95]], true, 'https://www.youtube.com/watch?v=aqz-KE-bpKQ');
  await proyecto(F, 'Logo de una panadería', [[129, 178, 154], [61, 133, 198]], true);
  await proyecto(F, 'Afiche de un festival', [[155, 123, 196], [253, 246, 227]], false);
  const proyP1 = await proyecto(P, 'Sitio de una cafetería', [[61, 133, 198], [253, 246, 227]], true);
  const proyP2 = await proyecto(P, 'Tienda de repuestos', [[93, 155, 120], [233, 180, 76]], false);
  const proyReportado = await proyecto(R, 'Proyecto copiado (reportado)', null, false);

  paso('Pedidos (en el contrato v2 de testnet)');
  const C = s['prueba-cliente'];
  const pedido = async (clave, servicioId, metodo, detalle) => {
    const p = await api('/pedidos', { token: C.token, cuerpo: { servicio_id: servicioId, detalle: `[PRUEBA ${clave}] ${detalle}`, metodo_pago: metodo } });
    resumen.pedidos[clave] = { id: p.id, numero: String(p.numero), detalle };
    return p.id;
  };
  const plan = (n) =>
    Array.from({ length: n }, (_, i) => ({
      descripcion: ['Diseño y estructura', 'Desarrollo', 'Pruebas y publicación'][i] ?? `Fase ${i + 1}`,
      porcentaje_proyecto: n === 2 ? 50 : [30, 40, 30][i],
      porcentaje_pago: n === 2 ? 50 : [30, 40, 30][i],
      fecha_limite: enDias(2 + i * 4),
      pruebas: ['enlace'],
    }));
  const aceptar = (id, cuerpo) => api(`/pedidos/${id}/aceptar`, { token: P.token, cuerpo });
  const pagar = (id) => firmar(C, { tipo: 'paso_v2', pedido_id: id, accion: 'crear_pedido' });
  const entregar = async (id, fase) => {
    await api(`/pedidos/${id}/pruebas`, { token: P.token, cuerpo: { fase, tipo: 'enlace', titulo: `Avance de la fase ${fase + 1}`, url: `https://example.com/avance-${fase + 1}`, para: 'entrega' } });
    return firmar(P, { tipo: 'paso_v2', pedido_id: id, accion: 'entregar_fase', fase });
  };
  const hecho = (clave, texto) => console.log(`  ✓ ${clave}: ${texto}`);

  let id = await pedido('A', svGarantia, 'garantia', 'Garantía entregada: el cliente aprueba (libera), pide cambios o abre una disputa.');
  await aceptar(id, { fecha_limite: enDias(7) });
  await pagar(id);
  await entregar(id, 0);
  hecho('A', 'garantía pagada y entregada');

  id = await pedido('B', svEtapas, 'etapas', 'Plan de fases propuesto: el cliente lo acepta o pide cambios.');
  await aceptar(id, { fecha_limite: enDias(10), fases: plan(3) });
  hecho('B', 'plan de 3 fases esperando al cliente');

  id = await pedido('C', svEtapas, 'etapas', 'Por etapas, fase 1 entregada con su prueba: el cliente libera la fase o pide cambios.');
  await aceptar(id, { fecha_limite: enDias(10), fases: plan(2) });
  await api(`/pedidos/${id}/plan/aceptar`, { token: C.token, cuerpo: {} });
  await pagar(id);
  await entregar(id, 0);
  hecho('C', 'por etapas pagado, fase 1 entregada');

  id = await pedido('D', svDirecto, 'directo', 'Pago directo hecho y marcado como entregado: el cliente confirma que lo recibió y deja su reseña.');
  await aceptar(id, { fecha_limite: enDias(3) });
  await firmar(C, { tipo: 'pago_directo', pedido_id: id, accion: 'pagar_directo' });
  await api(`/pedidos/${id}/directo/entregado`, { token: P.token, cuerpo: {} });
  hecho('D', 'pago directo hecho y entregado');

  await pedido('E', svGarantia, 'garantia', 'Recién pedido: el cliente cambia el método de pago o lo cancela.');
  hecho('E', 'solicitado (para el cliente)');

  id = await pedido('F', svGarantia, 'garantia', 'Pagado y sin entrega: vence en 1 hora y 5 minutos; después el cliente se reembolsa.');
  await aceptar(id, { fecha_limite: new Date(Date.now() + 65 * 60_000).toISOString() });
  await pagar(id);
  hecho('F', 'pagado, vence en 65 minutos');

  await pedido('G1', svGarantia, 'garantia', 'Pedido nuevo con garantía: el proveedor lo acepta con una fecha (o lo cancela).');
  await pedido('G2', svEtapas, 'etapas', 'Pedido nuevo por etapas: el proveedor lo acepta con un plan de fases.');
  hecho('G1/G2', 'solicitados (para el proveedor)');

  id = await pedido('H', svEtapas, 'etapas', 'Por etapas pagado: el proveedor sube las pruebas de la fase 1 y la entrega.');
  await aceptar(id, { fecha_limite: enDias(10), fases: plan(2) });
  await api(`/pedidos/${id}/plan/aceptar`, { token: C.token, cuerpo: {} });
  await pagar(id);
  hecho('H', 'pagado, falta la entrega');

  id = await pedido('I', svGarantia, 'garantia', 'El cliente pidió cambios: el proveedor vuelve a entregar.');
  await aceptar(id, { fecha_limite: enDias(7) });
  await pagar(id);
  await entregar(id, 0);
  await firmar(C, { tipo: 'paso_v2', pedido_id: id, accion: 'pedir_cambios', fase: 0 });
  hecho('I', 'cambios pedidos');

  id = await pedido('K', svGarantia, 'garantia', 'En disputa: el árbitro la resuelve (cliente, proveedor o mitad).');
  await aceptar(id, { fecha_limite: enDias(7) });
  await pagar(id);
  await entregar(id, 0);
  await firmar(C, { tipo: 'paso_v2', pedido_id: id, accion: 'abrir_disputa', fase: 0, motivo: 'La entrega no tiene lo que acordamos (dato de prueba).' });
  hecho('K', 'disputa abierta');

  paso('«Se busca» con dos propuestas');
  const B = s['prueba-sebusca'];
  const busqueda = await api('/busquedas', {
    token: B.token,
    cuerpo: {
      titulo: 'Página web para mi negocio (prueba)',
      descripcion: 'Necesito una página de una sección con formulario de contacto (dato de prueba).',
      barrio: 'tech',
      categoria: 'desarrollo-web',
      presupuesto_usdc: '40',
      fecha_limite: enDias(20),
    },
  });
  await api(`/busquedas/${busqueda.id}/propuestas`, {
    token: P.token,
    cuerpo: { monto_usdc: '36', dias_entrega: 10, mensaje: 'Te la hago en dos fases, mira mis proyectos parecidos (prueba).', local_id: estudio.id, fases: plan(2), proyectos: [proyP1, proyP2] },
  });
  await api(`/busquedas/${busqueda.id}/propuestas`, { token: F.token, cuerpo: { monto_usdc: '30', dias_entrega: 6, mensaje: 'Te la entrego de una vez, sin fases (prueba).' } });
  resumen.busqueda = busqueda.id;
  console.log('  ✓ una propuesta con plan y proyectos (desde el 2º local) y otra sin plan');

  paso('Chat por cercanía y reportes');
  const A1 = s['prueba-chat-a'];
  const A2 = s['prueba-chat-b'];
  for (const [de, para, texto] of [
    [A1, A2, 'Hola, ¿qué tal? Vi tu local en la villa.'],
    [A2, A1, '¡Hola! Bien, ¿buscas algo en especial?'],
    [A1, A2, 'Este mensaje es para probar el reporte del chat.'],
  ]) {
    await api('/cercania/mensajes', { token: de.token, cuerpo: { para_id: para.id, texto } });
  }
  await api('/reportes', { token: A2.token, cuerpo: { tipo: 'chat', objeto_id: A1.id, motivo: 'ofensivo', detalle: 'Reporte de prueba: revisar la conversación.' } });
  await api('/reportes', { token: C.token, cuerpo: { tipo: 'proyecto', objeto_id: proyReportado, motivo: 'derechos', detalle: 'Reporte de prueba: este trabajo no es suyo.' } });
  await api('/reportes', { token: C.token, cuerpo: { tipo: 'local', objeto_id: localReportado.id, motivo: 'spam', detalle: 'Reporte de prueba: local de spam.' } });
  console.log('  ✓ 3 mensajes, un chat reportado, un proyecto y un local reportados');

  paso('Dos wallets en una cuenta');
  const W = s['prueba-wallets'];
  const w2 = ll.extra['prueba-wallets-2'];
  const d = await api('/wallets/desafio', { token: W.token, cuerpo: { direccion: w2.publica } });
  await api('/wallets/vincular', { token: W.token, cuerpo: { direccion: w2.publica, nonce: d.nonce, firma: firmaSep53(w2.secreta, d.mensaje) } });
  const wallets = await api('/wallets', { token: W.token });
  const segunda = (Array.isArray(wallets) ? wallets : (wallets.wallets ?? [])).find((x) => x.direccion === w2.publica);
  if (segunda) await api(`/wallets/${segunda.id}/cobrar`, { token: W.token, cuerpo: {} });
  console.log('  ✓ prueba-wallets entra con cualquiera de sus 2 wallets y cobra en la segunda');

  paso('Relleno de la Villa Academy (para ver el sector «Academy B»)');
  const { rows } = await db.query(`SELECT count(*)::int AS n FROM locales WHERE barrio = 'academy'`);
  let faltan = Math.max(0, 61 - rows[0].n);
  for (let i = 1; i <= RELLENO_MAX && faltan > 0; i++) {
    const nombre = `prueba-relleno-${String(i).padStart(2, '0')}`;
    const r = await entrar(nombre, ll.cuentas[nombre]);
    await api('/yo', { token: r.token, metodo: 'PATCH', cuerpo: { nombre } });
    await db.query(`UPDATE usuarios SET verificado = true WHERE id = $1`, [r.id]);
    await api('/legal/aceptar', { token: r.token, cuerpo: { documentos: DOCUMENTOS_LEGALES.filter((x) => x.requiereAceptacion).map((x) => ({ id: x.id, version: x.version })) } });
    // Pagos del local extra de mentira (solo base local), para que cada cuenta abra 10 locales sin pagar en la red.
    for (let k = 0; k < 7; k++) {
      await db.query(`INSERT INTO pagos_plataforma (usuario_id, concepto, monto_usdc, tx_hash, red, direccion) VALUES ($1, 'local_extra', 5, $2, 'testnet', $3)`, [
        r.id,
        createHash('sha256').update(`${nombre}-${k}-${Date.now()}`).digest('hex'),
        r.publica,
      ]);
    }
    for (let k = 0; k < 10 && faltan > 0; k++, faltan--) {
      await api('/locales', { token: r.token, cuerpo: { nombre: `Relleno ${i}.${k + 1}`, barrio: 'academy' } });
    }
    console.log(`  ✓ ${nombre}`);
  }
  await db.end();

  for (const c of CUENTAS) resumen.cuentas[c] = ll.cuentas[c].publica;
  writeFileSync(ARCHIVO_DATOS, JSON.stringify({ creado_en: new Date().toISOString(), ...resumen }, null, 2) + '\n');
  console.log(`
✔ Datos de prueba listos.
  - Entra en http://localhost:5173 → «Modo desarrollo: entrar con una llave de prueba» y pega la «secreta» de la cuenta (${path.basename(ARCHIVO_LLAVES)}).
  - Qué probar con cada una: docs/propuestas/guia-de-pruebas.md
  - Ids de los pedidos A–K: ${path.basename(ARCHIVO_DATOS)}`);
}

const accion = args.includes('--llaves') ? soloLlaves : args.includes('--borrar') ? borrar : args.includes('--arbitro') ? soloArbitro : crear;
accion().catch((e) => {
  console.error(`\n✗ ${e.message}`);
  process.exitCode = 1;
});
