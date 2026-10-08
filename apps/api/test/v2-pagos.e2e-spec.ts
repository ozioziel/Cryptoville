// Cryptoville v2, fase 3 (pagos): métodos de pago, plan por etapas, garantía en el contrato v2,
// pago directo y pruebas. Sin red: las transacciones se prueban en cadena-v2.spec.ts y en el contrato.
import { Keypair } from '@stellar/stellar-sdk';
import { createHash } from 'node:crypto';
import { clienteCon, con, usarApp, type Sesion } from './ayudas';

// Para estas pruebas el servidor "tiene" un contrato v2 (sin red: nada se envía).
const ANTES = process.env.ESCROW_V2_CONTRACT_ID;
process.env.ESCROW_V2_CONTRACT_ID = 'CCRQGMOX6H2XSGGCY536IONZNRR47RCPMKH7Z4U3SP3JC5L6HHF7AVS7';
afterAll(() => {
  if (ANTES === undefined) delete process.env.ESCROW_V2_CONTRACT_ID;
  else process.env.ESCROW_V2_CONTRACT_ID = ANTES;
});

const t = usarApp();
const DIA = 86_400_000;
const fecha = (dias: number) => new Date(Date.now() + dias * DIA).toISOString();

async function pedido(metodo: string, precio = '100') {
  const prov = await t.entrar();
  const { servicioId } = await t.localConServicio(prov, 'tech', precio);
  const cli = await t.entrar();
  const p = await t.http().post('/api/pedidos').set(con(cli)).send({ servicio_id: servicioId, detalle: 'Necesito una web completa', metodo_pago: metodo }).expect(201);
  return { prov, cli, id: p.body.id as string, pedido: p.body };
}

const plan = (porcentajes: number[], pruebas: string[] = ['enlace']) =>
  porcentajes.map((p, i) => ({ descripcion: `Fase ${i + 1} del trabajo`, porcentaje_proyecto: p, porcentaje_pago: p, fecha_limite: fecha(i + 2), pruebas }));

describe('métodos de pago', () => {
  it('con el contrato v2 se puede pagar directo, con garantía o por etapas', async () => {
    const s = await t.entrar();
    const r = await t.http().get('/api/pagos/metodos').set(con(s)).expect(200);
    expect(r.body.metodos).toEqual(['directo', 'garantia', 'etapas']);
    const { pedido: p } = await pedido('etapas');
    expect(p.metodo_pago).toBe('etapas');
    expect(p.contrato).toBe('v2');
  });

  it('el cliente cambia el método antes de que el proveedor acepte', async () => {
    const { prov, cli, id } = await pedido('garantia');
    await t.http().post(`/api/pedidos/${id}/metodo`).set(con(prov)).send({ metodo_pago: 'directo' }).expect(403);
    const r = await t.http().post(`/api/pedidos/${id}/metodo`).set(con(cli)).send({ metodo_pago: 'directo' }).expect(200);
    expect(r.body.metodo_pago).toBe('directo');
    await t.http().post(`/api/pedidos/${id}/aceptar`).set(con(prov)).send({ fecha_limite: fecha(3) }).expect(200);
    await t.http().post(`/api/pedidos/${id}/metodo`).set(con(cli)).send({ metodo_pago: 'garantia' }).expect(409);
  });
});

