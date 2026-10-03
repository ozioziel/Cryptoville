// Pruebas de punta a punta de la API contra Supabase local (`npm run setup` antes).
// Crean wallets nuevas en cada corrida y las borran al terminar.
process.env.LOG_LEVEL = 'silent';

import type { INestApplication } from '@nestjs/common';
import { Keypair } from '@stellar/stellar-sdk';
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
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
const hash = () => randomBytes(32).toString('hex');
const http = () => request(app.getHttpServer());

async function entrar(par = Keypair.random()): Promise<Sesion> {
  const d = await http().post('/api/auth/desafio').send({ direccion: par.publicKey() }).expect(200);
  const firma = firmarMensajeSep53(par, d.body.mensaje);
  const v = await http()
    .post('/api/auth/verificar')
    .send({ direccion: par.publicKey(), nonce: d.body.nonce, firma })
    .expect(200);
  const sesion = { par, token: v.body.access_token as string, id: v.body.usuario.id as string };
  creados.push(sesion);
  return sesion;
}

const con = (s: Sesion) => ({ Authorization: `Bearer ${s.token}` });

async function proveedorConServicio() {
  const prov = await entrar();
  // Busca un barrio con lotes libres (hay 12 lotes en total).
  for (const barrio of ['diseno', 'clases', 'tecnologia'] as const) {
    const r = await http().put('/api/mi-local').set(con(prov)).send({ nombre: 'Local de prueba', barrio });
    if (r.status === 200) break;
    if (r.status !== 409) throw new Error(`mi-local: ${r.status} ${JSON.stringify(r.body)}`);
  }
  const local = await prisma.local.findUnique({ where: { usuario_id: prov.id } });
  if (!local) throw new Error('No quedan lotes libres en el pueblo: ejecuta npm run db:seed');
  const s = await http()
    .post('/api/servicios')
    .set(con(prov))
    .send({ titulo: 'Servicio de prueba', descripcion: 'Una descripción suficientemente larga', precio_usdc: '10.5', dias_entrega: 3 })
    .expect(201);
  return { prov, servicioId: s.body.id as string };
}

async function pedidoPagado() {
  const { prov, servicioId } = await proveedorConServicio();
  const cli = await entrar();
  const p = await http().post('/api/pedidos').set(con(cli)).send({ servicio_id: servicioId, detalle: 'Necesito esto para el viernes' }).expect(201);
  const fecha = new Date(Date.now() + 3 * 86_400_000).toISOString();
  await http().post(`/api/pedidos/${p.body.id}/aceptar`).set(con(prov)).send({ fecha_limite: fecha }).expect(200);
  await http().post(`/api/pedidos/${p.body.id}/pasos`).set(con(cli)).send({ accion: 'crear_pedido', hash: hash() }).expect(201);
  return { prov, cli, pedidoId: p.body.id as string };
}

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

describe('inicio de sesión con wallet', () => {
  it('rechaza direcciones inválidas', async () => {
    await http().post('/api/auth/desafio').send({ direccion: 'GABC' }).expect(400);
  });

  it('rechaza una firma de otra wallet', async () => {
    const par = Keypair.random();
    const d = await http().post('/api/auth/desafio').send({ direccion: par.publicKey() }).expect(200);
    const firma = firmarMensajeSep53(Keypair.random(), d.body.mensaje);
    await http().post('/api/auth/verificar').send({ direccion: par.publicKey(), nonce: d.body.nonce, firma }).expect(401);
  });

  it('un código sirve una sola vez', async () => {
    const par = Keypair.random();
    const d = await http().post('/api/auth/desafio').send({ direccion: par.publicKey() }).expect(200);
    const firma = firmarMensajeSep53(par, d.body.mensaje);
    const ok = await http().post('/api/auth/verificar').send({ direccion: par.publicKey(), nonce: d.body.nonce, firma }).expect(200);
    creados.push({ par, token: ok.body.access_token, id: ok.body.usuario.id });
    await http().post('/api/auth/verificar').send({ direccion: par.publicKey(), nonce: d.body.nonce, firma }).expect(401);
  });

  it('con sesión válida se puede leer el perfil; sin sesión no', async () => {
    const s = await entrar();
    const yo = await http().get('/api/yo').set(con(s)).expect(200);
    expect(yo.body.usuario.direccion).toBe(s.par.publicKey());
    await http().get('/api/yo').expect(401);
    await http().get('/api/yo').set({ Authorization: 'Bearer basura' }).expect(401);
  });

  it('volver a entrar con la misma wallet usa la misma cuenta', async () => {
    const s = await entrar();
    const otra = await entrar(s.par);
    expect(otra.id).toBe(s.id);
  });
});

