// Qué puede hacer cada persona en un pedido y qué tiene que escribir en Stellar Lab.
import {
  accionesDisponibles,
  argumentosContrato,
  esAccionContrato,
  type AccionContrato,
  type ArgumentoContrato,
  type DefinicionAccion,
  type Parte,
  type RolEnPedido,
} from '@cryptoville/shared';
import type { PedidoDetalle } from '../orders/datos';

export function rolEnPedido(p: Pick<PedidoDetalle, 'cliente_id' | 'proveedor_id'>, usuarioId: string, esArbitro: boolean): RolEnPedido | null {
  if (p.cliente_id === usuarioId) return 'cliente';
  if (p.proveedor_id === usuarioId) return 'proveedor';
  return esArbitro ? 'arbitro' : null;
}

export interface AccionPosible {
  def: DefinicionAccion;
  /** Si todavía no se puede (por ejemplo, un plazo que no vence), el motivo. */
  bloqueada: string | null;
}

/** Acciones disponibles para el rol, con los bloqueos de tiempo que también aplica el contrato. */
export function accionesPara(p: PedidoDetalle, rol: RolEnPedido, plazoRevisionSeg: number, ahora = Date.now()): AccionPosible[] {
  if (p.es_ejemplo) return [];
  const limite = p.fecha_limite ? Date.parse(p.fecha_limite) : null;
  const entrega = [...p.pasos].reverse().find((x) => x.accion === 'marcar_entregado');
  const venceRevision = entrega ? Date.parse(entrega.creado_en) + plazoRevisionSeg * 1000 : null;

  return accionesDisponibles(p.estado, rol)
    .map((def): AccionPosible => {
      let bloqueada: string | null = null;
      if (def.accion === 'reembolsar_por_vencimiento' && limite !== null && ahora <= limite) {
        bloqueada = `Disponible después del ${new Date(limite).toLocaleString('es')}`;
      }
      if (def.accion === 'cobrar_por_vencimiento' && venceRevision !== null && ahora <= venceRevision) {
        bloqueada = `Disponible después del ${new Date(venceRevision).toLocaleString('es')}`;
      }
      if (def.accion === 'marcar_entregado' && limite !== null && ahora > limite) {
        bloqueada = 'La fecha límite de entrega ya pasó';
      }
      if (def.accion === 'crear_pedido' && limite !== null && ahora >= limite) {
        bloqueada = 'La fecha límite ya pasó: cancela y vuelve a pedir el servicio';
      }
      return { def, bloqueada };
    })
    // Las acciones por vencimiento solo se muestran cuando ya aplican (para no confundir).
    .filter((a) => !(a.bloqueada && (a.def.accion === 'reembolsar_por_vencimiento' || a.def.accion === 'cobrar_por_vencimiento')))
    // Primero lo que hace avanzar el pedido; al final cancelar, devolver y disputar.
    .sort((a, b) => (SECUNDARIAS.includes(a.def.accion) ? 1 : 0) - (SECUNDARIAS.includes(b.def.accion) ? 1 : 0));
}

const SECUNDARIAS: string[] = ['cancelar', 'rechazar', 'abrir_disputa'];

/** Argumentos que hay que escribir en el Lab para `accion`. */
export function argumentosPara(
  p: PedidoDetalle,
  accion: AccionContrato,
  quien: string,
  arbitro: string | null,
  aFavorDe?: Parte,
): ArgumentoContrato[] {
  return argumentosContrato(accion, {
    numero: p.numero,
    cliente: p.cliente.direccion,
    proveedor: p.proveedor.direccion,
    montoUsdc: p.monto_usdc,
    fechaLimite: p.fecha_limite,
    quien,
    arbitro: arbitro ?? quien,
    aFavorDe,
  });
}

export { esAccionContrato };
