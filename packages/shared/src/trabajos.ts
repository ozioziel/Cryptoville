// «Mis trabajos»: los pedidos terminados de una persona (privado) y los que elige mostrar en su perfil
// público («Trabajos verificados»). Lo público no lleva el monto ni el detalle del pedido.
import type { EstadoPedido } from './types/index.js';

/** Pedidos terminados con el trabajo hecho: aparecen en «Mis trabajos» (los mismos que permiten reseña). */
export const ESTADOS_TRABAJO_TERMINADO: readonly EstadoPedido[] = ['liberado', 'resuelto', 'finalizado'];

/**
 * Pedidos que se pueden mostrar como «Trabajos verificados»: el dinero llegó al proveedor.
 * Una disputa resuelta (`resuelto`) queda fuera: el pago pudo volver al cliente.
 */
export const ESTADOS_TRABAJO_PUBLICABLE: readonly EstadoPedido[] = ['liberado', 'finalizado'];

export function esTrabajoTerminado(estado: EstadoPedido): boolean {
  return ESTADOS_TRABAJO_TERMINADO.includes(estado);
}

export function esTrabajoPublicable(estado: EstadoPedido): boolean {
  return ESTADOS_TRABAJO_PUBLICABLE.includes(estado);
}

export type RolTrabajo = 'proveedor' | 'cliente';

/** Una fila de `trabajos_publicos` (lectura pública por RLS). */
export interface TrabajoPublico {
  id: string;
  usuario_id: string;
  pedido_id: string;
  rol: RolTrabajo;
  /** Título del servicio (no el detalle del pedido, que es privado). */
  titulo: string;
  terminado_en: string;
  /** Transacción que cerró el pedido, verificada en la red. null en los pedidos de ejemplo. */
  tx_hash: string | null;
  orden: number;
  creado_en: string;
}