describe('por etapas: el plan se acuerda antes de pagar', () => {
  it('el proveedor propone, el cliente pide cambios y después lo acepta', async () => {
    const { prov, cli, id } = await pedido('etapas', '100.0000001');
    await t.http().post(`/api/pedidos/${id}/aceptar`).set(con(prov)).send({ fecha_limite: fecha(3) }).expect(400);
    await t.http().post(`/api/pedidos/${id}/plan`).set(con(prov)).send({ fases: plan([50, 40]) }).expect(400);
    await t.http().post(`/api/pedidos/${id}/plan`).set(con(cli)).send({ fases: plan([50, 50]) }).expect(403);
    const r = await t.http().post(`/api/pedidos/${id}/aceptar`).set(con(prov)).send({ fecha_limite: fecha(3), fases: plan([30, 30, 40]) }).expect(200);
    expect(r.body.estado).toBe('aceptado');
    expect(r.body.plan_aceptado_en).toBeNull();

    let fases = await t.prisma.fase.findMany({ where: { pedido_id: id }, orderBy: { numero: 'asc' } });
    expect(fases.map((f) => f.porcentaje_pago)).toEqual([30, 30, 40]);
    const suma = fases.reduce((a, f) => a + Number(f.monto_usdc) * 1e7, 0);
    expect(Math.round(suma)).toBe(1_000_000_001);

    // No se puede pagar sin aceptar el plan (y en las pruebas no hay red para firmar).
    await t.http().post(`/api/pedidos/${id}/plan/cambios`).set(con(cli)).send({ comentario: 'Que la primera fase sea más chica' }).expect(200);
    const corregido = await t.http().post(`/api/pedidos/${id}/plan`).set(con(prov)).send({ fases: plan([20, 30, 50]) }).expect(200);
    expect(corregido.body.plan_comentario).toBeNull();
    fases = await t.prisma.fase.findMany({ where: { pedido_id: id }, orderBy: { numero: 'asc' } });
    expect(fases.map((f) => f.porcentaje_pago)).toEqual([20, 30, 50]);

    await t.http().post(`/api/pedidos/${id}/plan/aceptar`).set(con(prov)).expect(403);
    const aceptado = await t.http().post(`/api/pedidos/${id}/plan/aceptar`).set(con(cli)).expect(200);
    expect(aceptado.body.plan_aceptado_en).toBeTruthy();
    await t.http().post(`/api/pedidos/${id}/plan`).set(con(prov)).send({ fases: plan([50, 50]) }).expect(409);
    const pasos = await t.prisma.pasoPedido.findMany({ where: { pedido_id: id } });
    expect(pasos.map((p) => p.accion)).toContain('aceptar_plan');

    // RLS: las fases las ven las partes, nadie más.
    const delCliente = await clienteCon(cli.token).from('fases').select('numero').eq('pedido_id', id);
    expect(delCliente.data).toHaveLength(3);
    const ajeno = await t.entrar();
    const delAjeno = await clienteCon(ajeno.token).from('fases').select('numero').eq('pedido_id', id);
    expect(delAjeno.data).toEqual([]);

    // Firmar en la app necesita la red: en las pruebas avisa.
    await t
      .http()
      .post('/api/transacciones/preparar')
      .set(con(cli))
      .send({ tipo: 'paso_v2', pedido_id: id, accion: 'crear_pedido', direccion: cli.par.publicKey() })
      .expect(503);
    // Los pasos del v1 no sirven para un pedido del v2.
    await t.http().post(`/api/pedidos/${id}/pasos`).set(con(cli)).send({ accion: 'crear_pedido', hash: 'a'.repeat(64) }).expect(400);
  });
});

describe('garantía en el contrato v2', () => {
  it('es un plan de una sola fase, sin aprobación aparte', async () => {
    const { prov, id } = await pedido('garantia');
    await t.http().post(`/api/pedidos/${id}/aceptar`).set(con(prov)).send({ fecha_limite: fecha(4), monto_usdc: '80' }).expect(200);
    const fases = await t.prisma.fase.findMany({ where: { pedido_id: id } });
    expect(fases).toHaveLength(1);
    expect(fases[0]).toEqual(expect.objectContaining({ porcentaje_pago: 100, estado: 'propuesta' }));
    expect(Number(fases[0].monto_usdc)).toBe(80);
    const p = await t.prisma.pedido.findUniqueOrThrow({ where: { id } });
    expect(p.plan_aceptado_en).not.toBeNull();
  });
});

describe('pago directo', () => {
  it('después de pagar: el proveedor entrega, el cliente confirma y se puede reseñar', async () => {
    const { prov, cli, id } = await pedido('directo', '25');
    await t.http().post(`/api/pedidos/${id}/aceptar`).set(con(prov)).send({ fecha_limite: fecha(3) }).expect(200);
    expect(await t.prisma.fase.count({ where: { pedido_id: id } })).toBe(0);
    await t.http().post(`/api/pedidos/${id}/directo/entregado`).set(con(prov)).expect(409);
    // El pago directo se hace en la red; aquí se simula que ya llegó.
    await t.prisma.pedido.update({ where: { id }, data: { estado: 'pagado' } });
    await t.http().post(`/api/pedidos/${id}/directo/entregado`).set(con(cli)).expect(403);
    await t.http().post(`/api/pedidos/${id}/directo/entregado`).set(con(prov)).expect(200);
    const fin = await t.http().post(`/api/pedidos/${id}/directo/recibido`).set(con(cli)).expect(200);
    expect(fin.body.estado).toBe('finalizado');
    await t.http().post(`/api/pedidos/${id}/resenas`).set(con(cli)).send({ calificacion: 5, comentario: 'Rápido y bien' }).expect(201);
  });
});

