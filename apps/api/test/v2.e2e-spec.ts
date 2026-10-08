// Pruebas de punta a punta de Cryptoville v2 contra Supabase local (`npm run setup` antes).
// Igual que api.e2e-spec.ts: crean wallets nuevas en cada corrida y las borran al terminar.
process.env.LOG_LEVEL = 'silent';
import './sin-servicios';

import { DOCUMENTOS_LEGALES } from '@cryptoville/shared';
import type { INestApplication } from '@nestjs/common';
import { Keypair } from '@stellar/stellar-sdk';
import { createClient } from '@supabase/supabase-js';
import request from 'supertest';
import { firmarMensajeSep53 } from '../src/auth/firma-stellar';
import { crearApp } from '../src/main';
import { PrismaService } from '../src/prisma/prisma.service';
import { SupabaseService } from '../src/supabase/supabase.service';

interface Sesion {
  par: Keypair;
  token: string;
  id: string;
}

let app: INestApplication;
let prisma: PrismaService;
let supa: SupabaseService;
const creados: Sesion[] = [];
const http = () => request(app.getHttpServer());
const con = (s: Sesion) => ({ Authorization: `Bearer ${s.token}` });

async function entrar(par = Keypair.random(), metodo?: string): Promise<Sesion> {
  const d = await http().post('/api/auth/desafio').send({ direccion: par.publicKey() }).expect(200);
  const firma = firmarMensajeSep53(par, d.body.mensaje);
  const v = await http()
    .post('/api/auth/verificar')
    .send({ direccion: par.publicKey(), nonce: d.body.nonce, firma, ...(metodo ? { metodo } : {}) })
    .expect(200);
  const sesion = { par, token: v.body.access_token as string, id: v.body.usuario.id as string };
  if (!creados.some((c) => c.id === sesion.id)) creados.push(sesion);
  return sesion;
}

/** Suma `nueva` a la cuenta de `s` (la wallet nueva firma el mensaje). */
async function vincular(s: Sesion, nueva: Keypair) {
  const d = await http().post('/api/wallets/desafio').set(con(s)).send({ direccion: nueva.publicKey() }).expect(200);
  return http()
    .post('/api/wallets/vincular')
    .set(con(s))
    .send({ direccion: nueva.publicKey(), nonce: d.body.nonce, firma: firmarMensajeSep53(nueva, d.body.mensaje) });
}

const clienteCon = (token?: string) =>
  createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
  });

beforeAll(async () => {
  ({ app } = await crearApp());
  await app.init();
  prisma = app.get(PrismaService);
  supa = app.get(SupabaseService);
});

afterAll(async () => {
  const ids = creados.map((s) => s.id);
  await prisma.pedido.deleteMany({ where: { OR: [{ cliente_id: { in: ids } }, { proveedor_id: { in: ids } }] } });
  for (const id of ids) await supa.admin.auth.admin.deleteUser(id);
  await app.close();
});

describe('configuración pública', () => {
  it('dice qué está encendido sin mostrar secretos', async () => {
    const r = await http().get('/api/config').expect(200);
    expect(r.body.red).toBe('testnet');
    expect(r.body.passphrase).toMatch(/Test SDF/);
    expect(r.body.servicios).toEqual(expect.objectContaining({ kyc: expect.any(Boolean), videos: expect.any(Boolean) }));
    // En las pruebas no se firma en la app (no hay red).
    expect(r.body.firma_en_app).toBe(false);
    const texto = JSON.stringify(r.body);
    expect(texto).not.toMatch(/service_role|SERVICE_ROLE|S[A-Z2-7]{55}/);
  });

  it('el mensaje de inicio de sesión dice la red', async () => {
    const d = await http().post('/api/auth/desafio').send({ direccion: Keypair.random().publicKey() }).expect(200);
    expect(d.body.mensaje).toMatch(/Red: Testnet/);
  });
});

