// Tipos de dominio compartidos por la web y la API.
import type { AparienciaCasa, AparienciaPersona } from '../apariencia.js';

export type Rol = 'usuario' | 'arbitro';

/**
 * Villas del pueblo. El nombre técnico sigue siendo `barrio` (en la base y en el código)
 * para no romper nada; en la interfaz se llaman "villas".
 */
export type Barrio = 'creativo' | 'tech' | 'audiovisual' | 'academy';

export interface Categoria {
  id: string;
  nombre: string;
}

export interface DatosBarrio {
  nombre: string;
  descripcion: string;
  /** Categorías que puede elegir un local de esta villa (la primera es la inicial). */
  categorias: readonly Categoria[];
  /** Color de la villa (chips, portada y franja de las casas). */
  color: string;
  colorOscuro: string;
  /** Fondo suave de los chips de la villa. */
  colorSuave: string;
}

/**
 * Las 4 villas. Las categorías también las valida la base de datos
 * (CHECK "locales_categoria_check" en apps/api/prisma/migrations): si cambias una, cambia la otra.
 */
export const BARRIOS: Record<Barrio, DatosBarrio> = {
  creativo: {
    nombre: 'Creativo',
    descripcion: 'Diseño gráfico, ilustración, animación, UI/UX y branding',
    categorias: [
      { id: 'diseno-grafico', nombre: 'Diseño gráfico' },
      { id: 'ilustracion', nombre: 'Ilustración' },
      { id: 'animacion', nombre: 'Animación' },
      { id: 'ui-ux', nombre: 'UI/UX' },
      { id: 'branding', nombre: 'Branding' },
    ],
    color: '#e07a5f',
    colorOscuro: '#b85a42',
    colorSuave: '#fbe8e1',
  },
  tech: {
    nombre: 'Tech',
    descripcion: 'Desarrollo web y móvil, backend, videojuegos y automatización',
    categorias: [
      { id: 'desarrollo-web', nombre: 'Desarrollo web' },
      { id: 'desarrollo-movil', nombre: 'Desarrollo móvil' },
      { id: 'backend', nombre: 'Backend' },
      { id: 'videojuegos', nombre: 'Videojuegos' },
      { id: 'automatizacion', nombre: 'Automatización' },
    ],
    color: '#3d85c6',
    colorOscuro: '#2c639a',
    colorSuave: '#e3eef8',
  },
  audiovisual: {
    nombre: 'Audiovisual',
    descripcion: 'Fotografía, edición de video, música, cine y sonido',
    categorias: [
      { id: 'fotografia', nombre: 'Fotografía' },
      { id: 'edicion-video', nombre: 'Edición de video' },
      { id: 'musica', nombre: 'Música' },
      { id: 'cine', nombre: 'Cine' },
      { id: 'sonido', nombre: 'Sonido' },
    ],
    color: '#a95656',
    colorOscuro: '#7e3f43',
    colorSuave: '#f6e7e4',
  },
  academy: {
    nombre: 'Academy',
    descripcion: 'Cursos, mentorías, idiomas, programación y diseño',
    categorias: [
      { id: 'cursos', nombre: 'Cursos' },
      { id: 'mentorias', nombre: 'Mentorías' },
      { id: 'idiomas', nombre: 'Idiomas' },
      { id: 'programacion', nombre: 'Programación' },
      { id: 'diseno', nombre: 'Diseño' },
    ],
    color: '#5d9b78',
    colorOscuro: '#3f7a5a',
    colorSuave: '#e5f1e9',
  },
};

/** Villas en el orden del selector. */
export const LISTA_BARRIOS = Object.keys(BARRIOS) as Barrio[];

/**
 * @deprecated Nombres anteriores de los barrios (antes de las villas). La API los sigue
 * aceptando y los convierte: diseno → creativo, clases → academy, tecnologia → tech.
 */
export const BARRIOS_ANTERIORES: Record<string, Barrio> = {
  diseno: 'creativo',
  clases: 'academy',
  tecnologia: 'tech',
};

export function esBarrio(valor: unknown): valor is Barrio {
  return typeof valor === 'string' && valor in BARRIOS;
}

export function esCategoriaDe(barrio: Barrio, categoria: string): boolean {
  return BARRIOS[barrio].categorias.some((c) => c.id === categoria);
}

/** Nombre de una categoría para mostrar ("fotografia" → "Fotografía"). */
export function nombreCategoria(categoria: string): string {
  for (const b of LISTA_BARRIOS) {
    const c = BARRIOS[b].categorias.find((x) => x.id === categoria);
    if (c) return c.nombre;
  }
  return categoria;
}

/**
 * Número de lote para un local nuevo en una villa: el primer número libre (1, 2, 3…),
 * reutilizando los huecos que dejan los locales que se van. Las villas no tienen tope.
 */
