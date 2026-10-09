// Pruebas de la lógica de la web (sin navegador): firma local, búsqueda, pasos del pedido, plano de las villas,
// zoom y dibujo en vectores.
import { APARIENCIA_POR_AVATAR, AVATARES, LISTA_BARRIOS, casaPorDefecto } from '@cryptoville/shared';
import { Keypair } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import { accionesPara, argumentosPara, rolEnPedido } from './features/escrow/pasos';
import { firmanteDesdeSecreta, hashSep53 } from './features/auth/firma-local';
import type { PedidoDetalle } from './features/orders/datos';
import { filtrarSeBusca } from './features/busquedas/filtrar';
import { buscarServicios } from './features/services/buscar';
import type { LocalDelPueblo } from './features/services/datos';
import { crearCartelSeBusca, crearCasa, crearInterior } from './arte/casa';
import { ALTO_LAPIZ, ALTO_LIBRO, ANCHO_LAPIZ, ANCHO_LIBRO, crearLapiz, crearLibroAbierto } from './arte/escribir';
import { crearEdificioPersona, crearInteriorEdificio, letreroEdificio, pisosEdificio } from './arte/edificio';
import { TABLON, crearTablon, edificioCentral, estatua } from './arte/villa';
import { edificiosDe } from './features/plaza/datos';
import { crearPersona } from './arte/persona';
import * as plano from './game/plano';
import { resolucionTexturas, zoomPara, zoomVilla } from './game/zoom';

describe('firma local (modo desarrollo)', () => {
  it('deriva la misma dirección que stellar-sdk y firma SEP-53 verificable', async () => {
    const par = Keypair.random();
    const firmante = await firmanteDesdeSecreta(par.secret());
    expect(firmante.direccion).toBe(par.publicKey());
    const mensaje = 'WorkVille: iniciar sesión\nCódigo: abc';
    const firma = Buffer.from(await firmante.firmar(mensaje), 'base64');
    expect(par.verify(Buffer.from(hashSep53(mensaje)), firma)).toBe(true);
  });

  it('rechaza llaves con checksum incorrecto', async () => {
    const secreta = Keypair.random().secret();
    const mala = secreta.slice(0, -1) + (secreta.endsWith('A') ? 'B' : 'A');
    await expect(firmanteDesdeSecreta(mala)).rejects.toThrow();
    await expect(firmanteDesdeSecreta(Keypair.random().publicKey())).rejects.toThrow();
  });
});

const usuario = (id: string, nombre: string) => ({ id, nombre, avatar: 85, apariencia: null, direccion: 'G'.padEnd(56, 'A'), bio: null, rol: 'usuario' as const });
const local = (
  id: string,
  barrio: 'creativo' | 'academy',
  nota: number | null,
  servicios: [string, string][],
  categoria = barrio === 'creativo' ? 'diseno-grafico' : 'idiomas',
): LocalDelPueblo => ({
  id,
  usuario_id: `u-${id}`,
  nombre: `Local ${id}`,
  barrio,
  lote: 1,
  categoria,
  color: '#fff',
  apariencia: null,
  descripcion: null,
  activo: true,
  usuario: usuario(`u-${id}`, `Persona ${id}`),
  reputacion: nota === null ? null : { usuario_id: `u-${id}`, calificacion: nota, total_resenas: 1, completados: 1, disputas_ganadas: 0, disputas_perdidas: 0, nivel: 'Nuevo' },
  servicios: servicios.map(([titulo, precio], i) => ({
    id: `${id}-${i}`,
    local_id: id,
    titulo,
    descripcion: 'Descripción',
    precio_usdc: precio,
    dias_entrega: 3,
    foto_url: null,
    activo: true,
  })),
});

