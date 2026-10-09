// Cryptoville v2, fase 4: varios locales por persona, el pago del local extra y las propuestas
// a un «Se busca» con el local elegido y su plan de fases. Sin red: el pago se declara con su hash.
import { Keypair } from '@stellar/stellar-sdk';
import { randomBytes } from 'node:crypto';
import { con, usarApp, type Sesion } from './ayudas';

// Para estas pruebas el servidor "tiene" contrato v2, tesorería y token (sin red: nada se envía).
const ANTES = {
  ESCROW_V2_CONTRACT_ID: process.env.ESCROW_V2_CONTRACT_ID,
  TESORERIA_DIRECCION: process.env.TESORERIA_DIRECCION,
  PAYMENT_TOKEN_ID: process.env.PAYMENT_TOKEN_ID,
};
process.env.ESCROW_V2_CONTRACT_ID = 'CCRQGMOX6H2XSGGCY536IONZNRR47RCPMKH7Z4U3SP3JC5L6HHF7AVS7';
process.env.TESORERIA_DIRECCION = Keypair.random().publicKey();
process.env.PAYMENT_TOKEN_ID ||= 'CA4VTGA7R5WLVSVLDLROPJCEWWK7PN6CTKKZVWMU3NG4IBEMPF5SEZXF';
afterAll(() => {
  for (const [clave, valor] of Object.entries(ANTES)) {
    if (valor === undefined) delete process.env[clave];
    else process.env[clave] = valor;
  }
});

const t = usarApp();
const DIA = 86_400_000;
const fecha = (dias: number) => new Date(Date.now() + dias * DIA).toISOString();
const hash = () => randomBytes(32).toString('hex');

const abrir = (s: Sesion, nombre: string, barrio = 'creativo') => t.http().post('/api/locales').set(con(s)).send({ nombre, barrio });
const cupo = async (s: Sesion) => (await t.http().get('/api/mis-locales').set(con(s)).expect(200)).body.cupo;

