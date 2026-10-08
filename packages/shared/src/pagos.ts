// Métodos de pago y pedidos por fases (contrato v2). Única fuente de verdad para la web y la API,
// igual que order-states.ts lo es para los pedidos del contrato v1.
//
// - Pagar directo: sin garantía; el contrato v2 reparte el pago en el momento. No hay disputa.
// - Pagar con garantía: el contrato guarda el dinero; es un plan de UNA fase (o el contrato v1).
// - Por etapas: un plan de 2 a 5 fases acordado ANTES de pagar; cada fase se paga al aprobar su prueba.
import type { Reglas } from './reglas.js';
import type { EstadoPedido } from './types/index.js';

export type MetodoPago = 'garantia' | 'directo' | 'etapas';
export const METODOS_PAGO: readonly MetodoPago[] = ['directo', 'garantia', 'etapas'];

/** Contrato donde vive el pedido: v1 (una sola entrega) o v2 (fases y pago directo). */
export type ContratoPedido = 'v1' | 'v2';

export const NOMBRE_METODO: Record<MetodoPago, string> = {
  directo: 'Pagar directo',
  garantia: 'Pagar con garantía',
  etapas: 'Por etapas',
};

/** Comisión de cada método (de packages/shared/src/reglas.ts). */
export function comisionDeMetodo(metodo: MetodoPago, reglas: Reglas): number {
  if (metodo === 'directo') return reglas.comisiones.directoBps;
  if (metodo === 'etapas') return reglas.comisiones.etapasBps;
  return reglas.comisiones.garantiaBps;
}

// ---------------------------------------------------------------
// Fases
// ---------------------------------------------------------------

/** Qué prueba hay que subir en una fase. */
export type TipoPrueba = 'archivo' | 'enlace' | 'video';
export const TIPOS_PRUEBA: readonly TipoPrueba[] = ['archivo', 'enlace', 'video'];
export const NOMBRE_PRUEBA: Record<TipoPrueba, string> = { archivo: 'Archivo', enlace: 'Enlace', video: 'Video' };

/**
 * Estado de una fase. `propuesta`: el plan todavía no se pagó. Los demás reflejan el contrato v2.
 */
export type EstadoFase = 'propuesta' | 'en_curso' | 'entregada' | 'liberada' | 'reembolsada' | 'en_disputa' | 'resuelta';

export const ETIQUETA_FASE: Record<EstadoFase, string> = {
  propuesta: 'Pendiente de pago',
  en_curso: 'En curso',
  entregada: 'En revisión',
  liberada: 'Pagada',
  reembolsada: 'Reembolsada',
  en_disputa: 'En disputa',
  resuelta: 'Disputa resuelta',
};

export const FASES_FINALES: readonly EstadoFase[] = ['liberada', 'reembolsada', 'resuelta'];

/** Una fase del plan, como la arma el proveedor. */
export interface PlanFase {
  descripcion: string;
  porcentaje_proyecto: number;
  porcentaje_pago: number;
  /** Fecha límite de la fase (ISO). */
  fecha_limite: string;
  /** Pruebas que hay que subir para entregar la fase (vacío = cualquier prueba). */
  pruebas: TipoPrueba[];
}

/** Una fase guardada en la base (lo que lee la web). */
export interface Fase extends PlanFase {
  id: string;
  pedido_id: string;
  numero: number;
  monto_usdc: string;
  estado: EstadoFase;
  entregada_en: string | null;
  huella: string | null;
  cambios: number;
  disputa_desde: string | null;
  motivo_disputa: string | null;
  decision: string | null;
  ganador: 'Cliente' | 'Proveedor' | 'Mitad' | null;
}

/** Revisa un plan de fases. Devuelve el error en español, o null si está bien. */
export function validarPlan(plan: readonly PlanFase[], reglas: Reglas, ahora = Date.now()): string | null {
  const { min, max } = reglas.fases;
  if (plan.length < min || plan.length > max) return `El plan tiene que tener entre ${min} y ${max} fases`;
  let proyecto = 0;
  let pago = 0;
  let anterior = 0;
  for (const [i, f] of plan.entries()) {
    const n = i + 1;
    if (!f.descripcion?.trim() || f.descripcion.trim().length < 3) return `Cuenta qué incluye la fase ${n}`;
    if (f.descripcion.length > 300) return `La descripción de la fase ${n} es muy larga (hasta 300 caracteres)`;
    for (const [valor, nombre] of [
      [f.porcentaje_proyecto, 'del proyecto'],
      [f.porcentaje_pago, 'del pago'],
    ] as const) {
      if (!Number.isInteger(valor) || valor < 1 || valor > 100) return `El porcentaje ${nombre} de la fase ${n} va de 1 a 100`;
    }
    proyecto += f.porcentaje_proyecto;
    pago += f.porcentaje_pago;
    const fecha = Date.parse(f.fecha_limite);
    if (Number.isNaN(fecha)) return `La fecha de la fase ${n} no es válida`;
    if (fecha <= ahora + 3_600_000) return `La fecha de la fase ${n} tiene que ser al menos en 1 hora`;
    if (fecha < anterior) return `Las fechas tienen que ir en orden (la fase ${n} vence antes que la anterior)`;
    anterior = fecha;
    if (!Array.isArray(f.pruebas) || f.pruebas.some((p) => !TIPOS_PRUEBA.includes(p))) return `Las pruebas de la fase ${n} no son válidas`;
  }
  if (proyecto !== 100) return `Los porcentajes del proyecto suman ${proyecto}%: tienen que sumar 100%`;
  if (pago !== 100) return `Los porcentajes del pago suman ${pago}%: tienen que sumar 100%`;
  return null;
}

