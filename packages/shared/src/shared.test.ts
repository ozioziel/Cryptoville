import { describe, expect, it } from 'vitest';
import {
  ACCIONES,
  ETIQUETA_ESTADO_BUSQUEDA,
  ETIQUETA_ESTADO_PROPUESTA,
  aceptaPropuestas,
  diasHasta,
  APARIENCIA_POR_AVATAR,
  AVATARES,
  BARRIOS,
  CATALOGO_CASA,
  CATALOGO_PERSONA,
  DATOS_CURIOSOS,
  LISTA_BARRIOS,
  aparienciaDeAvatar,
  aparienciaDeUsuario,
  barrioDeLote,
  casaPorDefecto,
  datosCuriososDe,
  esCategoriaDe,
  nombreCategoria,
  normalizarAparienciaCasa,
  primerLoteLibre,
  validarAparienciaCasa,
  validarAparienciaPersona,
  accionesDisponibles,
  argumentosContrato,
  comisionUnidades,
  enlaceContrato,
  enlaceTransaccion,
  esFinal,
  nivelReputacion,
  permiteResena,
  puedeHacer,
  siguienteEstado,
  unidadesAUsdc,
  usdcAUnidades,
  type EstadoPedido,
} from './index.js';

const G1 = 'GB6T5JBJX224F2BD7U3ZYH66CMUPMOWVAWA2B2IZH7AXK3WRJLHDDWYL';
const G2 = 'GCUP4ZD5P7R7IPC3BHQ4MMN6JPSHZQK5VQUYGJ46D5KMQCV22FINKJJN';
const C1 = 'CCRQGMOX6H2XSGGCY536IONZNRR47RCPMKH7Z4U3SP3JC5L6HHF7AVS7';

describe('estados del pedido', () => {
  it('camino feliz', () => {
    let e: EstadoPedido = 'solicitado';
    for (const a of ['aceptar', 'crear_pedido', 'marcar_entregado', 'liberar'] as const) {
      e = siguienteEstado(e, a);
    }
    expect(e).toBe('liberado');
    expect(esFinal(e)).toBe(true);
    expect(permiteResena(e)).toBe(true);
  });

  it('rechaza transiciones inválidas', () => {
    expect(() => siguienteEstado('solicitado', 'liberar')).toThrow();
    expect(() => siguienteEstado('liberado', 'abrir_disputa')).toThrow();
    expect(() => siguienteEstado('en_disputa', 'liberar')).toThrow();
  });

  it('cada acción la hace el actor correcto', () => {
    expect(puedeHacer('aceptar', 'solicitado', 'proveedor')).toBe(true);
    expect(puedeHacer('aceptar', 'solicitado', 'cliente')).toBe(false);
    expect(puedeHacer('liberar', 'entregado', 'cliente')).toBe(true);
    expect(puedeHacer('liberar', 'entregado', 'proveedor')).toBe(false);
    expect(puedeHacer('abrir_disputa', 'pagado', 'proveedor')).toBe(true);
    expect(puedeHacer('abrir_disputa', 'pagado', 'arbitro')).toBe(false);
    expect(puedeHacer('resolver', 'en_disputa', 'arbitro')).toBe(true);
    expect(puedeHacer('resolver', 'en_disputa', 'cliente')).toBe(false);
  });

  it('las acciones en cadena coinciden con el contrato', () => {
    const enCadena = Object.values(ACCIONES).filter((a) => a.enCadena).map((a) => a.accion);
    expect(enCadena.sort()).toEqual(
      [
        'abrir_disputa',
        'cobrar_por_vencimiento',
        'crear_pedido',
        'liberar',
        'marcar_entregado',
        'rechazar',
        'reembolsar_por_vencimiento',
        'resolver',
      ].sort(),
    );
  });

  it('acciones disponibles', () => {
    expect(accionesDisponibles('pagado', 'cliente').map((a) => a.accion)).toEqual([
      'liberar',
      'abrir_disputa',
      'reembolsar_por_vencimiento',
    ]);
    expect(accionesDisponibles('liberado', 'cliente')).toEqual([]);
  });
});

