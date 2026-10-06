// Pruebas de punta a punta de la API contra Supabase local (`npm run setup` antes).
// Crean wallets nuevas en cada corrida y las borran al terminar.
process.env.LOG_LEVEL = 'silent';

import {
  APARIENCIA_POR_AVATAR,
  CATALOGO_CASA,
  casaPorDefecto,
  primerLoteLibre,
  type Barrio,
} from '@cryptoville/shared';
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

async function proveedorConServicio(barrio: Barrio = 'creativo') {
  const prov = await entrar();
  // Las villas no tienen tope de lotes: siempre hay lugar para un local nuevo.
  await http().put('/api/mi-local').set(con(prov)).send({ nombre: 'Local de prueba', barrio }).expect(200);
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

describe('villas, categorías y lotes', () => {
  const lotesDe = async (barrio: Barrio) =>
    (await prisma.local.findMany({ where: { barrio }, select: { lote: true } })).map((l) => l.lote);

  it('cada villa numera sus lotes desde 1, la casa conserva su lote y se reutilizan los huecos', async () => {
    const villa: Barrio = 'audiovisual';
    const a = await entrar();
    const esperado = primerLoteLibre(await lotesDe(villa));
    const ra = await http().put('/api/mi-local').set(con(a)).send({ nombre: 'Local A', barrio: villa }).expect(200);
    expect(ra.body).toMatchObject({ barrio: villa, lote: esperado, categoria: 'fotografia' });

    // Editar sin cambiar de villa no mueve la casa.
    const ra2 = await http().put('/api/mi-local').set(con(a)).send({ nombre: 'Local A2', barrio: villa, categoria: 'musica' }).expect(200);
    expect(ra2.body).toMatchObject({ lote: esperado, categoria: 'musica', nombre: 'Local A2' });

    // Otra persona en la misma villa recibe otro lote.
    const b = await entrar();
    const rb = await http().put('/api/mi-local').set(con(b)).send({ nombre: 'Local B', barrio: villa }).expect(200);
    expect(rb.body.lote).not.toBe(esperado);

    // A se muda a otra villa: su lote queda libre y el siguiente local nuevo lo reutiliza.
    const mudanza = await http().put('/api/mi-local').set(con(a)).send({ nombre: 'Local A', barrio: 'tech' }).expect(200);
    expect(mudanza.body.barrio).toBe('tech');
    expect(mudanza.body.categoria).toBe('desarrollo-web');
    const c = await entrar();
    const rc = await http().put('/api/mi-local').set(con(c)).send({ nombre: 'Local C', barrio: villa }).expect(200);
    expect(rc.body.lote).toBe(esperado);
  });

  it('la categoría tiene que ser de la villa del local', async () => {
    const s = await entrar();
    await http().put('/api/mi-local').set(con(s)).send({ nombre: 'Local', barrio: 'tech', categoria: 'fotografia' }).expect(400);
    await http().put('/api/mi-local').set(con(s)).send({ nombre: 'Local', barrio: 'tech', categoria: 'inventada' }).expect(400);
    const ok = await http().put('/api/mi-local').set(con(s)).send({ nombre: 'Local', barrio: 'tech', categoria: 'backend' }).expect(200);
    expect(ok.body.categoria).toBe('backend');
    await http().put('/api/mi-local').set(con(s)).send({ nombre: 'Local', barrio: 'barrio-falso' }).expect(400);
  });

  it('acepta los nombres anteriores de los barrios', async () => {
    const s = await entrar();
    const r = await http().put('/api/mi-local').set(con(s)).send({ nombre: 'Local', barrio: 'tecnologia' }).expect(200);
    expect(r.body.barrio).toBe('tech');
    const r2 = await http().put('/api/mi-local').set(con(s)).send({ nombre: 'Local', barrio: 'clases' }).expect(200);
    expect(r2.body.barrio).toBe('academy');
  });
});

describe('apariencias', () => {
  it('el personaje se valida contra el catálogo y se sigue aceptando avatar', async () => {
    const s = await entrar();
    const base = APARIENCIA_POR_AVATAR[85];
    await http().patch('/api/yo').set(con(s)).send({ apariencia: { ...base, peinado: 'mohicano' } }).expect(400);
    await http().patch('/api/yo').set(con(s)).send({ apariencia: { ...base, mascota: 'gato' } }).expect(400);
    await http().patch('/api/yo').set(con(s)).send({ apariencia: 'vecina' }).expect(400);

    const propia = { ...base, gorro: 'boina', objeto: 'camara', lentes: 'redondos' };
    const ok = await http().patch('/api/yo').set(con(s)).send({ apariencia: propia }).expect(200);
    expect(ok.body.apariencia).toEqual(propia);

    // avatar sigue funcionando y no borra la apariencia.
    const conAvatar = await http().patch('/api/yo').set(con(s)).send({ avatar: 99 }).expect(200);
    expect(conAvatar.body).toMatchObject({ avatar: 99, apariencia: propia });
    await http().patch('/api/yo').set(con(s)).send({ avatar: 5 }).expect(400);

    // null vuelve a la persona equivalente al avatar.
    const vacia = await http().patch('/api/yo').set(con(s)).send({ apariencia: null }).expect(200);
    expect(vacia.body.apariencia).toBeNull();
  });

  it('la casa solo acepta piezas de su villa y se adapta al cambiar de villa', async () => {
    const s = await entrar();
    await http().put('/api/mi-local').set(con(s)).send({ nombre: 'Casa', barrio: 'academy', apariencia: casaPorDefecto('tech') }).expect(400);
    const casa = { ...casaPorDefecto('academy'), techo: 'buhardilla', puerta: 'arco' };
    const r = await http().put('/api/mi-local').set(con(s)).send({ nombre: 'Casa', barrio: 'academy', apariencia: casa }).expect(200);
    expect(r.body.apariencia).toEqual(casa);

    // Mudanza sin casa nueva: lo compatible se conserva, lo demás pasa a las piezas base de la villa nueva.
    const m = await http().put('/api/mi-local').set(con(s)).send({ nombre: 'Casa', barrio: 'tech' }).expect(200);
    expect(m.body.apariencia.puerta).toBe('arco');
    expect(m.body.apariencia.techo).toBe(CATALOGO_CASA.tech.techo[0].id);
  });
});

describe('Se busca: lo que la gente necesita y las propuestas', () => {
  const enDias = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();
  const nueva = () => ({
    titulo: 'Logo para mi tienda',
    descripcion: 'Necesito un logo sencillo para una tienda en línea',
    barrio: 'creativo',
    categoria: 'diseno-grafico',
    presupuesto_usdc: '40',
    fecha_limite: enDias(10),
  });
  const propuesta = (monto = '35', dias = 5) => ({ monto_usdc: monto, dias_entrega: dias, mensaje: 'Te mando tres bocetos y dos rondas de cambios' });
  const publicar = async (autor: Sesion) => (await http().post('/api/busquedas').set(con(autor)).send(nueva()).expect(201)).body as { id: string };
  const proveedorConLocal = async (barrio: Barrio = 'creativo') => {
    const s = await entrar();
    await http().put('/api/mi-local').set(con(s)).send({ nombre: 'Local de prueba', barrio }).expect(200);
    return s;
  };
  const avisosDe = async (s: Sesion) => (await prisma.aviso.findMany({ where: { usuario_id: s.id } })).map((a) => a.tipo);

  it('cualquiera con sesión publica; se validan la categoría, el presupuesto y la fecha', async () => {
    const autor = await entrar();
    await http().post('/api/busquedas').send(nueva()).expect(401);
    await http().post('/api/busquedas').set(con(autor)).send({ ...nueva(), categoria: 'fotografia' }).expect(400);
    await http().post('/api/busquedas').set(con(autor)).send({ ...nueva(), presupuesto_usdc: '0' }).expect(400);
    await http().post('/api/busquedas').set(con(autor)).send({ ...nueva(), fecha_limite: enDias(-1) }).expect(400);
    await http().post('/api/busquedas').set(con(autor)).send({ ...nueva(), fecha_limite: enDias(200) }).expect(400);
    await http().post('/api/busquedas').set(con(autor)).send({ ...nueva(), titulo: 'Yo' }).expect(400);
    // No hace falta tener local para publicar.
    const ok = await http().post('/api/busquedas').set(con(autor)).send(nueva()).expect(201);
    expect(ok.body).toMatchObject({ estado: 'abierta', total_propuestas: 0, autor_id: autor.id, presupuesto_usdc: '40' });
  });

  it('cada «Se busca» toma el primer lote libre de su villa entre los visibles (para su casa en el modo trabajar)', async () => {
    const villa = 'academy';
    const visibles = async () =>
      (await prisma.busqueda.findMany({ where: { barrio: villa, estado: 'abierta', fecha_limite: { gt: new Date() } }, select: { lote: true } })).map((b) => b.lote);
    const autor = await entrar();
    const datos = { ...nueva(), barrio: villa, categoria: 'idiomas' };
    const esperado = primerLoteLibre(await visibles());
    const a = await http().post('/api/busquedas').set(con(autor)).send(datos).expect(201);
    expect(a.body.lote).toBe(esperado);
    const b = await http().post('/api/busquedas').set(con(autor)).send(datos).expect(201);
    expect(b.body.lote).not.toBe(a.body.lote);
    // Al cerrarse, su lugar queda libre y el siguiente lo reutiliza.
    await http().post(`/api/busquedas/${a.body.id}/cerrar`).set(con(autor)).expect(200);
    const c = await http().post('/api/busquedas').set(con(autor)).send(datos).expect(201);
    expect(c.body.lote).toBe(a.body.lote);
  });

  it('propuestas: hace falta local, no a uno mismo, una por proveedor, se edita y se retira', async () => {
    const autor = await entrar();
    const b = await publicar(autor);
    await http().post(`/api/busquedas/${b.id}/propuestas`).set(con(autor)).send(propuesta()).expect(400);
    const sinLocal = await entrar();
    await http().post(`/api/busquedas/${b.id}/propuestas`).set(con(sinLocal)).send(propuesta()).expect(409);

    const prov = await proveedorConLocal();
    const p1 = await http().post(`/api/busquedas/${b.id}/propuestas`).set(con(prov)).send(propuesta()).expect(201);
    expect(p1.body.estado).toBe('enviada');
    // Volver a mandar edita la misma propuesta (y no repite el aviso).
    const p2 = await http().post(`/api/busquedas/${b.id}/propuestas`).set(con(prov)).send(propuesta('30', 4)).expect(201);
    expect(p2.body).toMatchObject({ id: p1.body.id, monto_usdc: '30', dias_entrega: 4 });
    expect((await prisma.busqueda.findUniqueOrThrow({ where: { id: b.id } })).total_propuestas).toBe(1);
    expect((await avisosDe(autor)).filter((t) => t === 'nueva_propuesta')).toHaveLength(1);

    await http().post(`/api/propuestas/${p1.body.id}/retirar`).set(con(sinLocal)).expect(403);
    const retirada = await http().post(`/api/propuestas/${p1.body.id}/retirar`).set(con(prov)).expect(200);
    expect(retirada.body.estado).toBe('retirada');
    expect((await prisma.busqueda.findUniqueOrThrow({ where: { id: b.id } })).total_propuestas).toBe(0);

    await http().post(`/api/busquedas/${b.id}/propuestas`).set(con(prov)).send(propuesta()).expect(201);
    expect((await prisma.busqueda.findUniqueOrThrow({ where: { id: b.id } })).total_propuestas).toBe(1);
    expect((await avisosDe(autor)).filter((t) => t === 'nueva_propuesta')).toHaveLength(2);
  });

  it('al elegir una propuesta nace un pedido aceptado que sigue el camino de siempre', async () => {
    const autor = await entrar();
    const b = await publicar(autor);
    const elegido = await proveedorConLocal();
    const otro = await proveedorConLocal('tech');
    const pa = await http().post(`/api/busquedas/${b.id}/propuestas`).set(con(elegido)).send(propuesta('38', 4)).expect(201);
    const pb = await http().post(`/api/busquedas/${b.id}/propuestas`).set(con(otro)).send(propuesta('45', 7)).expect(201);

    // Solo quien publicó elige.
    await http().post(`/api/propuestas/${pa.body.id}/aceptar`).set(con(elegido)).expect(403);
    const r = await http().post(`/api/propuestas/${pa.body.id}/aceptar`).set(con(autor)).expect(200);
    const pedido = r.body.pedido;
    expect(pedido).toMatchObject({ estado: 'aceptado', monto_usdc: '38', cliente_id: autor.id, proveedor_id: elegido.id });
    expect(Date.parse(pedido.fecha_limite)).toBeGreaterThan(Date.now() + 3.9 * 86_400_000);
    expect(r.body.busqueda).toMatchObject({ estado: 'asignada', pedido_id: pedido.id, total_propuestas: 1 });

    // La otra propuesta queda "no elegida" y el servicio del pedido no aparece en el local.
    expect((await prisma.propuesta.findUniqueOrThrow({ where: { id: pb.body.id } })).estado).toBe('rechazada');
    const servicio = await prisma.servicio.findUniqueOrThrow({ where: { id: pedido.servicio_id } });
    expect(servicio).toMatchObject({ activo: false, busqueda_id: b.id, titulo: 'Logo para mi tienda' });
    const paso = await prisma.pasoPedido.findFirstOrThrow({ where: { pedido_id: pedido.id } });
    expect(paso).toMatchObject({ accion: 'aceptar', declarado_por: elegido.id });

    // Desde aquí es un pedido normal: el cliente paga en garantía.
    const pago = await http().post(`/api/pedidos/${pedido.id}/pasos`).set(con(autor)).send({ accion: 'crear_pedido', hash: hash() }).expect(201);
    expect(pago.body.estado).toBe('pagado');

    // Ya no recibe propuestas ni se puede elegir otra.
    await http().post(`/api/busquedas/${b.id}/propuestas`).set(con(otro)).send(propuesta()).expect(409);
    await http().post(`/api/propuestas/${pb.body.id}/aceptar`).set(con(autor)).expect(409);

    expect(await avisosDe(elegido)).toContain('propuesta_aceptada');
    expect(await avisosDe(otro)).toContain('busqueda_cerrada');
    expect(await avisosDe(autor)).toEqual(expect.arrayContaining(['nueva_propuesta', 'te_toca_pagar']));
  });

  it('quien publicó puede cerrarlo sin elegir a nadie', async () => {
    const autor = await entrar();
    const b = await publicar(autor);
    const prov = await proveedorConLocal();
    await http().post(`/api/busquedas/${b.id}/propuestas`).set(con(prov)).send(propuesta()).expect(201);
    await http().post(`/api/busquedas/${b.id}/cerrar`).set(con(prov)).expect(403);
    const r = await http().post(`/api/busquedas/${b.id}/cerrar`).set(con(autor)).expect(200);
    expect(r.body.estado).toBe('cancelada');
    await http().post(`/api/busquedas/${b.id}/cerrar`).set(con(autor)).expect(409);
    await http().post(`/api/busquedas/${b.id}/propuestas`).set(con(prov)).send(propuesta()).expect(409);
    expect(await avisosDe(prov)).toContain('busqueda_cerrada');
  });

  it('RLS: los carteles son públicos y las propuestas solo las ven quien publicó, quien propuso y el árbitro', async () => {
    const clienteCon = (token?: string) =>
      createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
      });
    const autor = await entrar();
    const b = await publicar(autor);
    const prov = await proveedorConLocal();
    await http().post(`/api/busquedas/${b.id}/propuestas`).set(con(prov)).send(propuesta()).expect(201);
    const extrano = await entrar();

    const publico = await clienteCon().from('busquedas').select('id').eq('id', b.id);
    expect(publico.data).toHaveLength(1);
    expect((await clienteCon().from('propuestas').select('id').eq('busqueda_id', b.id)).data).toEqual([]);
    expect((await clienteCon(extrano.token).from('propuestas').select('id').eq('busqueda_id', b.id)).data).toEqual([]);
    expect((await clienteCon(autor.token).from('propuestas').select('id').eq('busqueda_id', b.id)).data).toHaveLength(1);
    expect((await clienteCon(prov.token).from('propuestas').select('id').eq('busqueda_id', b.id)).data).toHaveLength(1);

    // La web no escribe directo.
    const insertar = await clienteCon(autor.token).from('busquedas').insert({ ...nueva(), autor_id: autor.id });
    expect(insertar.error).not.toBeNull();
    const editar = await clienteCon(autor.token).from('busquedas').update({ estado: 'asignada' }).eq('id', b.id).select();
    expect(editar.error ?? (editar.data?.length === 0 ? 'sin filas' : null)).not.toBeNull();
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
    const locales = await clienteCon().from('locales').select('barrio, lote, categoria, apariencia').limit(1);
    expect(locales.error).toBeNull();
    const usuarios = await clienteCon().from('usuarios').select('avatar, apariencia').limit(1);
    expect(usuarios.error).toBeNull();
    const rep = await clienteCon().from('reputacion').select('usuario_id').limit(1);
    expect(rep.error).toBeNull();
  });

  it('la web no puede escribir directo en ninguna tabla', async () => {
    const s = await entrar();
    const insertar = await clienteCon(s.token).from('mensajes').insert({ pedido_id: s.id, autor_id: s.id, texto: 'x' });
    expect(insertar.error).not.toBeNull();
    const editar = await clienteCon(s.token).from('usuarios').update({ rol: 'arbitro' }).eq('id', s.id).select();
    expect(editar.error ?? (editar.data?.length === 0 ? 'sin filas' : null)).not.toBeNull();
    const apariencia = await clienteCon(s.token).from('usuarios').update({ apariencia: { gorro: 'corona' } }).eq('id', s.id).select();
    expect(apariencia.error ?? (apariencia.data?.length === 0 ? 'sin filas' : null)).not.toBeNull();
    const yo = await prisma.usuario.findUniqueOrThrow({ where: { id: s.id } });
    expect(yo.rol).toBe('usuario');
    expect(yo.apariencia).toBeNull();
    const desafios = await clienteCon(s.token).from('desafios_login').select('*');
    expect(desafios.data ?? []).toEqual([]);
  });
});