/**
 * Monto de cada fase en unidades del token: se redondea hacia abajo y lo que sobra va a la última fase,
 * así la suma es exactamente el total.
 */
export function montosDeFases(totalUnidades: bigint, porcentajesPago: readonly number[]): bigint[] {
  const montos = porcentajesPago.map((p) => (totalUnidades * BigInt(p)) / 100n);
  const resto = totalUnidades - montos.reduce((a, b) => a + b, 0n);
  if (montos.length) montos[montos.length - 1] += resto;
  return montos;
}

/**
 * Estado del pedido a partir de sus fases (pedidos del contrato v2), con los nombres de siempre:
 * - alguna en disputa → en_disputa;
 * - todas cerradas → liberado (todas pagadas), reembolsado (todas devueltas) o finalizado (mezcla);
 * - si no, entregado (la fase actual está en revisión) o pagado.
 */
export function estadoPedidoDesdeFases(fases: readonly { estado: EstadoFase }[]): EstadoPedido {
  if (!fases.length || fases.some((f) => f.estado === 'propuesta')) return 'aceptado';
  if (fases.some((f) => f.estado === 'en_disputa')) return 'en_disputa';
  if (fases.every((f) => FASES_FINALES.includes(f.estado))) {
    if (fases.every((f) => f.estado === 'liberada')) return 'liberado';
    if (fases.every((f) => f.estado === 'reembolsada')) return 'reembolsado';
    return 'finalizado';
  }
  const actual = fases.find((f) => !FASES_FINALES.includes(f.estado));
  return actual?.estado === 'entregada' ? 'entregado' : 'pagado';
}

/** Estado de la fase en el contrato v2 → estado en la app. */
export const FASE_DE_CONTRATO: Record<string, EstadoFase> = {
  EnCurso: 'en_curso',
  Entregada: 'entregada',
  Liberada: 'liberada',
  Reembolsada: 'reembolsada',
  EnDisputa: 'en_disputa',
  Resuelta: 'resuelta',
};

// ---------------------------------------------------------------
// Acciones sobre una fase (la API las exige y la web decide qué botones mostrar)
// ---------------------------------------------------------------

export type AccionFase =
  | 'entregar_fase'
  | 'liberar_fase'
  | 'pedir_cambios'
  | 'abrir_disputa'
  | 'resolver'
  | 'cobrar_por_vencimiento'
  | 'reembolsar_por_vencimiento'
  | 'resolver_por_vencimiento';

export interface DefinicionAccionFase {
  accion: AccionFase;
  etiqueta: string;
  /** cliente, proveedor, participante (cualquiera de los dos), arbitro o cualquiera (vencimientos). */
  actor: 'cliente' | 'proveedor' | 'participante' | 'arbitro' | 'cualquiera';
  desde: readonly EstadoFase[];
  ayuda: string;
}

