// Datos del contrato de escrow (contracts/escrow): nombres de funciones, argumentos y errores.
// Si el contrato cambia, este es el único archivo de la app que hay que actualizar.
import type { AccionPedido, Parte } from '../types/index.js';

/** El USDC de prueba es un Stellar Asset: 7 decimales. 1 USDC = 10_000_000 unidades. */
export const DECIMALES_TOKEN = 7;

/** Valores por defecto del constructor (comisión del 3%, 3 días de revisión). */
export const CONFIG_INICIAL = {
  comision_bps: 300,
  plazo_revision_seg: 3 * 24 * 60 * 60,
  comision_max_bps: 1_000,
} as const;

/** Convierte "25.5" USDC a unidades del token ("255000000"). */
export function usdcAUnidades(usdc: string): string {
  const limpio = usdc.trim();
  if (!/^\d+(\.\d{1,7})?$/.test(limpio)) {
    throw new Error(`Monto inválido: "${usdc}" (usa números con hasta 7 decimales)`);
  }
  const [entero, decimales = ''] = limpio.split('.');
  const unidades = BigInt(entero) * 10n ** BigInt(DECIMALES_TOKEN) + BigInt(decimales.padEnd(DECIMALES_TOKEN, '0'));
  return unidades.toString();
}

/** Convierte unidades del token a USDC legible ("255000000" -> "25.5"). */
export function unidadesAUsdc(unidades: string | bigint): string {
  const n = BigInt(unidades);
  const base = 10n ** BigInt(DECIMALES_TOKEN);
  const entero = n / base;
  const resto = (n % base).toString().padStart(DECIMALES_TOKEN, '0').replace(/0+$/, '');
  return resto ? `${entero}.${resto}` : entero.toString();
}

/** Quita los ceros de sobra de un monto que viene de la base de datos ("25.5000000" -> "25.5"). */
export function formatoUsdc(valor: string | number): string {
  const texto = String(valor);
  return texto.includes('.') ? texto.replace(/\.?0+$/, '') : texto;
}

/** Comisión que cobra el contrato (redondeada hacia abajo, igual que en Rust). */
export function comisionUnidades(montoUnidades: string, comisionBps: number): string {
  return ((BigInt(montoUnidades) * BigInt(comisionBps)) / 10_000n).toString();
}

/** Fecha a segundos Unix (lo que pide el contrato en `fecha_limite_entrega`). */
export function aSegundosUnix(fecha: Date | string): string {
  const ms = typeof fecha === 'string' ? Date.parse(fecha) : fecha.getTime();
  if (Number.isNaN(ms)) throw new Error('Fecha inválida');
  return Math.floor(ms / 1000).toString();
}

export type TipoArgumento = 'Address' | 'u64' | 'i128' | 'u32' | 'Parte' | 'BytesN<32>';

export interface ArgumentoContrato {
  nombre: string;
  tipo: TipoArgumento;
  valor: string;
  ayuda: string;
}

export interface ContextoArgumentos {
  /** `numero` del pedido en la app = `id` en el contrato. */
  numero: number;
  cliente: string;
  proveedor: string;
  montoUsdc: string;
  fechaLimite: Date | string | null;
  /** Dirección del usuario que hace la acción (para abrir_disputa). */
  quien?: string;
  /** Dirección del árbitro (admin del contrato), para resolver. */
  arbitro?: string;
  aFavorDe?: Parte;
}

/** Acciones de la app que son llamadas al contrato (se hacen en Stellar Lab). */
export type AccionContrato = Exclude<AccionPedido, 'aceptar' | 'cancelar'>;

export const FUNCION_CONTRATO: Record<AccionContrato, string> = {
  crear_pedido: 'crear_pedido',
  marcar_entregado: 'marcar_entregado',
  liberar: 'liberar',
  rechazar: 'rechazar',
  abrir_disputa: 'abrir_disputa',
  resolver: 'resolver',
  reembolsar_por_vencimiento: 'reembolsar_por_vencimiento',
  cobrar_por_vencimiento: 'cobrar_por_vencimiento',
};

export function esAccionContrato(accion: AccionPedido): accion is AccionContrato {
  return accion in FUNCION_CONTRATO;
}

const id = (c: ContextoArgumentos): ArgumentoContrato => ({
  nombre: 'id',
  tipo: 'u64',
  valor: String(c.numero),
  ayuda: 'Número del pedido en WorkVille',
});