describe('pruebas de cada fase', () => {
  async function planAceptado(pruebas: string[]) {
    const r = await pedido('etapas');
    await t.http().post(`/api/pedidos/${r.id}/plan`).set(con(r.prov)).send({ fases: plan([50, 50], pruebas) }).expect(200);
    await t.http().post(`/api/pedidos/${r.id}/plan/aceptar`).set(con(r.cli)).expect(200);
    return r;
  }

  it('el proveedor sube enlaces; la huella es el SHA-256; las pactadas se exigen antes de entregar', async () => {
    const { prov, cli, id } = await planAceptado(['archivo', 'enlace']);
    const url = 'https://ejemplo.com/avance-1';
    await t.http().post(`/api/pedidos/${id}/pruebas`).set(con(cli)).send({ fase: 0, tipo: 'enlace', titulo: 'Mío', url }).expect(403);
    await t.http().post(`/api/pedidos/${id}/pruebas`).set(con(prov)).send({ fase: 0, tipo: 'enlace', titulo: 'Avance', url: 'http://inseguro.com/x' }).expect(400);
    const p = await t.http().post(`/api/pedidos/${id}/pruebas`).set(con(prov)).send({ fase: 0, tipo: 'enlace', titulo: 'Avance', url }).expect(201);
    expect(p.body.huella).toBe(createHash('sha256').update(url).digest('hex'));

    const { PagosService } = await import('../src/pagos/pagos.service');
    const pagos = t.app.get(PagosService);
    const fase = await t.prisma.fase.findUniqueOrThrow({ where: { pedido_id_numero: { pedido_id: id, numero: 0 } } });
    await expect(pagos.huellaEntrega(id, fase)).rejects.toThrow(/falta archivo/);

    // Un archivo que no se subió desde Cryptoville no se acepta.
    await t.http().post(`/api/pedidos/${id}/pruebas`).set(con(prov)).send({ fase: 0, tipo: 'archivo', titulo: 'Diseño', ruta: 'otra/ruta.png' }).expect(400);
    const subida = await t.http().post(`/api/pedidos/${id}/pruebas/subida`).set(con(prov)).send({ fase: 0, tipo: 'application/pdf', tamano: 100 }).expect(201);
    expect(subida.body.ruta).toMatch(new RegExp(`^pedidos/${id}/0/${prov.id}/`));
    await t.http().post(`/api/pedidos/${id}/pruebas/subida`).set(con(prov)).send({ fase: 0, tipo: 'application/x-msdownload', tamano: 100 }).expect(400);

    // La prueba se ve desde la web (RLS) y se puede quitar mientras no se entregue.
    const vistas = await clienteCon(cli.token).from('pruebas').select('id').eq('pedido_id', id);
    expect(vistas.data).toHaveLength(1);
    const ver = await t.http().get(`/api/pruebas/${p.body.id}`).set(con(cli)).expect(200);
    expect(ver.body.url).toBe(url);
    await t.http().delete(`/api/pruebas/${p.body.id}`).set(con(cli)).expect(404);
    await t.http().delete(`/api/pruebas/${p.body.id}`).set(con(prov)).expect(200);
  });

  it('el expediente lo ven las partes y el árbitro', async () => {
    const { prov, id } = await planAceptado([]);
    await t.http().post(`/api/pedidos/${id}/pruebas`).set(con(prov)).send({ fase: 0, tipo: 'enlace', titulo: 'Avance', url: 'https://ejemplo.com/a' }).expect(201);
    const equipo = await t.equipo();
    const e = await t.http().get(`/api/pedidos/${id}/expediente`).set(con(equipo)).expect(200);
    expect(e.body.fases).toHaveLength(2);
    expect(e.body.pruebas).toHaveLength(1);
    const ajeno: Sesion = await t.entrar(Keypair.random());
    await t.http().get(`/api/pedidos/${id}/expediente`).set(con(ajeno)).expect(403);
  });
});