describe('montos', () => {
  it('convierte USDC a unidades y de vuelta', () => {
    expect(usdcAUnidades('1')).toBe('10000000');
    expect(usdcAUnidades('25.5')).toBe('255000000');
    expect(usdcAUnidades('0.0000001')).toBe('1');
    expect(unidadesAUsdc('255000000')).toBe('25.5');
    expect(unidadesAUsdc(10000000n)).toBe('1');
  });

  it('rechaza montos inválidos', () => {
    expect(() => usdcAUnidades('-1')).toThrow();
    expect(() => usdcAUnidades('1.12345678')).toThrow();
    expect(() => usdcAUnidades('abc')).toThrow();
  });

  it('comisión igual que el contrato (redondeo hacia abajo)', () => {
    expect(comisionUnidades('1000000000', 300)).toBe('30000000');
    expect(comisionUnidades('99', 300)).toBe('2');
  });
});

describe('argumentos para Stellar Lab', () => {
  const ctx = {
    numero: 7,
    cliente: G1,
    proveedor: G2,
    montoUsdc: '12.5',
    fechaLimite: '2026-10-10T00:00:00.000Z',
  };

  it('crear_pedido', () => {
    const args = argumentosContrato('crear_pedido', ctx);
    expect(args.map((a) => [a.nombre, a.valor])).toEqual([
      ['cliente', G1],
      ['proveedor', G2],
      ['id', '7'],
      ['monto', '125000000'],
      ['fecha_limite_entrega', '1791590400'],
    ]);
  });

  it('resolver pide árbitro y parte', () => {
    expect(() => argumentosContrato('resolver', ctx)).toThrow();
    const args = argumentosContrato('resolver', { ...ctx, arbitro: G1, aFavorDe: 'Proveedor' });
    expect(args.map((a) => a.valor)).toEqual([G1, '7', 'Proveedor']);
  });
});

describe('enlaces a Stellar Lab', () => {
  it('Contract Explorer con el mismo formato que genera el Lab', () => {
    expect(enlaceContrato(C1)).toBe(
      'https://lab.stellar.org/smart-contracts/contract-explorer?$=network$id=testnet&label=Testnet' +
        '&horizonUrl=https:////horizon-testnet.stellar.org&rpcUrl=https:////soroban-testnet.stellar.org' +
        '&passphrase=Test%20SDF%20Network%20/;%20September%202015;' +
        `&smartContracts$explorer$contractId=${C1};;`,
    );
  });

  it('Transaction Dashboard', () => {
    const hash = 'A'.repeat(64);
    expect(enlaceTransaccion(hash)).toContain(`&txDashboard$transactionHash=${'a'.repeat(64)};;`);
    expect(() => enlaceTransaccion('123')).toThrow();
  });
});

describe('reputación', () => {
  it('niveles', () => {
    expect(nivelReputacion(0, null)).toBe('Nuevo');
    expect(nivelReputacion(3, 4)).toBe('Confiable');
    expect(nivelReputacion(10, 4.5)).toBe('Destacado');
    expect(nivelReputacion(10, 4.2)).toBe('Confiable');
  });
});

describe('villas y categorías', () => {
  it('son las 4 villas, en el orden del selector', () => {
    expect(LISTA_BARRIOS).toEqual(['creativo', 'tech', 'audiovisual', 'academy']);
    expect(BARRIOS.audiovisual.color).toBe('#a95656');
  });

  it('cada villa tiene 5 categorías propias, sin ids repetidos entre villas', () => {
    const ids = LISTA_BARRIOS.flatMap((b) => BARRIOS[b].categorias.map((c) => c.id));
    expect(ids).toHaveLength(20);
    expect(new Set(ids).size).toBe(20);
    expect(esCategoriaDe('audiovisual', 'edicion-video')).toBe(true);
    expect(esCategoriaDe('tech', 'edicion-video')).toBe(false);
    expect(nombreCategoria('idiomas')).toBe('Idiomas');
  });

  it('la primera categoría de cada villa es la inicial (la usa la migración)', () => {
    expect(LISTA_BARRIOS.map((b) => BARRIOS[b].categorias[0].id)).toEqual(['diseno-grafico', 'desarrollo-web', 'fotografia', 'cursos']);
  });
});