describe('buscador', () => {
  const locales = [
    local('a', 'creativo', 4, [['Diseño de logo', '40'], ['Ilustración', '25']]),
    local('b', 'academy', 5, [['Clase de inglés', '12'], ['Logotipo express', '15']]),
    local('c', 'academy', null, [['Curso de Rust', '30']], 'programacion'),
  ];
  it('busca sin importar acentos ni mayúsculas', () => {
    expect(buscarServicios(locales, { texto: 'DISENO', barrio: 'todos', precioMaximo: null }).map((r) => r.servicio.titulo)).toEqual(['Diseño de logo']);
  });
  it('filtra por villa y precio y ordena por reputación', () => {
    expect(buscarServicios(locales, { texto: 'logo', barrio: 'todos', precioMaximo: null }).map((r) => r.servicio.titulo)).toEqual([
      'Logotipo express',
      'Diseño de logo',
    ]);
    expect(buscarServicios(locales, { texto: '', barrio: 'creativo', precioMaximo: 30 }).map((r) => r.servicio.titulo)).toEqual(['Ilustración']);
  });
  it('filtra por categoría', () => {
    const titulos = (f: Parameters<typeof buscarServicios>[1]) => buscarServicios(locales, f).map((r) => r.servicio.titulo);
    expect(titulos({ texto: '', barrio: 'todos', categoria: 'programacion', precioMaximo: null })).toEqual(['Curso de Rust']);
    expect(titulos({ texto: '', barrio: 'academy', categoria: 'idiomas', precioMaximo: 13 })).toEqual(['Clase de inglés']);
    expect(titulos({ texto: '', barrio: 'todos', categoria: 'todas', precioMaximo: null })).toHaveLength(5);
    // Sin categoría (como las llamadas de antes) no se filtra por categoría.
    expect(titulos({ texto: '', barrio: 'todos', precioMaximo: null })).toHaveLength(5);
  });
  it('Plaza: un edificio por persona con locales (y con su lote), contando sus locales', () => {
    const conLote = (l: LocalDelPueblo, lote: number | null) => ({ ...l, usuario: { ...l.usuario, lote_plaza: lote } });
    const otro = { ...locales[0], id: 'a2', barrio: 'tech' as const };
    const edificios = edificiosDe([conLote(locales[1], 2), conLote(locales[0], 1), conLote(otro, 1), conLote(locales[2], null)]);
    expect(edificios.map((e) => [e.usuarioId, e.lote, e.locales])).toEqual([
      ['u-a', 1, 2],
      ['u-b', 2, 1],
    ]);
  });
  it('el tablón: plazo de entrega, solo verificados y orden', () => {
    const conVerificado = [{ ...locales[0], usuario: { ...locales[0].usuario, verificado: true } }, locales[1], locales[2]];
    conVerificado[1] = { ...conVerificado[1], servicios: conVerificado[1].servicios.map((s, i) => ({ ...s, dias_entrega: i ? 10 : 2, creado_en: `2026-10-0${i + 2}T00:00:00Z` })) };
    const titulos = (f: Partial<Parameters<typeof buscarServicios>[1]>) =>
      buscarServicios(conVerificado, { texto: '', barrio: 'todos', precioMaximo: null, ...f }).map((r) => r.servicio.titulo);
    expect(titulos({ plazoMaximo: 2 })).toEqual(['Clase de inglés']);
    expect(titulos({ soloVerificados: true })).toEqual(['Ilustración', 'Diseño de logo']);
    expect(titulos({ orden: 'precio-menor' })).toEqual(['Clase de inglés', 'Logotipo express', 'Ilustración', 'Curso de Rust', 'Diseño de logo']);
    expect(titulos({ orden: 'precio-mayor' })[0]).toBe('Diseño de logo');
    expect(titulos({ orden: 'nuevos' }).slice(0, 2)).toEqual(['Logotipo express', 'Clase de inglés']);
  });
});

const G_CLIENTE = Keypair.random().publicKey();
const G_PROV = Keypair.random().publicKey();
const pedido = (estado: PedidoDetalle['estado'], extra: Partial<PedidoDetalle> = {}): PedidoDetalle => ({
  id: 'p',
  numero: 1791054364005,
  servicio_id: 's',
  cliente_id: 'c',
  proveedor_id: 'v',
  estado,
  monto_usdc: '10',
  detalle: 'x',
  fecha_limite: new Date(Date.now() + 86_400_000).toISOString(),
  creado_en: new Date().toISOString(),
  actualizado_en: new Date().toISOString(),
  es_ejemplo: false,
  servicio: { titulo: 'Servicio' },
  cliente: { ...usuario('c', 'Cliente'), direccion: G_CLIENTE },
  proveedor: { ...usuario('v', 'Proveedor'), direccion: G_PROV },
  pasos: [],
  mensajes: [],
  disputa: null,
  resenas: [],
  ...extra,
});