describe('varios locales por persona', () => {
  it('hasta 3 gratis, el cuarto con un pago único a la tesorería, y PUT /mi-local sigue con el principal', async () => {
    const s = await t.entrar();
    expect(await cupo(s)).toMatchObject({ total: 0, gratis: 3, maximo: 10, precio_extra_usdc: '5', necesita_pago: false, pago_disponible: true });

    const principal = await t.http().put('/api/mi-local').set(con(s)).send({ nombre: 'Principal', barrio: 'tech' }).expect(200);
    const ids = [principal.body.id as string];
    for (const nombre of ['Segundo', 'Tercero']) ids.push((await abrir(s, nombre).expect(201)).body.id);
    const mios = await t.http().get('/api/mis-locales').set(con(s)).expect(200);
    expect(mios.body.locales.map((l: { id: string }) => l.id)).toEqual(ids);
    expect(mios.body.cupo).toMatchObject({ total: 3, necesita_pago: true });

    // El cuarto pide el pago.
    const sinPago = await abrir(s, 'Cuarto').expect(409);
    expect(sinPago.body.mensaje).toContain('5 USDC');

    // El pago tiene que salir de una wallet de la cuenta, y cada transacción sirve una sola vez.
    const h = hash();
    await t.http().post('/api/locales/pago').set(con(s)).send({ hash: h, direccion: Keypair.random().publicKey() }).expect(403);
    const pagado = await t.http().post('/api/locales/pago').set(con(s)).send({ hash: h, direccion: s.par.publicKey() }).expect(200);
    expect(pagado.body).toMatchObject({ pagos_disponibles: 1, necesita_pago: false });
    await t.http().post('/api/locales/pago').set(con(s)).send({ hash: h, direccion: s.par.publicKey() }).expect(409);

    const cuarto = await abrir(s, 'Cuarto').expect(201);
    const pago = await t.prisma.pagoPlataforma.findUniqueOrThrow({ where: { tx_hash: h } });
    expect(pago).toMatchObject({ local_id: cuarto.body.id, concepto: 'local_extra', verificado: false });
    expect(await cupo(s)).toMatchObject({ total: 4, pagos_disponibles: 0, necesita_pago: true });

    // PUT /mi-local edita el principal (el más antiguo) y conserva su lote.
    const editado = await t.http().put('/api/mi-local').set(con(s)).send({ nombre: 'Principal renombrado', barrio: 'tech' }).expect(200);
    expect(editado.body).toMatchObject({ id: ids[0], lote: principal.body.lote, nombre: 'Principal renombrado' });

    // Cada local se edita por su id; solo su dueño.
    const segundo = await t.http().put(`/api/locales/${ids[1]}`).set(con(s)).send({ nombre: 'Segundo editado', barrio: 'creativo' }).expect(200);
    expect(segundo.body.nombre).toBe('Segundo editado');
    const otro = await t.entrar();
    await t.http().put(`/api/locales/${ids[1]}`).set(con(otro)).send({ nombre: 'Robado', barrio: 'creativo' }).expect(403);

    // Los servicios se publican en el local que se elija (o en el principal).
    const servicio = { titulo: 'Servicio', descripcion: 'Una descripción suficientemente larga', precio_usdc: '8', dias_entrega: 2 };
    const enTercero = await t.http().post('/api/servicios').set(con(s)).send({ ...servicio, local_id: ids[2] }).expect(201);
    expect(enTercero.body.local_id).toBe(ids[2]);
    const enPrincipal = await t.http().post('/api/servicios').set(con(s)).send(servicio).expect(201);
    expect(enPrincipal.body.local_id).toBe(ids[0]);
    await t.http().post('/api/servicios').set(con(otro)).send({ ...servicio, local_id: ids[2] }).expect(403);
    // Un precio de 0 es un dato inválido (400 con un mensaje claro), no un error del servidor.
    const gratis = await t.http().post('/api/servicios').set(con(s)).send({ ...servicio, precio_usdc: '0.0' }).expect(400);
    expect(JSON.stringify(gratis.body.mensaje)).toMatch(/mayor que 0/);

    // /yo devuelve el principal (como antes) y todos los locales.
    const yo = await t.http().get('/api/yo').set(con(s)).expect(200);
    expect(yo.body.local.id).toBe(ids[0]);
    expect(yo.body.locales).toHaveLength(4);
  });

  it('nadie pasa del tope de 10 locales, aunque tenga pagos', async () => {
    const s = await t.entrar();
    for (let i = 0; i < 3; i++) await abrir(s, `Gratis ${i + 1}`, 'audiovisual').expect(201);
    await t.prisma.pagoPlataforma.createMany({
      data: Array.from({ length: 8 }, () => ({ usuario_id: s.id, concepto: 'local_extra', monto_usdc: '5', tx_hash: hash(), red: 'testnet', direccion: s.par.publicKey() })),
    });
    for (let i = 0; i < 7; i++) await abrir(s, `Extra ${i + 1}`, 'audiovisual').expect(201);
    const tope = await abrir(s, 'Once', 'audiovisual').expect(409);
    expect(tope.body.mensaje).toContain('10');
    expect(await cupo(s)).toMatchObject({ total: 10, puede_abrir: false, pagos_disponibles: 1 });
  });
});