describe('lotes de cada villa', () => {
  it('usa el primer número libre y reutiliza los huecos', () => {
    expect(primerLoteLibre([])).toBe(1);
    expect(primerLoteLibre([1, 2, 3])).toBe(4);
    expect(primerLoteLibre([1, 3, 4])).toBe(2);
    expect(primerLoteLibre([2, 5])).toBe(1);
  });

  it('no hay tope: una villa puede tener cientos de lotes', () => {
    expect(primerLoteLibre(Array.from({ length: 500 }, (_, i) => i + 1))).toBe(501);
  });

  it('barrioDeLote (obsoleto) sigue compilando y respondiendo', () => {
    expect(barrioDeLote(1)).toBe('creativo');
    expect(barrioDeLote(99)).toBeNull();
  });
});

describe('apariencia de las personas', () => {
  it('los 12 personajes de Kenney tienen una persona equivalente y válida', () => {
    for (const frame of AVATARES) {
      expect(APARIENCIA_POR_AVATAR[frame]).toBeDefined();
      expect(validarAparienciaPersona(APARIENCIA_POR_AVATAR[frame]).ok).toBe(true);
    }
  });

  it('conserva el estilo del personaje original', () => {
    expect(aparienciaDeAvatar(99)).toMatchObject({ peinado: 'largo', arriba: 'vestido', colorArriba: 'lavanda' });
    expect(aparienciaDeAvatar(86)).toMatchObject({ peinado: 'calvo', barba: 'bigote', arriba: 'delantal' });
    expect(aparienciaDeAvatar(84)).toMatchObject({ barba: 'completa', colorPelo: 'blanco' });
    // Un número desconocido usa el personaje por defecto.
    expect(aparienciaDeAvatar(5)).toEqual(APARIENCIA_POR_AVATAR[85]);
  });

  it('si no hay apariencia guardada se usa la del avatar; si hay, manda la apariencia', () => {
    expect(aparienciaDeUsuario({ avatar: 112, apariencia: null })).toEqual(APARIENCIA_POR_AVATAR[112]);
    const propia = { ...APARIENCIA_POR_AVATAR[85], gorro: 'boina', objeto: 'camara' };
    expect(aparienciaDeUsuario({ avatar: 112, apariencia: propia })).toEqual(propia);
  });

  it('valida contra el catálogo', () => {
    const base = APARIENCIA_POR_AVATAR[85];
    expect(validarAparienciaPersona({ ...base, peinado: 'mohicano' })).toMatchObject({ ok: false });
    expect(validarAparienciaPersona({ ...base, extra: 'x' })).toMatchObject({ ok: false });
    const { gorro: _gorro, ...sinGorro } = base;
    expect(validarAparienciaPersona(sinGorro)).toMatchObject({ ok: false });
    expect(validarAparienciaPersona('polera')).toMatchObject({ ok: false });
    expect(validarAparienciaPersona(base)).toEqual({ ok: true, valor: base });
  });

  it('el catálogo tiene todas las partes pedidas y nada infantil', () => {
    expect(Object.keys(CATALOGO_PERSONA)).toHaveLength(13);
    const ids = Object.values(CATALOGO_PERSONA).flatMap((o) => o.map((x) => x.id));
    for (const prohibido of ['globo', 'mono', 'corona', 'rubor', 'oso', 'gato', 'perro', 'conejo']) {
      expect(ids.some((id) => id.includes(prohibido))).toBe(false);
    }
    expect(CATALOGO_PERSONA.objeto.map((o) => o.id)).toEqual(
      expect.arrayContaining(['camara', 'laptop', 'pincel', 'libro', 'taza', 'microfono', 'tableta']),
    );
  });
});

