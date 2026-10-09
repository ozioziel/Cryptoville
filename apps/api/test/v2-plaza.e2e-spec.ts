// La Plaza principal (fase 7 del plan de correcciones): el edificio de cada persona con locales (su lote
// en la Plaza) y su CV: lo público y lo privado (RLS y la vista `cvs_publicos`), el PDF y la moderación.
import { PlazaService } from '../src/plaza/plaza.module';
import { clienteCon, con, usarApp, type Sesion } from './ayudas';

const t = usarApp();
const MB = 1024 * 1024;

const loteDe = async (s: Sesion) => (await t.prisma.usuario.findUniqueOrThrow({ where: { id: s.id }, select: { lote_plaza: true } })).lote_plaza;
const abrir = (s: Sesion, nombre: string, barrio = 'tech') => t.http().post('/api/locales').set(con(s)).send({ nombre, barrio });

describe('Plaza principal: un edificio por persona con locales', () => {
  it('se asigna con el primer local, se conserva con los demás y se libera al archivar el último', async () => {
    const a = await t.entrar();
    const b = await t.entrar();
    expect(await loteDe(a)).toBeNull();

    const primero = (await abrir(a, 'Primero').expect(201)).body as { id: string };
    const loteA = await loteDe(a);
    expect(loteA).toBeGreaterThanOrEqual(1);
    const segundo = (await abrir(a, 'Segundo', 'creativo').expect(201)).body as { id: string };
    expect(await loteDe(a)).toBe(loteA);

    // Otra persona recibe otro lote (PUT /mi-local también abre el primero).
    await t.http().put('/api/mi-local').set(con(b)).send({ nombre: 'De B', barrio: 'academy' }).expect(200);
    const loteB = await loteDe(b);
    expect(loteB).not.toBeNull();
    expect(loteB).not.toBe(loteA);

    // Es público (la web dibuja los edificios con la llave anon).
    const publico = await clienteCon().from('usuarios').select('lote_plaza').eq('id', a.id).single();
    expect(publico.data?.lote_plaza).toBe(loteA);

    // Archivar uno no lo mueve; archivar el último lo libera.
    await t.http().delete(`/api/locales/${primero.id}`).set(con(a)).expect(200);
    expect(await loteDe(a)).toBe(loteA);
    await t.http().delete(`/api/locales/${segundo.id}`).set(con(a)).expect(200);
    expect(await loteDe(a)).toBeNull();

    // Al volver a abrir un local, toma el primer lote libre (nunca el de otra persona).
    await abrir(a, 'Vuelvo').expect(201);
    const nuevo = await loteDe(a);
    expect(nuevo).not.toBeNull();
    expect(nuevo).not.toBe(loteB);
  });

  it('al arrancar, quien tiene locales y no tiene edificio lo recibe (como el backfill de la migración)', async () => {
    const c = await t.entrar();
    await abrir(c, 'Sin edificio').expect(201);
    await t.prisma.usuario.update({ where: { id: c.id }, data: { lote_plaza: null } });
    await t.app.get(PlazaService).asignarPendientes();
    expect(await loteDe(c)).not.toBeNull();
  });
});