export function primerLoteLibre(ocupados: Iterable<number>): number {
  const usados = new Set(ocupados);
  let lote = 1;
  while (usados.has(lote)) lote += 1;
  return lote;
}

/**
 * @deprecated Las villas ya no tienen tope de lotes: cada villa numera sus lotes desde 1
 * (ver `primerLoteLibre`). Se conserva solo para no romper código anterior.
 */
export const LOTES_POR_BARRIO: Record<Barrio, readonly number[]> = {
  creativo: [1, 2, 3, 4],
  academy: [5, 6, 7, 8],
  tech: [9, 10, 11, 12],
  audiovisual: [],
};

/** @deprecated Un lote ya no indica la villa (cada villa tiene sus propios lotes 1, 2, 3…). */
export function barrioDeLote(lote: number): Barrio | null {
  for (const [barrio, lotes] of Object.entries(LOTES_POR_BARRIO) as [Barrio, readonly number[]][]) {
    if (lotes.includes(lote)) return barrio;
  }
  return null;
}

/** Colores que puede elegir el dueño para el toldo, la puerta y el letrero de su casa (paleta cerrada). */
export const COLORES_LOCAL = ['#e07a5f', '#3d85c6', '#5d9b78', '#e9b44c', '#9b7bc4', '#81b29a', '#f2cc8f', '#c97b84'] as const;

/**
 * @deprecated Colores de la paleta anterior. La API los sigue aceptando para no invalidar
 * locales existentes, pero el editor ya no los ofrece.
 */
export const COLORES_LOCAL_ANTERIORES = ['#9b5de5', '#f15bb5'] as const;

/**
 * Personajes de Kenney Tiny Dungeon (índice del tilesheet) que se usaban como avatar.
 * La columna `avatar` se conserva: si un usuario no tiene `apariencia`, se dibuja la persona
 * equivalente a su personaje (ver `aparienciaDeAvatar`).
 */
export const AVATARES = [84, 85, 86, 87, 88, 96, 97, 98, 99, 100, 111, 112] as const;

export const MAX_SERVICIOS_POR_LOCAL = 6;

/**
 * Estados del pedido en la app. Los 6 de pagado a resuelto reflejan el estado del contrato v1.
 * `finalizado`: un pedido por fases (contrato v2) o un pago directo que terminó.
 */
export type EstadoPedido =
  | 'solicitado'
  | 'aceptado'
  | 'cancelado'
  | 'pagado'
  | 'entregado'
  | 'en_disputa'
  | 'liberado'
  | 'reembolsado'
  | 'resuelto'
  | 'finalizado';

/** Acciones que mueven un pedido de un estado a otro. */
export type AccionPedido =
  | 'aceptar'
  | 'cancelar'
  | 'crear_pedido'
  | 'marcar_entregado'
  | 'liberar'
  | 'rechazar'
  | 'abrir_disputa'
  | 'resolver'
  | 'reembolsar_por_vencimiento'
  | 'cobrar_por_vencimiento';

/** Acciones de los pedidos por fases (contrato v2) y del pago directo. Ver packages/shared/src/pagos.ts. */
export type AccionV2 =
  | 'aceptar_plan'
  | 'pagar_directo'
  | 'confirmar_recibido'
  | 'entregar_fase'
  | 'liberar_fase'
  | 'pedir_cambios'
  | 'resolver_por_vencimiento';

/** Cualquier paso que queda en el historial de un pedido. */
export type AccionRegistrada = AccionPedido | AccionV2;

/** Quién puede ejecutar una acción. */
export type Actor = 'cliente' | 'proveedor' | 'participante' | 'arbitro';

/** Parte de un pedido (también es el enum `Parte` del contrato). */
export type Parte = 'Cliente' | 'Proveedor';

export interface Usuario {
  id: string;
  direccion: string;
  nombre: string;
  bio: string | null;
  avatar: number;
  /** Persona en vectores. Si es null, se usa la equivalente a `avatar`. */
  apariencia: AparienciaPersona | null;
  rol: Rol;
  /** KYC aprobado: insignia ✔ junto al nombre. */
  verificado?: boolean;
  /** Suspendida por el equipo. */
  suspendido?: boolean;
  /** Lote de su edificio en la Plaza principal (si tiene al menos un local). */
  lote_plaza?: number | null;
  creado_en: string;
}

export interface Local {
  id: string;
  usuario_id: string;
  nombre: string;
  barrio: Barrio;
  /** Número de lote dentro de su villa (1, 2, 3…). Define dónde está la casa y nunca cambia mientras siga en la villa. */
  lote: number;
  /** Categoría del local (una de las categorías de su villa). */
  categoria: string;
  /** Color del dueño: toldo, puerta y letrero. */
  color: string;
  /** Casa personalizada. Si es null, se usa la casa por defecto de su villa. */
  apariencia: AparienciaCasa | null;
  descripcion: string | null;
  activo: boolean;
}