describe('apariencia de las casas', () => {
  it('la casa por defecto de cada villa es válida en su villa', () => {
    for (const b of LISTA_BARRIOS) expect(validarAparienciaCasa(b, casaPorDefecto(b)).ok).toBe(true);
  });

  it('solo acepta piezas de la propia villa', () => {
    const tech = { ...casaPorDefecto('tech'), techo: 'solar' };
    expect(validarAparienciaCasa('tech', tech).ok).toBe(true);
    expect(validarAparienciaCasa('academy', tech)).toMatchObject({ ok: false });
    expect(validarAparienciaCasa('tech', { ...tech, colorTecho: '#ff0000' })).toMatchObject({ ok: false });
  });

  it('al cambiar de villa se conservan las piezas compatibles y el resto vuelve a la base', () => {
    const creativa = { ...casaPorDefecto('creativo'), techo: 'jardin', puerta: 'arco', toldo: 'ondas' };
    const enTech = normalizarAparienciaCasa('tech', creativa);
    expect(enTech.puerta).toBe('arco');
    expect(enTech.toldo).toBe('ondas');
    expect(enTech.techo).toBe(CATALOGO_CASA.tech.techo[0].id);
    expect(normalizarAparienciaCasa('academy', null)).toEqual(casaPorDefecto('academy'));
  });
});

describe('datos curiosos', () => {
  it('más de la mitad son sobre Stellar y todos tienen fuente', () => {
    const stellar = DATOS_CURIOSOS.filter((d) => d.tema === 'stellar').length;
    expect(stellar * 2).toBeGreaterThan(DATOS_CURIOSOS.length);
    for (const d of DATOS_CURIOSOS) expect(d.fuente).toMatch(/^https:\/\//);
  });

  it('cada villa suma datos de su tema', () => {
    for (const b of LISTA_BARRIOS) {
      expect(datosCuriososDe(b).some((d) => d.tema === b)).toBe(true);
      expect(datosCuriososDe(b).some((d) => d.tema !== b && d.tema !== 'stellar' && d.tema !== 'general')).toBe(false);
    }
  });
});

describe('Se busca', () => {
  const ahora = Date.parse('2026-10-06T12:00:00Z');
  it('acepta propuestas solo si está abierto y no venció', () => {
    expect(aceptaPropuestas({ estado: 'abierta', fecha_limite: '2026-10-10T00:00:00Z' }, ahora)).toBe(true);
    expect(aceptaPropuestas({ estado: 'abierta', fecha_limite: '2026-10-01T00:00:00Z' }, ahora)).toBe(false);
    expect(aceptaPropuestas({ estado: 'asignada', fecha_limite: '2026-10-10T00:00:00Z' }, ahora)).toBe(false);
    expect(aceptaPropuestas({ estado: 'cancelada', fecha_limite: '2026-10-10T00:00:00Z' }, ahora)).toBe(false);
  });

  it('sugiere los días que faltan, entre 1 y 90', () => {
    expect(diasHasta('2026-10-10T12:00:00Z', ahora)).toBe(4);
    expect(diasHasta('2026-10-06T13:00:00Z', ahora)).toBe(1);
    expect(diasHasta('2026-10-01T00:00:00Z', ahora)).toBe(1);
    expect(diasHasta('2027-12-31T00:00:00Z', ahora)).toBe(90);
    expect(diasHasta('no es fecha', ahora)).toBe(1);
  });

  it('todos los estados tienen su etiqueta', () => {
    expect(Object.keys(ETIQUETA_ESTADO_BUSQUEDA).sort()).toEqual(['abierta', 'asignada', 'cancelada']);
    expect(Object.keys(ETIQUETA_ESTADO_PROPUESTA).sort()).toEqual(['aceptada', 'enviada', 'rechazada', 'retirada']);
  });
});