describe('pasos del pedido', () => {
  it('rol en el pedido', () => {
    expect(rolEnPedido(pedido('pagado'), 'c', false)).toBe('cliente');
    expect(rolEnPedido(pedido('pagado'), 'otro', true)).toBe('arbitro');
    expect(rolEnPedido(pedido('pagado'), 'otro', false)).toBeNull();
  });

  it('lo principal primero; cancelar y disputar al final', () => {
    expect(accionesPara(pedido('aceptado'), 'cliente', 259200).map((a) => a.def.accion)).toEqual(['crear_pedido', 'cancelar']);
    expect(accionesPara(pedido('pagado'), 'proveedor', 259200).map((a) => a.def.accion)).toEqual(['marcar_entregado', 'rechazar', 'abrir_disputa']);
  });

  it('las acciones por vencimiento aparecen solo cuando aplican', () => {
    const vencido = pedido('pagado', { fecha_limite: new Date(Date.now() - 1000).toISOString() });
    expect(accionesPara(pedido('pagado'), 'cliente', 259200).map((a) => a.def.accion)).not.toContain('reembolsar_por_vencimiento');
    expect(accionesPara(vencido, 'cliente', 259200).map((a) => a.def.accion)).toContain('reembolsar_por_vencimiento');
    const entregado = pedido('entregado', {
      pasos: [{ id: '1', pedido_id: 'p', accion: 'marcar_entregado', hash: null, declarado_por: 'v', verificado_por: null, verificado_en: null, creado_en: new Date(Date.now() - 4 * 86_400_000).toISOString() }],
    });
    expect(accionesPara(entregado, 'proveedor', 259200).map((a) => a.def.accion)).toContain('cobrar_por_vencimiento');
  });

  it('los pedidos de ejemplo no tienen acciones', () => {
    expect(accionesPara(pedido('aceptado', { es_ejemplo: true }), 'cliente', 259200)).toEqual([]);
  });

  it('argumentos para el Lab con las direcciones reales', () => {
    const args = argumentosPara(pedido('aceptado'), 'crear_pedido', G_CLIENTE, null);
    expect(args.map((a) => a.valor).slice(0, 4)).toEqual([G_CLIENTE, G_PROV, '1791054364005', '100000000']);
  });
});

describe('Se busca: filtro de carteles', () => {
  const sb = (id: string, barrio: 'creativo' | 'academy', categoria: string, titulo: string, presupuesto: string) => ({
    id,
    autor_id: 'a',
    titulo,
    descripcion: 'Detalle de lo que necesito',
    barrio,
    categoria,
    lote: Number(id),
    presupuesto_usdc: presupuesto,
    fecha_limite: new Date(Date.now() + 5 * 86_400_000).toISOString(),
    estado: 'abierta' as const,
    total_propuestas: 0,
    pedido_id: null,
    creado_en: new Date().toISOString(),
    actualizado_en: new Date().toISOString(),
  });
  const carteles = [
    sb('1', 'creativo', 'diseno-grafico', 'Logo para mi cafetería', '40'),
    sb('2', 'academy', 'idiomas', 'Clases de inglés', '15'),
    sb('3', 'creativo', 'ilustracion', 'Ilustración para un libro', '90'),
  ];
  const ids = (f: Partial<Parameters<typeof filtrarSeBusca>[1]>) =>
    filtrarSeBusca(carteles, { texto: '', barrio: 'todos', categoria: 'todas', presupuestoMinimo: null, ...f }).map((b) => b.id);

  it('busca sin importar acentos y filtra por villa y categoría', () => {
    expect(ids({ texto: 'CAFETERIA' })).toEqual(['1']);
    expect(ids({ texto: 'ingles' })).toEqual(['2']);
    expect(ids({ barrio: 'creativo' })).toEqual(['1', '3']);
    expect(ids({ categoria: 'ilustracion' })).toEqual(['3']);
  });

  it('para quien busca trabajo: presupuesto mínimo', () => {
    expect(ids({ presupuestoMinimo: 40 })).toEqual(['1', '3']);
    expect(ids({ presupuestoMinimo: 100 })).toEqual([]);
  });

  it('el tablón: plazo, solo verificados y orden', () => {
    const ahora = Date.now();
    const lista = [
      { ...carteles[0], fecha_limite: new Date(ahora + 2 * 86_400_000).toISOString(), creado_en: '2026-10-01T00:00:00Z', autor: { verificado: true } },
      { ...carteles[1], fecha_limite: new Date(ahora + 20 * 86_400_000).toISOString(), creado_en: '2026-10-03T00:00:00Z', autor_id: 'b', autor: { verificado: false } },
      { ...carteles[2], fecha_limite: new Date(ahora + 9 * 86_400_000).toISOString(), creado_en: '2026-10-02T00:00:00Z', autor_id: 'c', autor: { verificado: true } },
    ];
    const f = (x: Partial<Parameters<typeof filtrarSeBusca>[1]>, rep?: Map<string, number | null>) =>
      filtrarSeBusca(lista, { texto: '', barrio: 'todos', categoria: 'todas', presupuestoMinimo: null, ...x }, rep, ahora).map((b) => b.id);
    expect(f({ plazoDias: 7 })).toEqual(['1']);
    expect(f({ soloVerificados: true })).toEqual(['1', '3']);
    expect(f({ orden: 'nuevos' })).toEqual(['2', '3', '1']);
    expect(f({ orden: 'presupuesto' })).toEqual(['3', '1', '2']);
    expect(f({ orden: 'vence' })).toEqual(['1', '3', '2']);
    expect(f({ orden: 'reputacion' }, new Map([['a', 3], ['b', 5], ['c', 4]]))).toEqual(['2', '3', '1']);
  });
});

