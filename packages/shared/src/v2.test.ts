// Pruebas de Cryptoville v2 en el paquete compartido: reglas, documentos legales, pagos y fases.
import { describe, expect, it } from 'vitest';
import {
  ACCIONES_FASE,
  DOCUMENTOS_LEGALES,
  dominioDe,
  incrustarVideo,
  loteEnSector,
  nombreSector,
  sectorDeLote,
  videoExterno,
  ETIQUETA_ACCION,
  REGLAS,
  documentosPendientes,
  estadoPedidoDesdeFases,
  mensajeInicioSesion,
  mensajeVincularWallet,
  montosDeFases,
  permiteResena,
  pruebasQueFaltan,
  puedeHacerEnFase,
  textoHuellaEntrega,
  validarPlan,
  vencioParaAccion,
  type EstadoFase,
  type PlanFase,
} from './index.js';

const DIA = 86_400_000;
const AHORA = Date.parse('2026-10-07T12:00:00Z');
const fase = (dias: number, pago: number, proyecto = pago): PlanFase => ({
  descripcion: 'Boceto y propuesta',
  porcentaje_pago: pago,
  porcentaje_proyecto: proyecto,
  fecha_limite: new Date(AHORA + dias * DIA).toISOString(),
  pruebas: ['archivo'],
});
const conEstados = (...estados: EstadoFase[]) => estados.map((estado) => ({ estado }));

describe('plan de fases', () => {
  it('acepta un plan bien armado (porcentajes del proyecto y del pago pueden ser distintos)', () => {
    expect(validarPlan([fase(3, 30, 20), fase(6, 30, 30), fase(9, 40, 50)], REGLAS.testnet, AHORA)).toBeNull();
  });

  it('rechaza planes que no suman 100%, desordenados, vencidos o con demasiadas fases', () => {
    expect(validarPlan([fase(3, 50), fase(6, 40)], REGLAS.testnet, AHORA)).toMatch(/suman 90%/);
    expect(validarPlan([fase(6, 50), fase(3, 50)], REGLAS.testnet, AHORA)).toMatch(/en orden/);
    expect(validarPlan([fase(0, 100)], REGLAS.testnet, AHORA)).toMatch(/1 hora/);
    expect(validarPlan(Array.from({ length: 6 }, (_, i) => fase(i + 1, i < 5 ? 16 : 20)), REGLAS.testnet, AHORA)).toMatch(/entre 1 y 5/);
    expect(validarPlan([{ ...fase(3, 100), pruebas: ['foto' as never] }], REGLAS.testnet, AHORA)).toMatch(/pruebas/);
  });

  it('reparte el total exacto: lo que sobra del redondeo va a la última fase', () => {
    const montos = montosDeFases(100_000_001n, [33, 33, 34]);
    expect(montos.reduce((a, b) => a + b, 0n)).toBe(100_000_001n);
    expect(montos[0]).toBe(33_000_000n);
    expect(montos[2]).toBe(34_000_001n);
  });
});

describe('estado del pedido a partir de sus fases', () => {
  it('cubre todos los casos', () => {
    expect(estadoPedidoDesdeFases(conEstados('propuesta', 'propuesta'))).toBe('aceptado');
    expect(estadoPedidoDesdeFases(conEstados('en_curso', 'en_curso'))).toBe('pagado');
    expect(estadoPedidoDesdeFases(conEstados('liberada', 'entregada'))).toBe('entregado');
    expect(estadoPedidoDesdeFases(conEstados('liberada', 'en_disputa'))).toBe('en_disputa');
    expect(estadoPedidoDesdeFases(conEstados('liberada', 'liberada'))).toBe('liberado');
    expect(estadoPedidoDesdeFases(conEstados('reembolsada', 'reembolsada'))).toBe('reembolsado');
    expect(estadoPedidoDesdeFases(conEstados('liberada', 'reembolsada', 'resuelta'))).toBe('finalizado');
    expect(permiteResena('finalizado')).toBe(true);
  });
});

