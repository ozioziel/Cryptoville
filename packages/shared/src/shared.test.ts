import { describe, expect, it } from 'vitest';
import {
  ACCIONES,
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