/** Argumentos exactos que hay que escribir en Stellar Lab para cada acción. */
export function argumentosContrato(accion: AccionContrato, c: ContextoArgumentos): ArgumentoContrato[] {
  const cliente: ArgumentoContrato = { nombre: 'cliente', tipo: 'Address', valor: c.cliente, ayuda: 'Wallet del cliente' };
  const proveedor: ArgumentoContrato = { nombre: 'proveedor', tipo: 'Address', valor: c.proveedor, ayuda: 'Wallet del proveedor' };
  switch (accion) {
    case 'crear_pedido': {
      if (!c.fechaLimite) throw new Error('El pedido no tiene fecha límite');
      return [
        cliente,
        proveedor,
        id(c),
        {
          nombre: 'monto',
          tipo: 'i128',
          valor: usdcAUnidades(c.montoUsdc),
          ayuda: `${c.montoUsdc} USDC en unidades del token (7 decimales)`,
        },
        {
          nombre: 'fecha_limite_entrega',
          tipo: 'u64',
          valor: aSegundosUnix(c.fechaLimite),
          ayuda: `Fecha límite en segundos Unix (${new Date(c.fechaLimite).toISOString()})`,
        },
      ];
    }
    case 'marcar_entregado':
    case 'rechazar':
    case 'cobrar_por_vencimiento':
      return [proveedor, id(c)];
    case 'liberar':
    case 'reembolsar_por_vencimiento':
      return [cliente, id(c)];
    case 'abrir_disputa':
      if (!c.quien) throw new Error('Falta quién abre la disputa');
      return [{ nombre: 'quien', tipo: 'Address', valor: c.quien, ayuda: 'Tu wallet (cliente o proveedor)' }, id(c)];
    case 'resolver':
      if (!c.arbitro || !c.aFavorDe) throw new Error('Falta el árbitro o a favor de quién se resuelve');
      return [
        { nombre: 'admin', tipo: 'Address', valor: c.arbitro, ayuda: 'Wallet del árbitro (admin del contrato)' },
        id(c),
        { nombre: 'a_favor_de', tipo: 'Parte', valor: c.aFavorDe, ayuda: 'Elige Cliente o Proveedor en el Lab' },
      ];
  }
}

/** Errores del contrato (`Error` en lib.rs) con su explicación. */
export const ERRORES_CONTRATO: Record<number, { nombre: string; explicacion: string }> = {
  1: { nombre: 'PedidoYaExiste', explicacion: 'Ese número de pedido ya se usó en el contrato.' },
  2: { nombre: 'PedidoNoExiste', explicacion: 'El contrato no tiene un pedido con ese número.' },
  3: { nombre: 'EstadoInvalido', explicacion: 'El pedido no está en el estado que permite esta acción.' },
  4: { nombre: 'MontoInvalido', explicacion: 'El monto debe ser mayor que cero.' },
  5: { nombre: 'FechaInvalida', explicacion: 'La fecha límite debe estar en el futuro.' },
  6: { nombre: 'NoAutorizado', explicacion: 'Esa wallet no puede hacer esta acción en este pedido.' },
  7: { nombre: 'PlazoNoVencido', explicacion: 'Todavía no vence el plazo.' },
  8: { nombre: 'PlazoVencido', explicacion: 'La fecha límite de entrega ya pasó.' },
  9: { nombre: 'ComisionInvalida', explicacion: 'La comisión no puede pasar del 10% (1000 bps).' },
  10: { nombre: 'MismaCuenta', explicacion: 'El cliente y el proveedor no pueden ser la misma wallet.' },
};

/** Argumentos del constructor, para el despliegue en Stellar Lab. */
export function argumentosConstructor(p: {
  admin: string;
  token: string;
  tesoreria: string;
}): ArgumentoContrato[] {
  return [
    { nombre: 'admin', tipo: 'Address', valor: p.admin, ayuda: 'Árbitro y administrador' },
    { nombre: 'token', tipo: 'Address', valor: p.token, ayuda: 'Contrato del USDC de prueba (C…)' },
    { nombre: 'comision_bps', tipo: 'u32', valor: String(CONFIG_INICIAL.comision_bps), ayuda: '3% = 300 puntos base' },
    { nombre: 'tesoreria', tipo: 'Address', valor: p.tesoreria, ayuda: 'Cuenta que recibe la comisión' },
    {
      nombre: 'plazo_revision_seg',
      tipo: 'u64',
      valor: String(CONFIG_INICIAL.plazo_revision_seg),
      ayuda: '3 días en segundos',
    },
  ];
}
