// Cryptoville v2, fase 2 (confianza): KYC, reportar y bloquear, avisos fuera de la app.
import { clienteCon, con, usarApp } from './ayudas';
import { firmaDiditValida, huellaDocumento } from '../src/kyc/kyc.module';
import { createHmac } from 'node:crypto';

const t = usarApp();

describe('KYC: una persona, una cuenta', () => {
  it('sin Didit configurado, el KYC no se exige y se puede abrir un local', async () => {
    const s = await t.entrar();
    const e = await t.http().get('/api/kyc/estado').set(con(s)).expect(200);
    expect(e.body.encendido).toBe(false);
    await t.http().post('/api/kyc/sesion').set(con(s)).expect(503);
    await t.http().put('/api/mi-local').set(con(s)).send({ nombre: 'Sin KYC', barrio: 'tech' }).expect(200);
  });

  it('con KYC: el mismo documento no verifica dos cuentas y la huella no guarda el número', async () => {
    const { KycService } = await import('../src/kyc/kyc.module');
    const { AvisosService } = await import('../src/avisos/avisos.service');
    const { CONFIGURACION } = await import('../src/config/configuracion');
    const base = t.app.get(CONFIGURACION);
    const config = {
      ...base,
      secretoKyc: 'k'.repeat(40),
      servicios: { ...base.servicios, didit: { apiKey: 'x', workflowId: 'w', webhookSecret: 's' } },
    };
    const kyc = new KycService(t.prisma, t.app.get(AvisosService), config);
    const a = await t.entrar();
    const b = await t.entrar();
    const usuarioA = await t.prisma.usuario.findUniqueOrThrow({ where: { id: a.id } });
    expect(() => kyc.exigir(usuarioA, 'abrir_local')).toThrow(/verifica tu identidad/);

    const doc = { document_number: 'AB-12345', document_type: 'Identity Card', issuing_state: 'BOL', status: 'Approved' };
    await t.prisma.verificacion.create({ data: { usuario_id: a.id, sesion_id: 's-' + a.id } });
    await kyc.aplicar({ vendor_data: a.id, session_id: 's-' + a.id, status: 'Approved', decision: { id_verifications: [doc] } });
    const va = await t.prisma.verificacion.findUniqueOrThrow({ where: { usuario_id: a.id } });
    expect(va.estado).toBe('aprobada');
    expect(va.huella).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(va)).not.toContain('12345');
    expect((await t.prisma.usuario.findUniqueOrThrow({ where: { id: a.id } })).verificado).toBe(true);

    // Mismo documento (escrito distinto) en otra cuenta: duplicada, sin insignia.
    await t.prisma.verificacion.create({ data: { usuario_id: b.id, sesion_id: 's-' + b.id } });
    await kyc.aplicar({
      vendor_data: b.id,
      session_id: 's-' + b.id,
      status: 'Approved',
      decision: { id_verifications: [{ ...doc, document_number: 'ab 12345' }] },
    });
    expect((await t.prisma.verificacion.findUniqueOrThrow({ where: { usuario_id: b.id } })).estado).toBe('duplicada');
    expect((await t.prisma.usuario.findUniqueOrThrow({ where: { id: b.id } })).verificado).toBe(false);

    // La web ve su propio estado, pero nunca la huella.
    const propia = await clienteCon(a.token).from('verificaciones').select('estado');
    expect(propia.data?.[0]?.estado).toBe('aprobada');
    const conHuella = await clienteCon(a.token).from('verificaciones').select('huella');
    expect(conHuella.error).not.toBeNull();
  });

  it('la firma del webhook se comprueba con el cuerpo tal como llegó y con la hora', () => {
    const cuerpo = Buffer.from(JSON.stringify({ vendor_data: 'x', status: 'Approved' }));
    const firma = createHmac('sha256', 'secreto').update(cuerpo).digest('hex');
    const ahora = Date.now();
    const marca = String(Math.floor(ahora / 1000));
    expect(firmaDiditValida('secreto', cuerpo, firma, marca, ahora)).toBe(true);
    expect(firmaDiditValida('otro', cuerpo, firma, marca, ahora)).toBe(false);
    expect(firmaDiditValida('secreto', Buffer.from('{}'), firma, marca, ahora)).toBe(false);
    expect(firmaDiditValida('secreto', cuerpo, firma, String(Math.floor(ahora / 1000) - 3600), ahora)).toBe(false);
    expect(huellaDocumento('s', { pais: 'bol', tipo: 'Passport', numero: 'a-1 2' })).toBe(huellaDocumento('s', { pais: 'BOL', tipo: 'passport', numero: 'A12' }));
    expect(huellaDocumento('s', { numero: '' })).toBeNull();
  });

  it('con el KYC apagado, el webhook no hace nada', async () => {
    await t.http().post('/api/kyc/webhook').send({ vendor_data: 'x', status: 'Approved' }).expect(503);
  });
});