describe('plano de las villas', () => {
  it('cada lote tiene su propio lugar y nunca se sale del mapa', () => {
    const vistos = new Set<string>();
    for (let lote = 1; lote <= 300; lote++) {
      const p = plano.posicionDeLote(lote);
      const clave = `${p.x},${p.y}`;
      expect(vistos.has(clave)).toBe(false);
      vistos.add(clave);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x + 150).toBeLessThanOrEqual(plano.ANCHO_VILLA);
    }
  });

  it('la posición depende solo del número de lote', () => {
    // Abrir o cerrar otros locales no cambia nada: es una función del número.
    expect(plano.posicionDeLote(37)).toEqual({ ...plano.posicionDeLote(37) });
    expect(plano.posicionDeLote(1)).toEqual({ x: plano.MARGEN_X, y: plano.PRIMERA_FILA_Y });
  });

  it('la primera fila deja libre el centro para el edificio central y la estatua', () => {
    expect(plano.lotesDeFila(0)).toEqual([1, 2, 3, 4]);
    for (const lote of plano.lotesDeFila(0)) {
      const p = plano.posicionDeLote(lote);
      expect(p.x + 150 < plano.CENTRO_X - 200 || p.x > plano.CENTRO_X + 200).toBe(true);
    }
    expect(plano.lotesDeFila(1)).toEqual([5, 6, 7, 8, 9, 10, 11]);
  });

  it('se abren filas a medida que la villa se llena', () => {
    expect(plano.filasNecesarias([])).toBe(2);
    expect(plano.filasNecesarias([1, 2, 12])).toBe(3);
    expect(plano.filasNecesarias([500])).toBeGreaterThan(70);
    expect(plano.altoVilla(3)).toBeGreaterThan(plano.altoVilla(2));
  });

  it('la puerta de cada casa queda sobre la calle de su fila', () => {
    for (const lote of [1, 4, 5, 20, 99]) {
      const puerta = plano.puertaDeLote(lote);
      const calle = plano.calleDeFila(plano.filaYColumna(lote).fila);
      expect(puerta.y).toBeGreaterThanOrEqual(calle.y);
      expect(puerta.y).toBeLessThan(calle.y + calle.alto);
    }
  });
});

describe('zoom del pueblo', () => {
  it('nunca menos de 2 ni más de 5, y entero', () => {
    expect(zoomPara(375, 812)).toBe(2);
    expect(zoomPara(1920, 1080)).toBeGreaterThanOrEqual(4);
    expect(zoomPara(8000, 8000)).toBe(5);
    expect(Number.isInteger(zoomPara(1280, 720))).toBe(true);
  });

  it('zoom de las villas: más cerca en el celular y con límites', () => {
    expect(375 / zoomVilla(375, 812)).toBeLessThan(600);
    expect(1280 / zoomVilla(1280, 760)).toBeGreaterThan(1000);
    expect(zoomVilla(8000, 8000)).toBe(1.8);
    expect(zoomVilla(100, 100)).toBe(0.5);
  });

  it('las texturas siguen al zoom y a la densidad de la pantalla', () => {
    expect(resolucionTexturas(1, 1)).toBe(1);
    expect(resolucionTexturas(0.7, 3)).toBe(2.5);
    expect(resolucionTexturas(1.8, 3)).toBe(4);
    expect(resolucionTexturas(0.5, 1)).toBe(1);
  });
});

