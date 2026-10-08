// Estados del pedido y transiciones permitidas. Única fuente de verdad para la web y la API.
import type { AccionPedido, AccionRegistrada, Actor, EstadoPedido } from './types/index.js';

export type RolEnPedido = 'cliente' | 'proveedor' | 'arbitro';

export interface DefinicionAccion {
  accion: AccionPedido;
  etiqueta: string;
  desde: readonly EstadoPedido[];
  hacia: EstadoPedido;
  actor: Actor;
  /** true si la acción es una llamada al contrato que se hace en Stellar Lab. */
  enCadena: boolean;
  ayuda: string;
}

export const ACCIONES: Record<AccionPedido, DefinicionAccion> = {
  aceptar: {
    accion: 'aceptar',
    etiqueta: 'Aceptar pedido',
    desde: ['solicitado'],
    hacia: 'aceptado',
    actor: 'proveedor',
    enCadena: false,
    ayuda: 'Confirmas el precio y la fecha límite de entrega.',
  },
  cancelar: {
    accion: 'cancelar',
    etiqueta: 'Cancelar pedido',
    desde: ['solicitado', 'aceptado'],
    hacia: 'cancelado',
    actor: 'participante',
    enCadena: false,
    ayuda: 'Todavía no hay dinero en garantía, así que se cancela sin pasos en Stellar.',
  },
  crear_pedido: {
    accion: 'crear_pedido',
    etiqueta: 'Pagar en garantía',
    desde: ['aceptado'],
    hacia: 'pagado',
    actor: 'cliente',
    enCadena: true,
    ayuda: 'Depositas el pago en el contrato. El proveedor no lo recibe hasta que liberes.',
  },
  marcar_entregado: {
    accion: 'marcar_entregado',
    etiqueta: 'Marcar como entregado',
    desde: ['pagado'],
    hacia: 'entregado',
    actor: 'proveedor',
    enCadena: true,
    ayuda: 'Avisas en el contrato que entregaste. Debe ser antes de la fecha límite.',
  },
  liberar: {
    accion: 'liberar',
    etiqueta: 'Liberar el pago',
    desde: ['pagado', 'entregado'],
    hacia: 'liberado',
    actor: 'cliente',
    enCadena: true,
    ayuda: 'Confirmas que recibiste el trabajo: el proveedor cobra (menos la comisión).',
  },
  rechazar: {
    accion: 'rechazar',
    etiqueta: 'Devolver el dinero',
    desde: ['pagado', 'entregado'],
    hacia: 'reembolsado',
    actor: 'proveedor',
    enCadena: true,
    ayuda: 'No vas a hacer el trabajo: el contrato devuelve todo al cliente.',
  },
  abrir_disputa: {
    accion: 'abrir_disputa',
    etiqueta: 'Abrir disputa',
    desde: ['pagado', 'entregado'],
    hacia: 'en_disputa',
    actor: 'participante',
    enCadena: true,
    ayuda: 'El dinero queda congelado hasta que el equipo de Cryptoville decida.',
  },
  resolver: {
    accion: 'resolver',
    etiqueta: 'Resolver disputa',
    desde: ['en_disputa'],
    hacia: 'resuelto',
    actor: 'arbitro',
    enCadena: true,
    ayuda: 'El árbitro envía el dinero a quien tenga la razón.',
  },
  reembolsar_por_vencimiento: {
    accion: 'reembolsar_por_vencimiento',
    etiqueta: 'Recuperar mi dinero (vencido)',
    desde: ['pagado'],
    hacia: 'reembolsado',
    actor: 'cliente',
    enCadena: true,
    ayuda: 'Pasó la fecha límite y no hubo entrega: recuperas todo.',
  },
  cobrar_por_vencimiento: {
    accion: 'cobrar_por_vencimiento',
    etiqueta: 'Cobrar (plazo de revisión vencido)',
    desde: ['entregado'],
    hacia: 'liberado',
    actor: 'proveedor',
    enCadena: true,
    ayuda: 'Entregaste y el cliente no respondió en el plazo de revisión: cobras.',
  },
};