export const ACCIONES_FASE: Record<AccionFase, DefinicionAccionFase> = {
  entregar_fase: {
    accion: 'entregar_fase',
    etiqueta: 'Entregar esta fase',
    actor: 'proveedor',
    desde: ['en_curso'],
    ayuda: 'Sube las pruebas de la fase y entrégala. La huella de tus pruebas queda en el contrato.',
  },
  liberar_fase: {
    accion: 'liberar_fase',
    etiqueta: 'Liberar el pago de esta fase',
    actor: 'cliente',
    desde: ['en_curso', 'entregada'],
    ayuda: 'Confirmas esta fase: el proveedor cobra su parte (menos la comisión).',
  },
  pedir_cambios: {
    accion: 'pedir_cambios',
    etiqueta: 'Pedir cambios',
    actor: 'cliente',
    desde: ['entregada'],
    ayuda: 'La fase vuelve al proveedor y su fecha límite se corre por el plazo de revisión.',
  },
  abrir_disputa: {
    accion: 'abrir_disputa',
    etiqueta: 'Abrir disputa por esta fase',
    actor: 'participante',
    desde: ['en_curso', 'entregada'],
    ayuda: 'El dinero de esta fase queda congelado y las siguientes esperan hasta que decida el árbitro.',
  },
  resolver: {
    accion: 'resolver',
    etiqueta: 'Resolver la disputa',
    actor: 'arbitro',
    desde: ['en_disputa'],
    ayuda: 'A favor del cliente, del proveedor o 50/50. El dinero nunca queda en manos del árbitro.',
  },
  cobrar_por_vencimiento: {
    accion: 'cobrar_por_vencimiento',
    etiqueta: 'Cobrar (venció la revisión)',
    actor: 'cualquiera',
    desde: ['entregada'],
    ayuda: 'El cliente no respondió en el plazo de revisión: el proveedor cobra esta fase.',
  },
  reembolsar_por_vencimiento: {
    accion: 'reembolsar_por_vencimiento',
    etiqueta: 'Recuperar el dinero (venció la entrega)',
    actor: 'cualquiera',
    desde: ['en_curso'],
    ayuda: 'La fase venció sin entrega: el cliente recupera esta fase y las que faltan.',
  },
  resolver_por_vencimiento: {
    accion: 'resolver_por_vencimiento',
    etiqueta: 'Repartir 50/50 (venció la disputa)',
    actor: 'cualquiera',
    desde: ['en_disputa'],
    ayuda: 'El árbitro no decidió a tiempo: la fase se reparte mitad y mitad.',
  },
};

export type RolFase = 'cliente' | 'proveedor' | 'arbitro';

/** ¿Puede `rol` hacer `accion` en la fase `numero` (sin contar los plazos)? */
export function puedeHacerEnFase(accion: AccionFase, fases: readonly { estado: EstadoFase }[], numero: number, rol: RolFase | null): boolean {
  const def = ACCIONES_FASE[accion];
  const fase = fases[numero];
  if (!fase || !def.desde.includes(fase.estado)) return false;
  const actorOk =
    def.actor === 'cualquiera' ||
    (def.actor === 'participante' ? rol === 'cliente' || rol === 'proveedor' : def.actor === rol);
  if (!actorOk) return false;
  const anteriores = fases.slice(0, numero);
  // Las fases van en orden: para entregar, las anteriores ya tienen que estar entregadas o cerradas.
  if (accion === 'entregar_fase' && anteriores.some((f) => f.estado === 'en_curso' || f.estado === 'en_disputa')) return false;
  // Mientras una fase anterior está en disputa, las siguientes no se reembolsan por vencimiento.
  if (accion === 'reembolsar_por_vencimiento' && anteriores.some((f) => f.estado === 'en_disputa')) return false;
  return true;
}

/** ¿Ya venció el plazo que habilita una acción por vencimiento? */
export function vencioParaAccion(
  accion: AccionFase,
  fase: { fecha_limite: string; entregada_en: string | null; disputa_desde: string | null },
  plazos: { revisionSeg: number; disputaMaxSeg: number },
  ahora = Date.now(),
): boolean {
  if (accion === 'cobrar_por_vencimiento') return fase.entregada_en !== null && ahora > Date.parse(fase.entregada_en) + plazos.revisionSeg * 1000;
  if (accion === 'reembolsar_por_vencimiento') return ahora > Date.parse(fase.fecha_limite);
  if (accion === 'resolver_por_vencimiento') return fase.disputa_desde !== null && ahora > Date.parse(fase.disputa_desde) + plazos.disputaMaxSeg * 1000;
  return true;
}

/**
 * Huella de la entrega de una fase: SHA-256 de la lista de sus pruebas (tipo y huella de cada una, en orden).
 * Esta es la cadena que se resume; el resumen lo calcula quien tenga SHA-256 (la API con node:crypto).
 */
export function textoHuellaEntrega(pruebas: readonly { tipo: TipoPrueba; huella: string }[]): string {
  return pruebas.map((p) => `${p.tipo}|${p.huella}`).join('\n');
}

/** ¿Las pruebas subidas cumplen lo pactado para la fase? Devuelve lo que falta. */
export function pruebasQueFaltan(requeridas: readonly TipoPrueba[], subidas: readonly { tipo: TipoPrueba }[]): TipoPrueba[] {
  if (!requeridas.length) return subidas.length ? [] : ['archivo'];
  return requeridas.filter((r) => !subidas.some((s) => s.tipo === r));
}