describe('acciones sobre las fases', () => {
  it('las fases van en orden y cada acción la hace quien corresponde', () => {
    const fases = conEstados('en_curso', 'en_curso');
    expect(puedeHacerEnFase('entregar_fase', fases, 0, 'proveedor')).toBe(true);
    expect(puedeHacerEnFase('entregar_fase', fases, 1, 'proveedor')).toBe(false);
    expect(puedeHacerEnFase('entregar_fase', fases, 0, 'cliente')).toBe(false);
    expect(puedeHacerEnFase('liberar_fase', fases, 0, 'cliente')).toBe(true);
    expect(puedeHacerEnFase('abrir_disputa', fases, 0, 'proveedor')).toBe(true);
    expect(puedeHacerEnFase('resolver', conEstados('en_disputa'), 0, 'arbitro')).toBe(true);
    expect(puedeHacerEnFase('resolver', conEstados('en_disputa'), 0, 'cliente')).toBe(false);
    // Los vencimientos los puede ejecutar cualquiera (incluso sin rol en el pedido).
    expect(puedeHacerEnFase('cobrar_por_vencimiento', conEstados('entregada'), 0, null)).toBe(true);
    expect(puedeHacerEnFase('reembolsar_por_vencimiento', conEstados('en_disputa', 'en_curso'), 1, null)).toBe(false);
  });

  it('los vencimientos se habilitan solo cuando pasa el plazo', () => {
    const plazos = { revisionSeg: 3 * 86_400, disputaMaxSeg: 14 * 86_400 };
    const entregada = { fecha_limite: new Date(AHORA + DIA).toISOString(), entregada_en: new Date(AHORA).toISOString(), disputa_desde: null };
    expect(vencioParaAccion('cobrar_por_vencimiento', entregada, plazos, AHORA + 2 * DIA)).toBe(false);
    expect(vencioParaAccion('cobrar_por_vencimiento', entregada, plazos, AHORA + 3 * DIA + 1)).toBe(true);
    expect(vencioParaAccion('reembolsar_por_vencimiento', entregada, plazos, AHORA + DIA + 1)).toBe(true);
    expect(Object.keys(ACCIONES_FASE)).toHaveLength(8);
  });

  it('la huella de la entrega depende de cada prueba, y se exigen las pruebas pactadas', () => {
    const a = textoHuellaEntrega([{ tipo: 'archivo', huella: 'aa' }, { tipo: 'enlace', huella: 'bb' }]);
    const b = textoHuellaEntrega([{ tipo: 'archivo', huella: 'aa' }, { tipo: 'enlace', huella: 'bc' }]);
    expect(a).not.toBe(b);
    expect(pruebasQueFaltan(['archivo', 'video'], [{ tipo: 'archivo' }])).toEqual(['video']);
    expect(pruebasQueFaltan([], [])).toEqual(['archivo']);
    expect(pruebasQueFaltan([], [{ tipo: 'enlace' }])).toEqual([]);
  });

  it('todos los pasos del historial tienen nombre', () => {
    for (const a of ['aceptar_plan', 'pagar_directo', 'entregar_fase', 'liberar_fase', 'pedir_cambios', 'resolver_por_vencimiento'] as const) {
      expect(ETIQUETA_ACCION[a]).toBeTruthy();
    }
  });
});