describe('pedido completo y transiciones', () => {
  it('camino feliz con verificación y reseña', async () => {
    const { prov, servicioId } = await proveedorConServicio();
    const cli = await entrar();

    const p = await http().post('/api/pedidos').set(con(cli)).send({ servicio_id: servicioId, detalle: 'Necesito esto para el viernes' }).expect(201);
    expect(p.body.estado).toBe('solicitado');
    expect(p.body.monto_usdc).toBe('10.5');
    const id = p.body.id;
    const fecha = new Date(Date.now() + 3 * 86_400_000).toISOString();

    // El cliente no puede aceptar su propio pedido; el proveedor sí.
    await http().post(`/api/pedidos/${id}/aceptar`).set(con(cli)).send({ fecha_limite: fecha }).expect(403);
    await http().post(`/api/pedidos/${id}/aceptar`).set(con(prov)).send({ fecha_limite: fecha }).expect(200);

    // Transición inválida: liberar antes de pagar.
    await http().post(`/api/pedidos/${id}/pasos`).set(con(cli)).send({ accion: 'liberar', hash: hash() }).expect(403);
    // Acción que no es del contrato.
    await http().post(`/api/pedidos/${id}/pasos`).set(con(cli)).send({ accion: 'aceptar', hash: hash() }).expect(400);

    const h = hash();
    const pago = await http().post(`/api/pedidos/${id}/pasos`).set(con(cli)).send({ accion: 'crear_pedido', hash: h }).expect(201);
    expect(pago.body.estado).toBe('pagado');

    // El mismo hash no se acepta dos veces (ni en otro pedido).
    await http().post(`/api/pedidos/${id}/pasos`).set(con(prov)).send({ accion: 'marcar_entregado', hash: h }).expect(409);

    // Verificación: no la puede hacer quien declaró; sí la otra parte.
    const paso = await prisma.pasoPedido.findUniqueOrThrow({ where: { hash: h } });
    await http().post(`/api/pedidos/${id}/pasos/${paso.id}/verificar`).set(con(cli)).expect(403);
    await http().post(`/api/pedidos/${id}/pasos/${paso.id}/verificar`).set(con(prov)).expect(200);
    await http().post(`/api/pedidos/${id}/pasos/${paso.id}/verificar`).set(con(prov)).expect(409);

    // Reseña antes de cerrar: no.
    await http().post(`/api/pedidos/${id}/resenas`).set(con(cli)).send({ calificacion: 5 }).expect(403);

    await http().post(`/api/pedidos/${id}/pasos`).set(con(prov)).send({ accion: 'marcar_entregado', hash: hash() }).expect(201);
    const fin = await http().post(`/api/pedidos/${id}/pasos`).set(con(cli)).send({ accion: 'liberar', hash: hash() }).expect(201);
    expect(fin.body.estado).toBe('liberado');

    await http().post(`/api/pedidos/${id}/resenas`).set(con(cli)).send({ calificacion: 5, comentario: 'Excelente' }).expect(201);
    await http().post(`/api/pedidos/${id}/resenas`).set(con(cli)).send({ calificacion: 4 }).expect(409);

    const rep = await http().get(`/api/reputacion/${prov.id}`).expect(200);
    expect(rep.body).toMatchObject({ completados: 1, total_resenas: 1, calificacion: 5, nivel: 'Nuevo' });

    // Avisos generados para el proveedor.
    const avisos = await prisma.aviso.findMany({ where: { usuario_id: prov.id } });
    expect(avisos.map((a) => a.tipo)).toEqual(expect.arrayContaining(['nuevo_pedido', 'te_toca_entregar', 'pedido_cerrado']));
  });

  it('no se puede contratar el propio servicio', async () => {
    const { prov, servicioId } = await proveedorConServicio();
    await http().post('/api/pedidos').set(con(prov)).send({ servicio_id: servicioId, detalle: 'Me contrato a mí mismo' }).expect(400);
  });

  it('un tercero no ve ni toca el pedido', async () => {
    const { pedidoId } = await pedidoPagado();
    const extrano = await entrar();
    await http().post(`/api/pedidos/${pedidoId}/mensajes`).set(con(extrano)).send({ texto: 'hola' }).expect(403);
    await http().post(`/api/pedidos/${pedidoId}/pasos`).set(con(extrano)).send({ accion: 'liberar', hash: hash() }).expect(403);
  });
});

