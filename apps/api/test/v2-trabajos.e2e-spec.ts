// «Mis trabajos» (fase 6 del plan de correcciones): mostrar pedidos terminados en el perfil público.
// Lo público es de lectura anónima por RLS y nunca lleva el monto ni el detalle del pedido.
import { randomBytes, randomInt } from 'node:crypto';
import { clienteCon, con, usarApp, type Sesion } from './ayudas';

const t = usarApp();
const hash = () => randomBytes(32).toString('hex');

/** Un pedido creado directo en la base (sin red), con el paso que lo cerró si está terminado. */
async function pedido(servicioId: string, cliente: Sesion, proveedor: Sesion, estado: 'liberado' | 'pagado' | 'resuelto' | 'finalizado', tx = hash()) {
  const p = await t.prisma.pedido.create({
    data: {
      numero: BigInt(randomInt(1, 2 ** 47)),
      servicio_id: servicioId,
      cliente_id: cliente.id,
      proveedor_id: proveedor.id,
      estado,
      monto_usdc: '12.5',
      detalle: 'Detalle privado del pedido que no debe salir en público',
    },
  });
  if (estado !== 'pagado') {
    await t.prisma.pasoPedido.create({ data: { pedido_id: p.id, accion: 'liberar', hash: tx, declarado_por: cliente.id, en_cadena: true } });
  }
  return p;
}

const mostrar = (s: Sesion, pedidoId: string) => t.http().post(`/api/trabajos-publicos/${pedidoId}`).set(con(s));

describe('trabajos públicos («Trabajos verificados»)', () => {
  it('solo las partes, solo terminados y pagados, sin monto ni detalle, con tope y moderación', async () => {
    const proveedor = await t.entrar();
    const cliente = await t.entrar();
    const otro = await t.entrar();
    const { servicioId } = await t.localConServicio(proveedor);

    const tx = hash();
    const terminado = await pedido(servicioId, cliente, proveedor, 'liberado', tx);

    // Solo quien participó.
    await mostrar(otro, terminado.id).expect(403);

    const r = await mostrar(proveedor, terminado.id).expect(200);
    expect(r.body).toMatchObject({ usuario_id: proveedor.id, pedido_id: terminado.id, rol: 'proveedor', titulo: 'Servicio', tx_hash: tx });
    expect(r.body).not.toHaveProperty('monto_usdc');
    expect(r.body).not.toHaveProperty('detalle');
    // Repetir no duplica.
    expect((await mostrar(proveedor, terminado.id).expect(200)).body.id).toBe(r.body.id);
    // El cliente también lo puede mostrar en su perfil.
    expect((await mostrar(cliente, terminado.id).expect(200)).body.rol).toBe('cliente');

    // Sin terminar, o con una disputa resuelta, no.
    const enCurso = await pedido(servicioId, cliente, proveedor, 'pagado');
    expect((await mostrar(proveedor, enCurso.id).expect(409)).body.mensaje).toContain('terminados');
    const resuelto = await pedido(servicioId, cliente, proveedor, 'resuelto');
    await mostrar(proveedor, resuelto.id).expect(409);

    // Lectura pública (llave anon): se ve, pero sin datos del pedido.
    const anon = clienteCon();
    const publico = await anon.from('trabajos_publicos').select('*').eq('usuario_id', proveedor.id);
    expect(publico.error).toBeNull();
    expect(publico.data).toHaveLength(1);
    expect(Object.keys(publico.data![0])).not.toContain('monto_usdc');
    // El pedido sigue siendo privado.
    expect((await anon.from('pedidos').select('id').eq('id', terminado.id)).data).toEqual([]);
    // La web no escribe directo.
    const escribir = await clienteCon(proveedor.token).from('trabajos_publicos').insert({ usuario_id: proveedor.id, pedido_id: enCurso.id, rol: 'proveedor', titulo: 'x', terminado_en: new Date().toISOString() });
    expect(escribir.error).not.toBeNull();

    // Tope de 6.
    for (let i = 0; i < 5; i++) await mostrar(proveedor, (await pedido(servicioId, cliente, proveedor, 'finalizado')).id).expect(200);
    const septimo = await pedido(servicioId, cliente, proveedor, 'liberado');
    expect((await mostrar(proveedor, septimo.id).expect(409)).body.mensaje).toContain('6');

    // Se reporta y el equipo lo oculta: deja de verse en público, su dueño lo sigue viendo.
    const reporte = await t.http().post('/api/reportes').set(con(otro)).send({ tipo: 'trabajo_publico', objeto_id: r.body.id, motivo: 'spam' }).expect(201);
    expect(reporte.body.denunciado_id).toBe(proveedor.id);
    const equipo = await t.equipo();
    await t.http().post(`/api/arbitro/reportes/${reporte.body.id}/resolver`).set(con(equipo)).send({ accion: 'ocultar', resolucion: 'Prueba de moderación' }).expect(200);
    const visibles = await anon.from('trabajos_publicos').select('id').eq('usuario_id', proveedor.id);
    expect(visibles.data!.map((x) => x.id)).not.toContain(r.body.id);
    const propios = await clienteCon(proveedor.token).from('trabajos_publicos').select('id').eq('usuario_id', proveedor.id);
    expect(propios.data!.map((x) => x.id)).toContain(r.body.id);

    // Una cuenta suspendida no muestra nada.
    await t.prisma.usuario.update({ where: { id: proveedor.id }, data: { suspendido: true } });
    expect((await anon.from('trabajos_publicos').select('id').eq('usuario_id', proveedor.id)).data).toEqual([]);
    await t.prisma.usuario.update({ where: { id: proveedor.id }, data: { suspendido: false } });

    // Quitarlo libera el lugar.
    expect((await t.http().delete(`/api/trabajos-publicos/${terminado.id}`).set(con(proveedor)).expect(200)).body).toEqual({ quitado: true });
    await mostrar(proveedor, septimo.id).expect(200);
  });
});