describe('dibujo en vectores', () => {
  it('los 12 personajes viejos se dibujan como personas, sin pixel art', () => {
    for (const frame of AVATARES) {
      const svg = crearPersona(APARIENCIA_POR_AVATAR[frame]);
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).toContain('viewBox="0 0 60 92"');
      expect(svg).not.toContain('<image');
    }
    expect(crearPersona(null, { recorte: 'cabeza' })).toContain('viewBox="8 2 44 44"');
  });

  it('una apariencia con valores raros no mete texto en el SVG', () => {
    const svg = crearPersona({ ...APARIENCIA_POR_AVATAR[85], peinado: '"><script>alert(1)</script>' });
    expect(svg).not.toContain('script');
  });

  it('casas e interiores de las 4 villas; el nombre del local se escapa', () => {
    for (const b of LISTA_BARRIOS) {
      expect(crearCasa({ barrio: b, apariencia: casaPorDefecto(b), color: '#e07a5f' })).toContain('viewBox="0 0 150 172"');
      expect(crearInterior({ barrio: b, apariencia: null, color: '#3d85c6' })).toContain('viewBox="0 0 480 300"');
    }
    const casa = crearCasa({ barrio: 'audiovisual', apariencia: null, color: '#e07a5f', nombre: '<b>Café & Co</b>' });
    expect(casa).toContain('&lt;b&gt;Café &amp; Co&lt;/b&gt;');
    expect(casa).not.toContain('<b>');
  });

  it('en el modo «Quiero trabajar» la casa de un «Se busca» lleva su cartel', () => {
    const conCartel = crearCasa({ barrio: 'tech', apariencia: null, color: '#e9b44c', cartelSeBusca: true });
    expect(conCartel).toContain('SE BUSCA');
    expect(crearCasa({ barrio: 'tech', apariencia: null, color: '#e9b44c' })).not.toContain('SE BUSCA');
  });

  it('el cartel de aviso de un «Se busca» ocupa el lugar de una casa, con título y presupuesto escapados', () => {
    for (const b of LISTA_BARRIOS) {
      const svg = crearCartelSeBusca({ barrio: b, titulo: 'Logo para mi tienda', presupuesto: 'hasta 35 USDC' });
      expect(svg).toContain('viewBox="0 0 150 172"');
      expect(svg).toContain('SE BUSCA');
      expect(svg).toContain('hasta 35 USDC');
    }
    const raro = crearCartelSeBusca({ barrio: 'creativo', titulo: '<script>x</script> & más', presupuesto: '<b>9</b>' });
    expect(raro).not.toContain('<script>');
    expect(raro).not.toContain('<b>');
    expect(raro).toContain('&amp;');
    // Sin presupuesto no hay pastilla.
    expect(crearCartelSeBusca({ barrio: 'tech', titulo: 'Clases' })).not.toContain('USDC');
  });

  it('un título largo del cartel se corta en dos líneas y termina en «…»', () => {
    const svg = crearCartelSeBusca({ barrio: 'academy', titulo: 'Necesito clases de guitarra para principiantes los sábados por la tarde' });
    const lineas = [...svg.matchAll(/font-size="10"[^>]*>([^<]*)</g)].map((m) => m[1]);
    expect(lineas).toHaveLength(2);
    expect(lineas.every((l) => l.length <= 17)).toBe(true);
    expect(lineas[1].endsWith('…')).toBe(true);
  });

  it('Plaza: el edificio sale siempre igual para la misma persona y crece en pisos con los locales', () => {
    expect(pisosEdificio(1)).toBe(2);
    expect(pisosEdificio(3)).toBe(4);
    expect(pisosEdificio(10)).toBe(5);
    const a = crearEdificioPersona({ semilla: 'persona-1', pisos: 3 });
    expect(a).toBe(crearEdificioPersona({ semilla: 'persona-1', pisos: 3 }));
    expect(a).toContain('viewBox="0 0 150 172"');
    expect(crearEdificioPersona({ semilla: 'persona-1', pisos: 5 })).not.toBe(a);
    // El letrero va más arriba cuantos más pisos tiene (y nunca se sale del dibujo).
    expect(letreroEdificio(5).y).toBeLessThan(letreroEdificio(2).y);
    expect(letreroEdificio(5).y).toBeGreaterThan(0);
    expect(crearInteriorEdificio()).toContain('viewBox="0 0 480 300"');
  });

  it('el tablón de afiches y el arte de la Plaza', () => {
    for (const l of ['plaza', ...LISTA_BARRIOS] as const) {
      const svg = crearTablon(l);
      expect(svg).toContain(`viewBox="0 0 ${TABLON.ancho} ${TABLON.alto}"`);
      expect(svg).toContain('TABLÓN DE AFICHES');
    }
    expect(edificioCentral('plaza').nombre).toBe('Casa de la Plaza');
    expect(estatua('plaza').textos[0].texto).toBe('PLAZA');
  });

  it('el libro y el lápiz de «Mis pedidos» son SVG sueltos (para animar solo el lápiz)', () => {
    expect(crearLibroAbierto()).toContain(`viewBox="0 0 ${ANCHO_LIBRO} ${ALTO_LIBRO}"`);
    expect(crearLapiz()).toContain(`viewBox="0 0 ${ANCHO_LAPIZ} ${ALTO_LAPIZ}"`);
  });
});