describe('propuestas a un «Se busca» con local y plan', () => {
  const busqueda = async (autor: Sesion) =>
    (
      await t
        .http()
        .post('/api/busquedas')
        .set(con(autor))
        .send({
          titulo: 'Tienda en línea',
          descripcion: 'Necesito una tienda en línea con pagos y catálogo',
          barrio: 'tech',
          categoria: 'backend',
          presupuesto_usdc: '100',
          fecha_limite: fecha(20),
        })
        .expect(201)
    ).body.id as string;
  const plan = (porcentajes: number[]) =>
    porcentajes.map((p, i) => ({ descripcion: `Fase ${i + 1} de la tienda`, porcentaje_proyecto: p, porcentaje_pago: p, fecha_limite: fecha(i + 3), pruebas: ['enlace'] }));
  const mensaje = 'Te propongo hacerla en fases, con avances cada semana';

  it('se propone desde el local elegido y, por etapas, el pedido nace con el plan ya aceptado', async () => {
    const autor = await t.entrar();
    const id = await busqueda(autor);
    const prov = await t.entrar();
    await t.http().put('/api/mi-local').set(con(prov)).send({ nombre: 'Estudio principal', barrio: 'creativo' }).expect(200);
    const tech = (await abrir(prov, 'Taller tech', 'tech').expect(201)).body.id as string;

    // Un local ajeno no sirve, y el plan se valida igual que en un pedido.
    const ajeno = (await t.http().get('/api/yo').set(con(autor)).expect(200)).body.local;
    expect(ajeno).toBeNull();
    const otro = await t.entrar();
    const localAjeno = (await t.http().put('/api/mi-local').set(con(otro)).send({ nombre: 'Ajeno', barrio: 'tech' }).expect(200)).body.id;
    await t.http().post(`/api/busquedas/${id}/propuestas`).set(con(prov)).send({ monto_usdc: '90', dias_entrega: 10, mensaje, local_id: localAjeno }).expect(403);
    await t.http().post(`/api/busquedas/${id}/propuestas`).set(con(prov)).send({ monto_usdc: '90', dias_entrega: 10, mensaje, local_id: tech, fases: plan([50, 40]) }).expect(400);

    const p = await t
      .http()
      .post(`/api/busquedas/${id}/propuestas`)
      .set(con(prov))
      .send({ monto_usdc: '90', dias_entrega: 10, mensaje, local_id: tech, fases: plan([30, 30, 40]) })
      .expect(201);
    expect(p.body).toMatchObject({ local_id: tech, dias_entrega: 5 });
    expect(p.body.plan).toHaveLength(3);

    const r = await t.http().post(`/api/propuestas/${p.body.id}/aceptar`).set(con(autor)).send({ metodo_pago: 'etapas' }).expect(200);
    expect(r.body.pedido).toMatchObject({ estado: 'aceptado', metodo_pago: 'etapas', contrato: 'v2' });
    expect(r.body.pedido.plan_aceptado_en).not.toBeNull();
    const fases = await t.prisma.fase.findMany({ where: { pedido_id: r.body.pedido.id }, orderBy: { numero: 'asc' } });
    expect(fases.map((f) => String(f.monto_usdc))).toEqual(['27', '27', '36']);
    // El servicio interno del pedido queda en el local de la propuesta.
    const servicio = await t.prisma.servicio.findUniqueOrThrow({ where: { id: r.body.pedido.servicio_id } });
    expect(servicio).toMatchObject({ local_id: tech, activo: false });
  });

  it('sin plan no se puede elegir «por etapas»; con garantía en el v2 queda una sola fase', async () => {
    const autor = await t.entrar();
    const id = await busqueda(autor);
    const prov = await t.entrar();
    await t.http().put('/api/mi-local').set(con(prov)).send({ nombre: 'Mi taller', barrio: 'tech' }).expect(200);
    const p = await t.http().post(`/api/busquedas/${id}/propuestas`).set(con(prov)).send({ monto_usdc: '60', dias_entrega: 7, mensaje }).expect(201);
    expect(p.body.plan).toBeNull();
    await t.http().post(`/api/propuestas/${p.body.id}/aceptar`).set(con(autor)).send({ metodo_pago: 'etapas' }).expect(409);
    const r = await t.http().post(`/api/propuestas/${p.body.id}/aceptar`).set(con(autor)).send({}).expect(200);
    expect(r.body.pedido).toMatchObject({ metodo_pago: 'garantia', contrato: 'v2' });
    const fases = await t.prisma.fase.findMany({ where: { pedido_id: r.body.pedido.id } });
    expect(fases).toHaveLength(1);
    expect(String(fases[0].monto_usdc)).toBe('60');
  });
});