describe('una persona, una cuenta, varias wallets', () => {
  it('la cuenta nueva queda con su wallet de la cuenta y para cobrar', async () => {
    const s = await entrar();
    const w = await http().get('/api/wallets').set(con(s)).expect(200);
    expect(w.body).toHaveLength(1);
    expect(w.body[0]).toEqual(expect.objectContaining({ direccion: s.par.publicKey(), de_la_cuenta: true, para_cobrar: true }));
  });

  it('se suma otra wallet firmando con ella, y entrar con cualquiera abre la misma cuenta', async () => {
    const s = await entrar();
    const otra = Keypair.random();
    const r = await vincular(s, otra);
    expect(r.status).toBe(201);
    const conOtra = await entrar(otra);
    expect(conOtra.id).toBe(s.id);
    const yo = await http().get('/api/yo').set(con(conOtra)).expect(200);
    expect(yo.body.usuario.direccion).toBe(s.par.publicKey());
  });

  it('una wallet no puede estar en dos cuentas, y la firma tiene que ser de la wallet nueva', async () => {
    const a = await entrar();
    const b = await entrar();
    await http().post('/api/wallets/desafio').set(con(a)).send({ direccion: b.par.publicKey() }).expect(409);
    const nueva = Keypair.random();
    const d = await http().post('/api/wallets/desafio').set(con(a)).send({ direccion: nueva.publicKey() }).expect(200);
    await http()
      .post('/api/wallets/vincular')
      .set(con(a))
      .send({ direccion: nueva.publicKey(), nonce: d.body.nonce, firma: firmarMensajeSep53(Keypair.random(), d.body.mensaje) })
      .expect(401);
  });

  it('un mensaje para sumar una wallet no sirve para entrar', async () => {
    const s = await entrar();
    const nueva = Keypair.random();
    const d = await http().post('/api/wallets/desafio').set(con(s)).send({ direccion: nueva.publicKey() }).expect(200);
    await http()
      .post('/api/auth/verificar')
      .send({ direccion: nueva.publicKey(), nonce: d.body.nonce, firma: firmarMensajeSep53(nueva, d.body.mensaje) })
      .expect(401);
  });

  it('se elige dónde cobrar; la wallet de la cuenta no se quita', async () => {
    const s = await entrar();
    const otra = Keypair.random();
    const r = await vincular(s, otra);
    const lista = await http().post(`/api/wallets/${r.body.id}/cobrar`).set(con(s)).expect(200);
    expect(lista.body.find((w: { id: string }) => w.id === r.body.id).para_cobrar).toBe(true);
    expect(lista.body.filter((w: { para_cobrar: boolean }) => w.para_cobrar)).toHaveLength(1);
    const deLaCuenta = lista.body.find((w: { de_la_cuenta: boolean }) => w.de_la_cuenta);
    await http().delete(`/api/wallets/${deLaCuenta.id}`).set(con(s)).expect(403);
    const despues = await http().delete(`/api/wallets/${r.body.id}`).set(con(s)).expect(200);
    expect(despues.body).toHaveLength(1);
    expect(despues.body[0].para_cobrar).toBe(true);
  });

  it('al aceptar un pedido, el proveedor cobra en su wallet para cobrar', async () => {
    const prov = await entrar();
    const cobro = Keypair.random();
    const w = await vincular(prov, cobro);
    await http().post(`/api/wallets/${w.body.id}/cobrar`).set(con(prov)).expect(200);
    await http().put('/api/mi-local').set(con(prov)).send({ nombre: 'Local de cobro', barrio: 'tech' }).expect(200);
    const s = await http()
      .post('/api/servicios')
      .set(con(prov))
      .send({ titulo: 'Servicio', descripcion: 'Una descripción suficientemente larga', precio_usdc: '12', dias_entrega: 2 })
      .expect(201);
    const cli = await entrar();
    const p = await http().post('/api/pedidos').set(con(cli)).send({ servicio_id: s.body.id, detalle: 'Necesito esto pronto' }).expect(201);
    const fecha = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const a = await http().post(`/api/pedidos/${p.body.id}/aceptar`).set(con(prov)).send({ fecha_limite: fecha }).expect(200);
    expect(a.body.direccion_proveedor).toBe(cobro.publicKey());
  });

  it('RLS: cada quien ve solo sus wallets; la web no ve las transacciones preparadas', async () => {
    const a = await entrar();
    const b = await entrar();
    const propias = await clienteCon(a.token).from('wallets').select('direccion');
    expect(propias.data?.map((w) => w.direccion)).toEqual([a.par.publicKey()]);
    const ajenas = await clienteCon(a.token).from('wallets').select('id').eq('usuario_id', b.id);
    expect(ajenas.data).toEqual([]);
    const anonimas = await clienteCon().from('wallets').select('id').limit(1);
    expect(anonimas.data ?? []).toEqual([]);
    const tx = await clienteCon(a.token).from('transacciones_preparadas').select('id').limit(1);
    expect(tx.data ?? []).toEqual([]);
    const insertar = await clienteCon(a.token).from('wallets').insert({ usuario_id: a.id, direccion: Keypair.random().publicKey() });
    expect(insertar.error).not.toBeNull();
  });
});

