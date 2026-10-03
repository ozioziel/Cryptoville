// Tipos de dominio compartidos por la web y la API.

export type Rol = 'usuario' | 'arbitro';

export type Barrio = 'diseno' | 'clases' | 'tecnologia';

export const BARRIOS: Record<Barrio, { nombre: string; descripcion: string }> = {
  diseno: { nombre: 'Diseño', descripcion: 'Logos, ilustración, edición de video y redes' },
  clases: { nombre: 'Clases', descripcion: 'Idiomas, música, matemáticas y tutorías' },
  tecnologia: { nombre: 'Tecnología', descripcion: 'Programación, webs, soporte y datos' },
};

/** Lotes del mapa del pueblo por barrio (los define apps/web/public/assets/mapas/pueblo.json). */
export const LOTES_POR_BARRIO: Record<Barrio, readonly number[]> = {
  diseno: [1, 2, 3, 4],
  clases: [5, 6, 7, 8],
  tecnologia: [9, 10, 11, 12],
};

export function barrioDeLote(lote: number): Barrio | null {
  for (const [barrio, lotes] of Object.entries(LOTES_POR_BARRIO) as [Barrio, readonly number[]][]) {
    if (lotes.includes(lote)) return barrio;
  }
  return null;
}

/** Colores permitidos para el letrero del local. */
export const COLORES_LOCAL = ['#e07a5f', '#3d85c6', '#81b29a', '#f2cc8f', '#9b5de5', '#f15bb5'] as const;

/** Personajes de Kenney Tiny Dungeon que se pueden usar como avatar (índice del tilesheet). */
export const AVATARES = [84, 85, 86, 87, 88, 96, 97, 98, 99, 100, 111, 112] as const;

export const MAX_SERVICIOS_POR_LOCAL = 6;

/** Estados del pedido en la app. Los 6 últimos reflejan el estado del contrato. */
export type EstadoPedido =
  | 'solicitado'
  | 'aceptado'
  | 'cancelado'
  | 'pagado'
  | 'entregado'
  | 'en_disputa'
  | 'liberado'
  | 'reembolsado'
  | 'resuelto';

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
  rol: Rol;
  creado_en: string;
}

export interface Local {
  id: string;
  usuario_id: string;
  nombre: string;
  barrio: Barrio;
  /** Lugar del mapa donde está el local (1..12, ver el mapa de Tiled). */
  lote: number;
  color: string;
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
  creado_en: string;
  actualizado_en: string;
}

/** Un paso hecho en Stellar Lab: quién lo declaró, su hash y si ya se verificó. */
export interface PasoPedido {
  id: string;
  pedido_id: string;
  accion: AccionPedido;
  hash: string | null;
  declarado_por: string;
  verificado_por: string | null;
  verificado_en: string | null;
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
  | 'nuevo_mensaje';

export interface Aviso {
  id: string;
  usuario_id: string;
  pedido_id: string | null;
  tipo: TipoAviso;
  texto: string;
  leido: boolean;
  creado_en: string;
}