describe('el CV de la Plaza', () => {
  it('lo privado no sale de la base; las secciones, los topes y la moderación', async () => {
    const s = await t.entrar();
    const otro = await t.entrar();

    const r = await t
      .http()
      .put('/api/cv')
      .set(con(s))
      .send({ acerca_de: 'Diseñadora con diez años de oficio', acerca_publico: false, habilidades: ['Figma', 'figma', '  Illustrator '], idiomas: [{ idioma: 'Inglés', nivel: 'avanzado' }] })
      .expect(200);
    // Sin repetidas y sin espacios de más.
    expect(r.body.habilidades).toEqual(['Figma', 'Illustrator']);

    // Los demás leen la vista pública: lo marcado como privado llega vacío.
    const anon = clienteCon();
    const vista = await anon.from('cvs_publicos').select('*').eq('usuario_id', s.id).single();
    expect(vista.data).toMatchObject({ acerca_de: null, habilidades: ['Figma', 'Illustrator'], idiomas: [{ idioma: 'Inglés', nivel: 'avanzado' }] });
    // La tabla es solo de su dueña (y del árbitro).
    expect((await anon.from('cvs').select('*').eq('usuario_id', s.id)).data ?? []).toEqual([]);
    expect((await clienteCon(otro.token).from('cvs').select('*').eq('usuario_id', s.id)).data).toEqual([]);
    expect((await clienteCon(s.token).from('cvs').select('acerca_de').eq('usuario_id', s.id).single()).data?.acerca_de).toBe('Diseñadora con diez años de oficio');

    // Topes de reglas.ts.
    await t.http().put('/api/cv').set(con(s)).send({ habilidades: Array.from({ length: 31 }, (_, i) => `Habilidad ${i}`) }).expect(400);
    await t.http().put('/api/cv').set(con(s)).send({ idiomas: [{ idioma: 'Klingon', nivel: 'experto' }] }).expect(400);

    // Secciones del CV en experiencias: privada, con enlace https y premios con una sola fecha.
    const educacion = { tipo: 'educacion', puesto: 'Diseño gráfico', lugar: 'Universidad Mayor', desde: '2015-02-01', hasta: '2019-12-01', publico: false };
    await t.http().post('/api/portafolio/experiencias').set(con(s)).send(educacion).expect(201);
    expect((await anon.from('experiencias').select('id').eq('usuario_id', s.id)).data).toEqual([]);
    expect((await clienteCon(s.token).from('experiencias').select('tipo').eq('usuario_id', s.id)).data).toEqual([{ tipo: 'educacion' }]);
    const cert = { tipo: 'certificacion', puesto: 'Google UX Design', lugar: 'Coursera', desde: '2022-05-01' };
    await t.http().post('/api/portafolio/experiencias').set(con(s)).send({ ...cert, enlace: 'http://inseguro.com/x' }).expect(400);
    await t.http().post('/api/portafolio/experiencias').set(con(s)).send({ ...cert, enlace: 'https://coursera.org/verify/ABC' }).expect(201);
    const premio = await t.http().post('/api/portafolio/experiencias').set(con(s)).send({ tipo: 'premio', puesto: 'Primer lugar', lugar: 'Concurso', desde: '2021-01-01', hasta: '2021-06-01' }).expect(201);
    expect(premio.body.hasta).toBeNull();
    await t.http().post('/api/portafolio/experiencias').set(con(s)).send({ ...cert, tipo: 'otra-cosa' }).expect(400);

    // Un proyecto privado no se ve en el portafolio público.
    const proyecto = await t.http().post('/api/portafolio/proyectos').set(con(s)).send({ titulo: 'Proyecto privado', descripcion: 'Todavía no lo quiero mostrar', publico: false }).expect(201);
    expect((await anon.from('proyectos').select('id').eq('id', proyecto.body.id)).data).toEqual([]);

    // Se reporta y el equipo lo oculta: el CV deja de verse en público.
    const reporte = await t.http().post('/api/reportes').set(con(otro)).send({ tipo: 'cv', objeto_id: s.id, motivo: 'ofensivo' }).expect(201);
    expect(reporte.body.denunciado_id).toBe(s.id);
    const equipo = await t.equipo();
    await t.http().post(`/api/arbitro/reportes/${reporte.body.id}/resolver`).set(con(equipo)).send({ accion: 'ocultar', resolucion: 'Prueba del CV' }).expect(200);
    expect((await anon.from('cvs_publicos').select('usuario_id').eq('usuario_id', s.id)).data).toEqual([]);

    // Una cuenta suspendida tampoco muestra su CV.
    await t.http().put('/api/cv').set(con(otro)).send({ acerca_de: 'Hola' }).expect(200);
    await t.prisma.usuario.update({ where: { id: otro.id }, data: { suspendido: true } });
    expect((await anon.from('cvs_publicos').select('usuario_id').eq('usuario_id', otro.id)).data).toEqual([]);
  });

  it('el PDF: solo PDF, con tope de tamaño, en la carpeta de su dueña', async () => {
    const s = await t.entrar();
    const otro = await t.entrar();

    await t.http().post('/api/cv/pdf').set(con(s)).send({ tipo: 'application/pdf', tamano: 6 * MB }).expect(400);
    await t.http().post('/api/cv/pdf').set(con(s)).send({ tipo: 'image/png', tamano: 1000 }).expect(400);

    const subida = await t.http().post('/api/cv/pdf').set(con(s)).send({ tipo: 'application/pdf', tamano: 40 }).expect(200);
    expect(subida.body.ruta).toMatch(new RegExp(`^${s.id}/[0-9a-f-]{36}\\.pdf$`));
    // Sin subir el archivo, no se puede confirmar.
    await t.http().put('/api/cv/pdf').set(con(s)).send({ ruta: subida.body.ruta }).expect(404);

    // La web sube con la URL firmada (sin llave de servicio).
    const pdf = new Blob(['%PDF-1.4\n% CV de prueba\n'], { type: 'application/pdf' });
    const { error } = await clienteCon().storage.from('cvs').uploadToSignedUrl(subida.body.ruta, subida.body.token, pdf, { contentType: 'application/pdf' });
    expect(error).toBeNull();

    // Solo su dueña lo puede poner en su CV.
    await t.http().put('/api/cv/pdf').set(con(otro)).send({ ruta: subida.body.ruta }).expect(403);
    const listo = await t.http().put('/api/cv/pdf').set(con(s)).send({ ruta: subida.body.ruta }).expect(200);
    expect(listo.body.pdf_ruta).toBe(subida.body.ruta);
    expect((await clienteCon().from('cvs_publicos').select('pdf_ruta').eq('usuario_id', s.id).single()).data?.pdf_ruta).toBe(subida.body.ruta);

    // Privado: el enlace deja de salir en la vista pública.
    await t.http().put('/api/cv').set(con(s)).send({ pdf_publico: false }).expect(200);
    expect((await clienteCon().from('cvs_publicos').select('pdf_ruta').eq('usuario_id', s.id).single()).data?.pdf_ruta).toBeNull();

    // El bucket no acepta otra cosa que PDF.
    const otra = await t.http().post('/api/cv/pdf').set(con(s)).send({ tipo: 'application/pdf', tamano: 10 }).expect(200);
    const texto = new Blob(['no soy un pdf'], { type: 'text/plain' });
    const rechazo = await clienteCon().storage.from('cvs').uploadToSignedUrl(otra.body.ruta, otra.body.token, texto, { contentType: 'text/plain' });
    expect(rechazo.error).not.toBeNull();

    expect((await t.http().delete('/api/cv/pdf').set(con(s)).expect(200)).body).toEqual({ quitado: true });
  });
});
