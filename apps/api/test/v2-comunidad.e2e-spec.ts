// Cryptoville v2, fase 4 (comunidad): portafolio (experiencia y proyectos), proyectos adjuntos a las propuestas
// y chat por cercanía (límite de frecuencia, bloqueos, RLS y borrado a los 7 días).
import { CercaniaService } from '../src/cercania/cercania.module';
import { clienteCon, con, usarApp, type Sesion } from './ayudas';

const t = usarApp();
const DIA = 86_400_000;
const fecha = (dias: number) => new Date(Date.now() + dias * DIA).toISOString();

const proyecto = (extra: Record<string, unknown> = {}) => ({
  titulo: 'Identidad para una cafetería',
  descripcion: 'Logo, paleta y menú impreso para una cafetería de barrio',
  fecha: '2026-05-10',
  enlaces: [{ url: 'https://www.behance.net/ejemplo', titulo: 'En Behance' }],
  videos: [{ tipo: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ' }],
  ...extra,
});

describe('portafolio', () => {
  it('experiencia y proyectos: se validan las fechas, los enlaces, los videos y las fotos', async () => {
    const s = await t.entrar();
    await t.http().post('/api/portafolio/experiencias').set(con(s)).send({ puesto: 'Diseñadora', lugar: 'Estudio Norte', desde: '2024-01-01', hasta: '2023-01-01' }).expect(400);
    const e = await t.http().post('/api/portafolio/experiencias').set(con(s)).send({ puesto: 'Diseñadora', lugar: 'Estudio Norte', desde: '2024-01-01', hasta: null }).expect(201);
    expect(e.body).toMatchObject({ puesto: 'Diseñadora', hasta: null });

    // Solo https, solo YouTube y Vimeo, y fotos subidas a Cryptoville.
    await t.http().post('/api/portafolio/proyectos').set(con(s)).send(proyecto({ enlaces: [{ url: 'http://inseguro.com' }] })).expect(400);
    await t.http().post('/api/portafolio/proyectos').set(con(s)).send(proyecto({ videos: [{ tipo: 'youtube', url: 'https://videos-raros.io/watch?v=dQw4w9WgXcQ' }] })).expect(400);
    await t.http().post('/api/portafolio/proyectos').set(con(s)).send(proyecto({ fotos: ['https://otro-sitio.com/foto.png'] })).expect(403);
    const p = await t.http().post('/api/portafolio/proyectos').set(con(s)).send(proyecto({ destacado: true })).expect(201);
    expect(p.body.videos).toEqual([{ tipo: 'youtube', id: 'dQw4w9WgXcQ', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }]);
    expect(p.body.destacado).toBe(true);

    // Es público (lectura con la llave anon), y solo su dueño lo edita.
    const { data } = await clienteCon().from('proyectos').select('id, titulo').eq('usuario_id', s.id);
    expect(data).toEqual([{ id: p.body.id, titulo: 'Identidad para una cafetería' }]);
    const otro = await t.entrar();
    await t.http().put(`/api/portafolio/proyectos/${p.body.id}`).set(con(otro)).send(proyecto()).expect(403);
    await t.http().delete(`/api/portafolio/experiencias/${e.body.id}`).set(con(otro)).expect(403);
    await t.http().delete(`/api/portafolio/experiencias/${e.body.id}`).set(con(s)).expect(200);

    // En la pared caben 4 cuadros.
    for (let i = 0; i < 3; i++) await t.http().post('/api/portafolio/proyectos').set(con(s)).send(proyecto({ destacado: true })).expect(201);
    await t.http().post('/api/portafolio/proyectos').set(con(s)).send(proyecto({ destacado: true })).expect(409);
  });

  it('un proyecto oculto por un reporte deja de verse, y se pueden adjuntar proyectos propios a una propuesta', async () => {
    const prov = await t.entrar();
    await t.http().put('/api/mi-local').set(con(prov)).send({ nombre: 'Estudio', barrio: 'creativo' }).expect(200);
    const visible = (await t.http().post('/api/portafolio/proyectos').set(con(prov)).send(proyecto()).expect(201)).body.id as string;
    const reportado = (await t.http().post('/api/portafolio/proyectos').set(con(prov)).send(proyecto({ titulo: 'Proyecto reportado' })).expect(201)).body.id as string;

    const autor = await t.entrar();
    await t.http().post('/api/reportes').set(con(autor)).send({ tipo: 'proyecto', objeto_id: reportado, motivo: 'derechos', detalle: 'Este trabajo es mío, no suyo' }).expect(201);
    const reporte = await t.prisma.reporte.findFirstOrThrow({ where: { objeto_id: reportado } });
    expect(reporte.denunciado_id).toBe(prov.id);
    const equipo = await t.equipo();
    await t.http().post(`/api/arbitro/reportes/${reporte.id}/resolver`).set(con(equipo)).send({ accion: 'ocultar', resolucion: 'Se comprobó que no es su trabajo' }).expect(200);
    const { data } = await clienteCon().from('proyectos').select('id').eq('usuario_id', prov.id);
    expect(data).toEqual([{ id: visible }]);

    const b = await t
      .http()
      .post('/api/busquedas')
      .set(con(autor))
      .send({ titulo: 'Logo para mi marca', descripcion: 'Necesito un logo sencillo y una paleta', barrio: 'creativo', categoria: 'diseno-grafico', presupuesto_usdc: '30', fecha_limite: fecha(10) })
      .expect(201);
    const base = { monto_usdc: '25', dias_entrega: 5, mensaje: 'Mira mis proyectos parecidos, te hago algo así' };
    await t.http().post(`/api/busquedas/${b.body.id}/propuestas`).set(con(prov)).send({ ...base, proyectos: [reportado] }).expect(403);
    const p = await t.http().post(`/api/busquedas/${b.body.id}/propuestas`).set(con(prov)).send({ ...base, proyectos: [visible] }).expect(201);
    expect(p.body.proyectos).toEqual([visible]);
  });
});

describe('chat por cercanía', () => {
  const escribir = (de: Sesion, para: Sesion, texto = 'Hola, ¿qué tal?') => t.http().post('/api/cercania/mensajes').set(con(de)).send({ para_id: para.id, texto });

  it('llega a la otra persona (RLS), con límite por minuto y respetando los bloqueos', async () => {
    const a = await t.entrar();
    const b = await t.entrar();
    const c = await t.entrar();
    await escribir(a, a).expect(400);
    await escribir(a, b, 'x'.repeat(281)).expect(400);
    const m = await escribir(a, b, '  Hola, vi tu local  ').expect(201);
    expect(m.body).toMatchObject({ de_id: a.id, para_id: b.id, texto: 'Hola, vi tu local' });

    // Lo ven las dos personas; una tercera, no.
    const deB = await clienteCon(b.token).from('mensajes_cercania').select('texto').eq('id', m.body.id);
    expect(deB.data).toEqual([{ texto: 'Hola, vi tu local' }]);
    const deC = await clienteCon(c.token).from('mensajes_cercania').select('texto').eq('id', m.body.id);
    expect(deC.data).toEqual([]);

    // Bloqueo: ninguno de los dos puede escribirle al otro.
    await t.http().post('/api/bloqueos').set(con(b)).send({ usuario_id: c.id }).expect(201);
    await escribir(c, b).expect(403);
    await escribir(b, c).expect(403);

    // Límite por minuto (20 en reglas.ts).
    const d = await t.entrar();
    for (let i = 0; i < 19; i++) await escribir(a, d, `Mensaje ${i}`).expect(201);
    const lento = await escribir(a, d).expect(429);
    expect(lento.body.mensaje).toContain('espera');
  });

  it('a los 7 días se borra, salvo la conversación con un reporte abierto', async () => {
    const a = await t.entrar();
    const b = await t.entrar();
    const c = await t.entrar();
    const viejo = (await escribir(a, b, 'Mensaje viejo').expect(201)).body.id as string;
    const reportado = (await escribir(a, c, 'Mensaje feo').expect(201)).body.id as string;
    const nuevo = (await escribir(b, a, 'Mensaje nuevo').expect(201)).body.id as string;
    const hace8Dias = new Date(Date.now() - 8 * DIA);
    await t.prisma.mensajeCercania.updateMany({ where: { id: { in: [viejo, reportado] } }, data: { creado_en: hace8Dias } });
    await t.http().post('/api/reportes').set(con(c)).send({ tipo: 'chat', objeto_id: a.id, motivo: 'ofensivo', detalle: 'Me escribió cosas ofensivas' }).expect(201);

    await t.app.get(CercaniaService).limpiar();
    const quedan = await t.prisma.mensajeCercania.findMany({ where: { id: { in: [viejo, reportado, nuevo] } }, select: { id: true } });
    expect(quedan.map((q) => q.id).sort()).toEqual([reportado, nuevo].sort());
  });
});

describe('personas en línea (Realtime)', () => {
  /** Se une al canal privado de la villa y devuelve las personas que ve (o el estado de error). */
  const unirse = (token: string | undefined, id: string, topico: string) =>
    new Promise<{ estado: string; canal: ReturnType<ReturnType<typeof clienteCon>['channel']>; cliente: ReturnType<typeof clienteCon> }>(async (listo) => {
      const cliente = clienteCon(token);
      // Como la web: el token de la sesión va a Realtime antes de unirse al canal privado.
      if (token) await cliente.realtime.setAuth(token);
      // Igual que la web: el oyente de presence va antes de suscribirse (si no, supabase-js no activa la presencia).
      const canal = cliente.channel(topico, { config: { private: true, presence: { key: id } } }).on('presence', { event: 'sync' }, () => undefined);
      const reloj = setTimeout(() => listo({ estado: 'TIMED_OUT', canal, cliente }), 10_000);
      canal.subscribe(async (estado) => {
        if (estado === 'SUBSCRIBED') await canal.track({ id });
        if (estado === 'SUBSCRIBED' || estado === 'CHANNEL_ERROR') {
          clearTimeout(reloj);
          listo({ estado, canal, cliente });
        }
      });
    });

  it('solo entran personas con sesión, y cada una ve a la otra', async () => {
    const a = await t.entrar();
    const b = await t.entrar();
    const topico = `villa:tech:${Date.now()}`;
    const anonimo = await unirse(undefined, 'anon', topico);
    expect(anonimo.estado).not.toBe('SUBSCRIBED');
    const ca = await unirse(a.token, a.id, topico);
    const cb = await unirse(b.token, b.id, topico);
    expect([ca.estado, cb.estado]).toEqual(['SUBSCRIBED', 'SUBSCRIBED']);
    let ve: string[] = [];
    for (let i = 0; i < 20 && !ve.includes(b.id); i++) {
      await new Promise((r) => setTimeout(r, 300));
      ve = Object.keys(ca.canal.presenceState());
    }
    expect(ve).toEqual(expect.arrayContaining([a.id, b.id]));
    for (const c of [anonimo, ca, cb]) {
      await c.cliente.removeAllChannels();
      c.cliente.realtime.disconnect();
    }
  }, 40_000);
});
