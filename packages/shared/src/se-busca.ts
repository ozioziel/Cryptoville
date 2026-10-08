// «Se busca»: el otro lado del mercado.
//
// - Quien necesita algo publica un «Se busca» (título, detalle, villa, categoría, presupuesto y fecha).
// - Los proveedores con local le mandan propuestas (precio, días de entrega y un mensaje).
// - Cuando quien publicó elige una propuesta, nace un pedido normal ya aceptado:
//   desde ahí sigue el mismo camino de siempre (pago en garantía en Stellar Lab, entrega, disputas, reseñas).
import type { PlanFase } from './pagos.js';
import type { Barrio } from './types/index.js';

export type EstadoBusqueda = 'abierta' | 'asignada' | 'cancelada';
export type EstadoPropuesta = 'enviada' | 'aceptada' | 'rechazada' | 'retirada';

export interface Busqueda {
  id: string;
  autor_id: string;
  titulo: string;
  descripcion: string;
  /** Villa (el campo se llama barrio, como en los locales). */
  barrio: Barrio;
  categoria: string;
  /** Lugar de su casa en el modo «Quiero trabajar» de la villa (no cambia mientras siga abierto). */
  lote: number;
  /** Presupuesto en USDC, como texto ("80" o "25.5"). */
  presupuesto_usdc: string;
  /** Para cuándo lo necesita (ISO). */
  fecha_limite: string;
  estado: EstadoBusqueda;
  /** Propuestas vigentes (enviadas o aceptada). */
  total_propuestas: number;
  /** Pedido que nació de la propuesta elegida. */
  pedido_id: string | null;
  creado_en: string;
  actualizado_en: string;
}

export interface Propuesta {
  id: string;
  busqueda_id: string;
  proveedor_id: string;
  monto_usdc: string;
  dias_entrega: number;
  mensaje: string;
  estado: EstadoPropuesta;
  /** Local desde el que se propone (v2: una persona puede tener varios). */
  local_id: string | null;
  /** Plan de fases propuesto (si quien publicó elige pagar por etapas, se usa tal cual). */
  plan: PlanFase[] | null;
  /** Proyectos del portafolio que se adjuntan (ids). */
  proyectos: string[];
  creado_en: string;
  actualizado_en: string;
}

export const ETIQUETA_ESTADO_BUSQUEDA: Record<EstadoBusqueda, string> = {
  abierta: 'Abierto',
  asignada: 'Proveedor elegido',
  cancelada: 'Cerrado',
};

export const ETIQUETA_ESTADO_PROPUESTA: Record<EstadoPropuesta, string> = {
  enviada: 'Enviada',
  aceptada: 'Elegida',
  rechazada: 'No elegida',
  retirada: 'Retirada',
};

/** Límites de los textos y plazos (los aplica la API y también los CHECK de la base). */
export const LIMITES_SE_BUSCA = {
  tituloMin: 3,
  tituloMax: 60,
  detalleMin: 10,
  detalleMax: 1000,
  mensajeMin: 10,
  mensajeMax: 1000,
  diasMax: 90,
} as const;

/** ¿Todavía se le pueden mandar propuestas? (abierto y sin vencer). */
export function aceptaPropuestas(b: Pick<Busqueda, 'estado' | 'fecha_limite'>, ahora = Date.now()): boolean {
  return b.estado === 'abierta' && Date.parse(b.fecha_limite) > ahora;
}

/** Días que faltan hasta la fecha límite, para sugerir el plazo de una propuesta (entre 1 y 90). */
export function diasHasta(fecha: string, ahora = Date.now()): number {
  const dias = Math.ceil((Date.parse(fecha) - ahora) / 86_400_000);
  return Math.max(1, Math.min(LIMITES_SE_BUSCA.diasMax, Number.isFinite(dias) ? dias : 1));
}