describe('reportar y bloquear', () => {
  it('se reporta una vez; no a uno mismo; el equipo oculta y suspende', async () => {
    const dueno = await t.entrar();
    const { localId } = await t.localConServicio(dueno);
    const otro = await t.entrar();
    await t.http().post('/api/reportes').set(con(dueno)).send({ tipo: 'local', objeto_id: localId, motivo: 'spam' }).expect(400);
    const r = await t
      .http()
      .post('/api/reportes')
      .set(con(otro))
      .send({ tipo: 'local', objeto_id: localId, motivo: 'estafa', detalle: 'Pide pagar por fuera' })
      .expect(201);
    await t.http().post('/api/reportes').set(con(otro)).send({ tipo: 'local', objeto_id: localId, motivo: 'estafa' }).expect(409);
    await t.http().get('/api/arbitro/reportes').set(con(otro)).expect(403);

    const equipo = await t.equipo();
    const lista = await t.http().get('/api/arbitro/reportes').set(con(equipo)).expect(200);
    expect(lista.body.some((x: { id: string }) => x.id === r.body.id)).toBe(true);
    await t
      .http()
      .post(`/api/arbitro/reportes/${r.body.id}/resolver`)
      .set(con(equipo))
      .send({ accion: 'suspender', resolucion: 'Estafa comprobada' })
      .expect(200);

    expect((await t.prisma.local.findUniqueOrThrow({ where: { id: localId } })).activo).toBe(false);
    // La cuenta suspendida puede ver su perfil y escribirle al equipo, pero no hacer nada más.
    await t.http().get('/api/yo').set(con(dueno)).expect(200);
    await t.http().post('/api/comentarios').set(con(dueno)).send({ tipo: 'otro', texto: 'Quiero apelar la suspensión' }).expect(201);
    await t.http().put('/api/mi-local').set(con(dueno)).send({ nombre: 'Otro', barrio: 'tech' }).expect(403);
    const avisos = await t.prisma.aviso.findMany({ where: { usuario_id: otro.id, tipo: 'reporte_resuelto' } });
    expect(avisos).toHaveLength(1);
  });

  it('una reseña o un mensaje ocultos dejan de verse (y la reseña deja de contar)', async () => {
    const equipo = await t.equipo();
    const prov = await t.entrar();
    const cli = await t.entrar();
    const { servicioId } = await t.localConServicio(prov, 'creativo');
    const p = await t.http().post('/api/pedidos').set(con(cli)).send({ servicio_id: servicioId, detalle: 'Un pedido para el chat' }).expect(201);
    const m = await t.http().post(`/api/pedidos/${p.body.id}/mensajes`).set(con(cli)).send({ texto: 'mensaje ofensivo' }).expect(201);
    const r = await t.http().post('/api/reportes').set(con(prov)).send({ tipo: 'mensaje', objeto_id: m.body.id, motivo: 'ofensivo' }).expect(201);
    await t.http().post(`/api/arbitro/reportes/${r.body.id}/resolver`).set(con(equipo)).send({ accion: 'ocultar', resolucion: 'Insulto' }).expect(200);
    const visto = await clienteCon(prov.token).from('mensajes').select('id').eq('id', m.body.id);
    expect(visto.data).toEqual([]);
    const delEquipo = await clienteCon(equipo.token).from('mensajes').select('id').eq('id', m.body.id);
    expect(delEquipo.data).toHaveLength(1);
  });

  it('con un bloqueo no se puede pedir un servicio', async () => {
    const prov = await t.entrar();
    const { servicioId } = await t.localConServicio(prov, 'creativo');
    const cli = await t.entrar();
    await t.http().post('/api/bloqueos').set(con(prov)).send({ usuario_id: cli.id }).expect(201);
    await t.http().post('/api/pedidos').set(con(cli)).send({ servicio_id: servicioId, detalle: 'Necesito esto ya mismo' }).expect(403);
    const propios = await clienteCon(prov.token).from('bloqueos').select('bloqueado_id');
    expect(propios.data?.map((b) => b.bloqueado_id)).toEqual([cli.id]);
    const ajenos = await clienteCon(cli.token).from('bloqueos').select('bloqueado_id');
    expect(ajenos.data).toEqual([]);
    await t.http().delete(`/api/bloqueos/${cli.id}`).set(con(prov)).expect(200);
    await t.http().post('/api/pedidos').set(con(cli)).send({ servicio_id: servicioId, detalle: 'Necesito esto ya mismo' }).expect(201);
  });
});

describe('avisos fuera de la app', () => {
  it('el correo se confirma con un enlace de un solo uso; sin VAPID no hay notificaciones', async () => {
    const s = await t.entrar();
    const p = await t.http().put('/api/notificaciones/preferencias').set(con(s)).send({ correo: 'Prueba@Ejemplo.com', por_correo: true }).expect(200);
    expect(p.body.correo).toBe('prueba@ejemplo.com');
    expect(p.body.correo_verificado).toBe(false);
    expect(p.body.token_correo).toBeUndefined();
    const fila = await t.prisma.preferenciasAvisos.findUniqueOrThrow({ where: { usuario_id: s.id } });
    await t.http().post('/api/notificaciones/correo/verificar').send({ token: fila.token_correo }).expect(200);
    await t.http().post('/api/notificaciones/correo/verificar').send({ token: fila.token_correo }).expect(404);
    const web = await clienteCon(s.token).from('preferencias_avisos').select('correo, correo_verificado');
    expect(web.data?.[0]).toEqual({ correo: 'prueba@ejemplo.com', correo_verificado: true });
    const token = await clienteCon(s.token).from('preferencias_avisos').select('token_correo');
    expect(token.error).not.toBeNull();
    await t
      .http()
      .post('/api/notificaciones/push')
      .set(con(s))
      .send({ endpoint: 'https://push.example.com/abc123', keys: { p256dh: 'x'.repeat(20), auth: 'y'.repeat(16) } })
      .expect(400);
  });
});