describe('sesión y documentos', () => {
  it('el mensaje de inicio de sesión lleva la red; el de sumar una wallet dice la cuenta', () => {
    const m = mensajeInicioSesion({ direccion: 'G1', nonce: 'n', dominio: 'd', emitido: 'e', red: 'Testnet' });
    expect(m).toContain('Red: Testnet');
    expect(mensajeInicioSesion({ direccion: 'G1', nonce: 'n', dominio: 'd', emitido: 'e' })).not.toContain('Red:');
    expect(mensajeVincularWallet({ direccion: 'G2', cuenta: 'G1', nonce: 'n', dominio: 'd', emitido: 'e', red: 'Testnet' })).toContain('Cuenta: G1');
  });

  it('pide aceptar los documentos que faltan o que cambiaron de versión', () => {
    const requeridos = DOCUMENTOS_LEGALES.filter((d) => d.requiereAceptacion);
    expect(documentosPendientes([])).toHaveLength(requeridos.length);
    const todos = requeridos.map((d) => ({ documento: d.id, version: d.version }));
    expect(documentosPendientes(todos)).toEqual([]);
    expect(documentosPendientes([{ ...todos[0], version: 'vieja' }, ...todos.slice(1)])).toHaveLength(1);
  });

  it('mainnet tiene tope por pedido y las comisiones son las acordadas', () => {
    expect(Number(REGLAS.mainnet.topePedidoUsdc)).toBeGreaterThan(0);
    expect(REGLAS.testnet.comisiones).toEqual({ directoBps: 100, garantiaBps: 300, etapasBps: 300 });
    expect(REGLAS.testnet.locales.gratis).toBe(3);
    expect(REGLAS.testnet.villa.casasPorSector).toBe(60);
  });
});

describe('villa y portafolio', () => {
  it('los sectores salen del lote: 60 casas por sector, y se llaman «Creativo», «Creativo B»…', () => {
    expect([1, 60, 61, 120, 121].map((l) => sectorDeLote(l))).toEqual([1, 1, 2, 2, 3]);
    expect([1, 60, 61, 125].map((l) => loteEnSector(l))).toEqual([1, 60, 1, 5]);
    expect(nombreSector('Creativo', 1)).toBe('Creativo');
    expect(nombreSector('Creativo', 2)).toBe('Creativo B');
    expect(nombreSector('Creativo', 3)).toBe('Creativo C');
  });

  it('solo acepta videos de YouTube y Vimeo con https, y saca su id', () => {
    const r = REGLAS.testnet;
    expect(videoExterno('https://www.youtube.com/watch?v=dQw4w9WgXcQ', r)).toEqual({ tipo: 'youtube', id: 'dQw4w9WgXcQ', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
    expect(videoExterno('https://youtu.be/dQw4w9WgXcQ?t=3', r)?.id).toBe('dQw4w9WgXcQ');
    expect(videoExterno('https://youtube.com/shorts/dQw4w9WgXcQ', r)?.id).toBe('dQw4w9WgXcQ');
    expect(videoExterno('https://vimeo.com/76979871', r)).toMatchObject({ tipo: 'vimeo', id: '76979871' });
    expect(videoExterno('https://player.vimeo.com/video/76979871', r)?.id).toBe('76979871');
    expect(videoExterno('http://www.youtube.com/watch?v=dQw4w9WgXcQ', r)).toBeNull();
    expect(videoExterno('https://youtube.com.malo.io/watch?v=dQw4w9WgXcQ', r)).toBeNull();
    expect(videoExterno('https://www.youtube.com/watch?v=corto', r)).toBeNull();
    expect(incrustarVideo({ tipo: 'youtube', id: 'dQw4w9WgXcQ' })).toContain('youtube-nocookie.com/embed/');
    expect(dominioDe('https://www.behance.net/x')).toBe('behance.net');
  });
});

describe('rampa simulada', () => {
  it('cotiza la entrada (con comisión) y la salida (sin la comisión)', async () => {
    const { cotizarRampaSimulada, qrRampaSimulada } = await import('./rampas.js');
    const entrada = cotizarRampaSimulada('entrada', '10');
    expect(entrada).toMatchObject({ moneda: 'BOB', comision_local: '0.70', monto_local: '70.30' });
    const salida = cotizarRampaSimulada('salida', '10');
    expect(salida.monto_local).toBe('68.90');
    expect(() => cotizarRampaSimulada('entrada', '0')).toThrow();
    expect(qrRampaSimulada('CV-ABC123', '70.30')).toMatch(/^SIMULADO-CRYPTOVILLE\|/);
  });
});