export interface Servicio {
  id: string;
  local_id: string;
  titulo: string;
  descripcion: string;
  /** Precio en USDC con hasta 7 decimales, como texto ("25.5"). */
  precio_usdc: string;
  dias_entrega: number;
  foto_url: string | null;
  activo: boolean;
  /** Cuándo se publicó (para ordenar «más nuevos» en el tablón). */
  creado_en?: string;
}

export interface Pedido {
  id: string;
  /** Número que se usa como `id` en el contrato (u64). */
  numero: number;
  servicio_id: string;
  cliente_id: string;
  proveedor_id: string;
  estado: EstadoPedido;
  monto_usdc: string;
  detalle: string;
  /** Fecha límite de entrega acordada (ISO). Se fija al aceptar. */
  fecha_limite: string | null;
  /** Cómo se paga: directo, con garantía o por etapas (ver pagos.ts). */
  metodo_pago?: 'garantia' | 'directo' | 'etapas';
  /** Contrato donde vive el pedido (v1: una entrega; v2: fases y pago directo). */
  contrato?: 'v1' | 'v2';
  /** Cuándo aceptó el cliente el plan de fases (por etapas). */
  plan_aceptado_en?: string | null;
  /** Lo que el cliente pidió cambiar del plan. */
  plan_comentario?: string | null;
  /** Wallets del pedido en el contrato (vacías = la wallet de la cuenta). */
  direccion_cliente?: string | null;
  direccion_proveedor?: string | null;
  creado_en: string;
  actualizado_en: string;
}

/** Un paso hecho en Stellar Lab: quién lo declaró, su hash y si ya se verificó. */
export interface PasoPedido {
  id: string;
  pedido_id: string;
  accion: AccionRegistrada;
  /** Fase del pedido (en los pedidos por fases). */
  fase?: number | null;
  hash: string | null;
  declarado_por: string;
  verificado_por: string | null;
  verificado_en: string | null;
  /** Cryptoville leyó la transacción en la red y coincide con el pedido. */
  en_cadena?: boolean;
  ledger?: number | null;
  creado_en: string;
}

export interface Mensaje {
  id: string;
  pedido_id: string;
  autor_id: string;
  texto: string;
  creado_en: string;
}

export interface Disputa {
  id: string;
  pedido_id: string;
  abierta_por: string;
  motivo: string;
  ganador: Parte | null;
  decision: string | null;
  creado_en: string;
  resuelta_en: string | null;
}

export interface Resena {
  id: string;
  pedido_id: string;
  autor_id: string;
  destinatario_id: string;
  calificacion: number;
  comentario: string | null;
  creado_en: string;
}

export type NivelReputacion = 'Nuevo' | 'Confiable' | 'Destacado';

export interface Reputacion {
  usuario_id: string;
  calificacion: number | null;
  total_resenas: number;
  completados: number;
  disputas_ganadas: number;
  disputas_perdidas: number;
  nivel: NivelReputacion;
}

export type TipoAviso =
  | 'nuevo_pedido'
  | 'pedido_aceptado'
  | 'te_toca_pagar'
  | 'te_toca_entregar'
  | 'te_toca_liberar'
  | 'te_toca_verificar'
  | 'disputa_abierta'
  | 'disputa_resuelta'
  | 'pedido_cerrado'
  | 'nuevo_mensaje'
  | 'nueva_propuesta'
  | 'propuesta_aceptada'
  | 'busqueda_cerrada'
  | 'verificacion'
  | 'reporte_resuelto'
  | 'recordatorio'
  | 'plan_propuesto'
  | 'plan_aceptado'
  | 'fase_entregada'
  | 'fase_liberada'
  | 'cambios_pedidos'
  | 'pago_directo';

export interface Aviso {
  id: string;
  usuario_id: string;
  pedido_id: string | null;
  /** «Se busca» al que se refiere el aviso (propuestas). */
  busqueda_id: string | null;
  tipo: TipoAviso;
  texto: string;
  leido: boolean;
  creado_en: string;
}

/** Una wallet de la cuenta. La cuenta es la persona: puede tener varias wallets. */
export interface Wallet {
  id: string;
  usuario_id: string;
  direccion: string;
  /** Cómo se conectó: su propia wallet, Pollar (correo) o una llave de prueba. */
  metodo: 'wallet' | 'pollar' | 'llave-prueba';
  /** La wallet con la que se creó la cuenta (no se puede quitar). */
  de_la_cuenta: boolean;
  /** La wallet donde cobra por defecto (una por cuenta). */
  para_cobrar: boolean;
  agregada_en: string;
}

export type TipoComentario = 'idea' | 'error' | 'otro';

/** «Enviar comentarios»: ideas y errores que llegan al equipo. */
export interface Comentario {
  id: string;
  usuario_id: string | null;
  tipo: TipoComentario;
  texto: string;
  contexto: string | null;
  captura_ruta: string | null;
  estado: 'nuevo' | 'visto' | 'resuelto';
  creado_en: string;
}