describe('firmar dentro de la app', () => {
  it('sin red en las pruebas, avisa que hay que usar Stellar Lab', async () => {
    const s = await entrar();
    await http()
      .post('/api/transacciones/preparar')
      .set(con(s))
      .send({ tipo: 'paso_pedido', pedido_id: '00000000-0000-4000-8000-000000000000', accion: 'liberar', direccion: s.par.publicKey() })
      .expect(503);
  });
});

describe('documentos legales', () => {
  it('se piden los que requieren aceptación y se registra la versión vigente', async () => {
    const s = await entrar();
    const pendientes = await http().get('/api/legal/pendientes').set(con(s)).expect(200);
    const requeridos = DOCUMENTOS_LEGALES.filter((d) => d.requiereAceptacion);
    expect(pendientes.body.map((d: { id: string }) => d.id).sort()).toEqual(requeridos.map((d) => d.id).sort());

    await http().post('/api/legal/aceptar').set(con(s)).send({ documentos: [{ id: 'terminos', version: '1999-01-01' }] }).expect(400);
    const listo = await http()
      .post('/api/legal/aceptar')
      .set(con(s))
      .send({ documentos: requeridos.map((d) => ({ id: d.id, version: d.version })) })
      .expect(200);
    expect(listo.body).toEqual([]);
    const propias = await clienteCon(s.token).from('aceptaciones_legales').select('documento');
    expect(propias.data).toHaveLength(requeridos.length);
  });
});

describe('enviar comentarios', () => {
  it('cualquiera con sesión manda una idea; solo el equipo las ve todas', async () => {
    const s = await entrar();
    await http().post('/api/comentarios').set(con(s)).send({ tipo: 'idea', texto: 'Hola' }).expect(400);
    const c = await http().post('/api/comentarios').set(con(s)).send({ tipo: 'idea', texto: 'Que haya modo oscuro', contexto: 'villa creativo' }).expect(201);
    await http().post('/api/comentarios').set(con(s)).send({ tipo: 'error', texto: 'Algo falló aquí', captura_ruta: 'usuarios/otro/x.png' }).expect(400);
    await http().get('/api/arbitro/comentarios').set(con(s)).expect(403);

    const equipo = await entrar();
    await prisma.usuario.update({ where: { id: equipo.id }, data: { rol: 'arbitro' } });
    const lista = await http().get('/api/arbitro/comentarios').set(con(equipo)).expect(200);
    expect(lista.body.some((x: { id: string }) => x.id === c.body.id)).toBe(true);
    await http().patch(`/api/arbitro/comentarios/${c.body.id}`).set(con(equipo)).send({ estado: 'visto' }).expect(200);

    const propios = await clienteCon(s.token).from('comentarios').select('id');
    expect(propios.data?.map((x) => x.id)).toContain(c.body.id);
    const ajeno = await entrar();
    const deOtro = await clienteCon(ajeno.token).from('comentarios').select('id').eq('id', c.body.id);
    expect(deOtro.data).toEqual([]);
  });
});