export const ETIQUETA_ESTADO: Record<EstadoPedido, string> = {
  solicitado: 'Solicitado',
  aceptado: 'Aceptado: falta el pago',
  cancelado: 'Cancelado',
  pagado: 'Pagado en garantía',
  entregado: 'Entregado',
  en_disputa: 'En disputa',
  liberado: 'Pago liberado',
  reembolsado: 'Reembolsado',
  resuelto: 'Disputa resuelta',
  finalizado: 'Terminado',
};

export const ESTADOS_FINALES: readonly EstadoPedido[] = [
  'cancelado',
  'liberado',
  'reembolsado',
  'resuelto',
  'finalizado',
];

/** Nombre de cualquier paso del historial (los del contrato v1, los de las fases y el pago directo). */
export const ETIQUETA_ACCION: Record<AccionRegistrada, string> = {
  aceptar: 'Aceptar pedido',
  cancelar: 'Cancelar pedido',
  crear_pedido: 'Pagar en garantía',
  marcar_entregado: 'Marcar como entregado',
  liberar: 'Liberar el pago',
  rechazar: 'Devolver el dinero',
  abrir_disputa: 'Abrir disputa',
  resolver: 'Resolver disputa',
  reembolsar_por_vencimiento: 'Recuperar mi dinero (vencido)',
  cobrar_por_vencimiento: 'Cobrar (plazo de revisión vencido)',
  aceptar_plan: 'Aceptar el plan de fases',
  pagar_directo: 'Pagar directo',
  confirmar_recibido: 'Confirmar que recibí el trabajo',
  entregar_fase: 'Entregar la fase',
  liberar_fase: 'Liberar el pago de la fase',
  pedir_cambios: 'Pedir cambios',
  resolver_por_vencimiento: 'Repartir 50/50 (disputa vencida)',
};

export function esFinal(estado: EstadoPedido): boolean {
  return ESTADOS_FINALES.includes(estado);
}

/**
 * Solo los pedidos cerrados con el dinero movido permiten reseña:
 * liberado o resuelto (contrato v1) y finalizado (fases del contrato v2 o pago directo).
 */
export function permiteResena(estado: EstadoPedido): boolean {
  return estado === 'liberado' || estado === 'resuelto' || estado === 'finalizado';
}

function actorCoincide(actor: Actor, rol: RolEnPedido): boolean {
  if (actor === 'participante') return rol === 'cliente' || rol === 'proveedor';
  return actor === rol;
}

/** ¿Puede `rol` hacer `accion` cuando el pedido está en `estado`? */
export function puedeHacer(accion: AccionPedido, estado: EstadoPedido, rol: RolEnPedido): boolean {
  const def = ACCIONES[accion];
  return def.desde.includes(estado) && actorCoincide(def.actor, rol);
}

/** Estado al que llega el pedido tras `accion`, o error si no está permitida desde `estado`. */
export function siguienteEstado(estado: EstadoPedido, accion: AccionPedido): EstadoPedido {
  const def = ACCIONES[accion];
  if (!def.desde.includes(estado)) {
    throw new Error(`La acción "${accion}" no se puede hacer en un pedido "${estado}"`);
  }
  return def.hacia;
}

/** Acciones que `rol` puede hacer ahora mismo sobre un pedido en `estado`. */
export function accionesDisponibles(estado: EstadoPedido, rol: RolEnPedido): DefinicionAccion[] {
  return Object.values(ACCIONES).filter((d) => puedeHacer(d.accion, estado, rol));
}

/**
 * Un paso hecho en Stellar Lab lo verifica alguien distinto de quien lo declaró:
 * la otra parte del pedido o el árbitro.
 */
export function puedeVerificar(
  declaradoPor: string,
  usuarioId: string,
  rol: RolEnPedido | null,
): boolean {
  return rol !== null && declaradoPor !== usuarioId;
}