describe('eliminar un local (archivarlo)', () => {
  it('no deja con pedidos en curso; al archivar libera el lote, apaga sus servicios, devuelve el pago y retira sus propuestas', async () => {
    const s = await t.entrar();
    const cliente = await t.entrar();
    const otro = await t.entrar();
    const principal = await t.http().put('/api/mi-local').set(con(s)).send({ nombre: 'Principal', barrio: 'audiovisual' }).expect(200);
    const segundo = (await abrir(s, 'Para borrar', 'academy').expect(201)).body as { id: string; lote: number };
    const servicio = await t
      .http()
      .post('/api/servicios')
      .set(con(s))
      .send({ local_id: segundo.id, titulo: 'Clase', descripcion: 'Una descripción suficientemente larga', precio_usdc: '5', dias_entrega: 2 })
      .expect(201);

    // Solo su dueño.
    await t.http().delete(`/api/locales/${segundo.id}`).set(con(otro)).expect(403);

    // Con un pedido sin terminar, no se puede.
    const pedido = await t.http().post('/api/pedidos').set(con(cliente)).send({ servicio_id: servicio.body.id, detalle: 'Necesito esto para el viernes' }).expect(201);
    const bloqueado = await t.http().delete(`/api/locales/${segundo.id}`).set(con(s)).expect(409);
    expect(bloqueado.body.mensaje).toMatch(/pedido en curso/);
    await t.http().post(`/api/pedidos/${pedido.body.id}/cancelar`).set(con(cliente)).expect(200);

    // Un pago de local extra atado a este local, y una propuesta enviada desde él.
    await t.prisma.pagoPlataforma.create({
      data: { usuario_id: s.id, concepto: 'local_extra', monto_usdc: 5, tx_hash: hash(), red: 'testnet', direccion: s.par.publicKey(), local_id: segundo.id },
    });
    const autor = await t.entrar();
    const busqueda = await t
      .http()
      .post('/api/busquedas')
      .set(con(autor))
      .send({ titulo: 'Necesito clases', descripcion: 'Busco clases particulares de algo', barrio: 'academy', categoria: 'cursos', presupuesto_usdc: '20', fecha_limite: fecha(10) })
      .expect(201);
    await t
      .http()
      .post(`/api/busquedas/${busqueda.body.id}/propuestas`)
      .set(con(s))
      .send({ monto_usdc: '15', dias_entrega: 3, mensaje: 'Te puedo ayudar con eso, tengo experiencia.', local_id: segundo.id })
      .expect(201);

    const r = await t.http().delete(`/api/locales/${segundo.id}`).set(con(s)).expect(200);
    expect(r.body).toMatchObject({ archivado: true, propuestas_retiradas: 1 });
    expect(r.body.cupo.total).toBe(1);

    const archivado = await t.prisma.local.findUniqueOrThrow({ where: { id: segundo.id }, include: { servicios: true } });
    expect(archivado.archivado_en).not.toBeNull();
    expect(archivado.activo).toBe(false);
    expect(archivado.servicios.every((x) => !x.activo)).toBe(true);
    expect(await t.prisma.pagoPlataforma.count({ where: { usuario_id: s.id, local_id: null } })).toBe(1);
    expect((await t.prisma.propuesta.findFirstOrThrow({ where: { busqueda_id: busqueda.body.id } })).estado).toBe('retirada');

    // Ya no es suyo para editar, no aparece en «Mis locales» y el principal sigue siendo el mismo.
    await t.http().put(`/api/locales/${segundo.id}`).set(con(s)).send({ nombre: 'Volver', barrio: 'academy' }).expect(404);
    // Sus servicios tampoco se reactivan ni se editan.
    await t.http().patch(`/api/servicios/${servicio.body.id}`).set(con(s)).send({ activo: true }).expect(404);
    const mios = await t.http().get('/api/mis-locales').set(con(s)).expect(200);
    expect(mios.body.locales.map((l: { id: string }) => l.id)).toEqual([principal.body.id]);
    // La villa lo deja de mostrar (la web lee los activos).
    const enVilla = await t.prisma.local.count({ where: { id: segundo.id, activo: true } });
    expect(enVilla).toBe(0);

    // El lote queda libre: el próximo local de esa villa lo puede tomar.
    const ocupadosAntes = await t.prisma.local.findMany({ where: { barrio: 'academy', archivado_en: null }, select: { lote: true } });
    const nuevo = (await abrir(s, 'Nuevo en Academy', 'academy').expect(201)).body as { lote: number };
    expect(ocupadosAntes.map((o) => o.lote)).not.toContain(nuevo.lote);
    if (!ocupadosAntes.some((o) => o.lote === segundo.lote)) expect(nuevo.lote).toBeLessThanOrEqual(segundo.lote);
  });
});
