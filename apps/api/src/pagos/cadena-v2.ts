// Funciones puras para el contrato v2 (sin red): argumentos, lectura del estado y verificación.
// Se prueban sin conexión en test/cadena-v2.spec.ts.
import { FASE_DE_CONTRATO, type EstadoFase, type FuncionV2 } from '@cryptoville/shared';
import type { xdr } from '@stellar/stellar-sdk';
import { arg, mismoValor, variante, type Invocacion } from '../stellar/cadena';

/** Plan de fases tal como lo recibe `crear_pedido` del contrato v2. */
export interface FaseEnContrato {
  monto: bigint;
  fechaLimiteSeg: bigint;
}

export function argumentosCrearV2(cliente: string, proveedor: string, numero: bigint, fases: readonly FaseEnContrato[]): xdr.ScVal[] {
  return [
    arg.direccion(cliente),
    arg.direccion(proveedor),
    arg.u64(numero),
    arg.lista(fases.map((f) => arg.estructura({ monto: arg.i128(f.monto), fecha_limite: arg.u64(f.fechaLimiteSeg) }))),
  ];
}

/** Posición del número de pedido en los argumentos de cada función del v2. */
export const POSICION_ID: Record<FuncionV2, number> = {
  crear_pedido: 2,
  pagar_directo: 2,
  entregar_fase: 1,
  liberar_fase: 1,
  pedir_cambios: 1,
  rechazar: 1,
  abrir_disputa: 1,
  resolver: 1,
  resolver_por_vencimiento: 0,
  cobrar_por_vencimiento: 0,
  reembolsar_por_vencimiento: 0,
  extender: 0,
};

/** Posición de la fase (las funciones que la tienen). */
export const POSICION_FASE: Partial<Record<FuncionV2, number>> = {
  entregar_fase: 2,
  liberar_fase: 2,
  pedir_cambios: 2,
  abrir_disputa: 2,
  resolver: 2,
  resolver_por_vencimiento: 1,
  cobrar_por_vencimiento: 1,
  reembolsar_por_vencimiento: 1,
};

export interface ContextoVerificacionV2 {
  contrato: string;
  numero: bigint | number | string;
  /** Wallets válidas del cliente y del proveedor (para crear el pedido o pagar directo). */
  walletsCliente: string[];
  walletsProveedor: string[];
  /** Plan guardado en la app (para comparar con el de la transacción). */
  plan?: readonly FaseEnContrato[];
  /** Monto acordado (pago directo), en unidades del token. */
  monto?: bigint;
}

/**
 * Comprueba que una llamada al contrato v2 sea de este pedido. Devuelve el error en español o null.
 * El resto (quién puede hacer qué y cuándo) lo exige el contrato: si la transacción salió bien, se cumplió.
 */
export function verificarInvocacionV2(inv: Invocacion, funcion: FuncionV2, c: ContextoVerificacionV2): string | null {
  if (inv.contrato !== c.contrato) return 'es de otro contrato';
  if (inv.funcion !== funcion) return `llama a "${inv.funcion}" y este paso es "${funcion}"`;
  if (!mismoValor(inv.args[POSICION_ID[funcion]], c.numero)) return 'el número de pedido no coincide';
  if (funcion === 'crear_pedido' || funcion === 'pagar_directo') {
    const [cliente, proveedor] = inv.args;
    if (typeof cliente !== 'string' || !c.walletsCliente.includes(cliente)) return 'el cliente no es una wallet de quien hizo el pedido';
    if (typeof proveedor !== 'string' || !c.walletsProveedor.includes(proveedor)) return 'el proveedor no es la wallet del proveedor';
  }
  if (funcion === 'pagar_directo' && c.monto !== undefined && !mismoValor(inv.args[3], c.monto)) return 'el monto no coincide con el acordado';
  if (funcion === 'crear_pedido' && c.plan) {
    const fases = inv.args[3];
    if (!Array.isArray(fases) || fases.length !== c.plan.length) return 'el plan de fases no coincide';
    for (const [i, f] of c.plan.entries()) {
      const enTx = fases[i] as { monto?: unknown; fecha_limite?: unknown };
      if (!mismoValor(enTx.monto, f.monto) || !mismoValor(enTx.fecha_limite, f.fechaLimiteSeg)) return `la fase ${i + 1} no coincide con el plan acordado`;
    }
  }
  return null;
}

/** Una fase como la devuelve `pedido(id)` del contrato (leída con scValToNative). */
interface FaseLeida {
  monto: bigint;
  fecha_limite: bigint;
  estado: unknown;
  entregada_en: bigint;
  huella: Uint8Array;
  cambios: number;
  disputa_desde: bigint;
  ganador: unknown;
}

export interface EstadoFaseApp {
  estado: EstadoFase;
  fecha_limite: Date;
  entregada_en: Date | null;
  huella: string | null;
  cambios: number;
  disputa_desde: Date | null;
  ganador: 'Cliente' | 'Proveedor' | 'Mitad' | null;
}

const fecha = (seg: bigint | number) => (BigInt(seg) > 0n ? new Date(Number(seg) * 1000) : null);

/** Convierte las fases del contrato al formato de la tabla `fases`. */
export function fasesDesdeContrato(pedido: { fases: FaseLeida[] }): EstadoFaseApp[] {
  return pedido.fases.map((f) => {
    const huella = Buffer.from(f.huella ?? []).toString('hex');
    const ganador = variante(f.ganador);
    return {
      estado: FASE_DE_CONTRATO[variante(f.estado) ?? ''] ?? 'en_curso',
      fecha_limite: fecha(f.fecha_limite) ?? new Date(0),
      entregada_en: fecha(f.entregada_en),
      huella: /^0+$/.test(huella) || !huella ? null : huella,
      cambios: Number(f.cambios),
      disputa_desde: fecha(f.disputa_desde),
      ganador: ganador === 'Cliente' || ganador === 'Proveedor' || ganador === 'Mitad' ? ganador : null,
    };
  });
}