describe('disputas y permisos del árbitro', () => {
  it('solo el árbitro resuelve, y no si participa', async () => {
    const { prov, cli, pedidoId } = await pedidoPagado();
    await http()
      .post(`/api/pedidos/${pedidoId}/pasos`)
      .set(con(cli))
      .send({ accion: 'abrir_disputa', hash: hash(), motivo: 'No recibí nada todavía' })
      .expect(201);

    const resolver = { accion: 'resolver', hash: hash(), a_favor_de: 'Cliente', decision: 'El proveedor no entregó a tiempo' };
    await http().post(`/api/pedidos/${pedidoId}/pasos`).set(con(prov)).send(resolver).expect(403);
    await http().post(`/api/pedidos/${pedidoId}/pasos`).set(con(cli)).send(resolver).expect(403);

    const arbitro = await entrar();
    await http().get('/api/arbitro/disputas').set(con(arbitro)).expect(403);
    await prisma.usuario.update({ where: { id: arbitro.id }, data: { rol: 'arbitro' } });
    const lista = await http().get('/api/arbitro/disputas').set(con(arbitro)).expect(200);
    expect(lista.body.some((d: { pedido_id: string }) => d.pedido_id === pedidoId)).toBe(true);

    // Sin a_favor_de no se acepta.
    await http().post(`/api/pedidos/${pedidoId}/pasos`).set(con(arbitro)).send({ ...resolver, a_favor_de: undefined }).expect(400);
    const r = await http().post(`/api/pedidos/${pedidoId}/pasos`).set(con(arbitro)).send(resolver).expect(201);
    expect(r.body.estado).toBe('resuelto');
    const disputa = await prisma.disputa.findUniqueOrThrow({ where: { pedido_id: pedidoId } });
    expect(disputa.ganador).toBe('Cliente');

    const rep = await http().get(`/api/reputacion/${cli.id}`).expect(200);
    expect(rep.body.disputas_ganadas).toBe(1);
    const repProv = await http().get(`/api/reputacion/${prov.id}`).expect(200);
    expect(repProv.body.disputas_perdidas).toBe(1);
  });

  it('abrir disputa exige motivo', async () => {
    const { cli, pedidoId } = await pedidoPagado();
    await http().post(`/api/pedidos/${pedidoId}/pasos`).set(con(cli)).send({ accion: 'abrir_disputa', hash: hash() }).expect(400);
  });
});

describe('RLS de Supabase (lo que puede leer la web)', () => {
  const url = process.env.SUPABASE_URL!;
  const anon = process.env.SUPABASE_ANON_KEY!;
  const clienteCon = (token?: string) =>
    createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
    });

  it('los pedidos solo los ven sus participantes', async () => {
    const { cli, prov, pedidoId } = await pedidoPagado();
    const extrano = await entrar();

    const anonimo = await clienteCon().from('pedidos').select('id').eq('id', pedidoId);
    expect(anonimo.data).toEqual([]);
    const ajeno = await clienteCon(extrano.token).from('pedidos').select('id').eq('id', pedidoId);
    expect(ajeno.data).toEqual([]);
    const propio = await clienteCon(cli.token).from('pedidos').select('id').eq('id', pedidoId);
    expect(propio.data).toHaveLength(1);
    const delProveedor = await clienteCon(prov.token).from('pasos_pedido').select('id').eq('pedido_id', pedidoId);
    expect(delProveedor.data?.length).toBeGreaterThan(0);
    const pasosAjenos = await clienteCon(extrano.token).from('pasos_pedido').select('id').eq('pedido_id', pedidoId);
    expect(pasosAjenos.data).toEqual([]);
  });

  it('lo público se lee sin sesión', async () => {
    const r = await clienteCon().from('servicios').select('id').limit(1);
    expect(r.error).toBeNull();
    const rep = await clienteCon().from('reputacion').select('usuario_id').limit(1);
    expect(rep.error).toBeNull();
  });

  it('la web no puede escribir directo en ninguna tabla', async () => {
    const s = await entrar();
    const insertar = await clienteCon(s.token).from('mensajes').insert({ pedido_id: s.id, autor_id: s.id, texto: 'x' });
    expect(insertar.error).not.toBeNull();
    const editar = await clienteCon(s.token).from('usuarios').update({ rol: 'arbitro' }).eq('id', s.id).select();
    expect(editar.error ?? (editar.data?.length === 0 ? 'sin filas' : null)).not.toBeNull();
    const yo = await prisma.usuario.findUniqueOrThrow({ where: { id: s.id } });
    expect(yo.rol).toBe('usuario');
    const desafios = await clienteCon(s.token).from('desafios_login').select('*');
    expect(desafios.data ?? []).toEqual([]);
  });
});
