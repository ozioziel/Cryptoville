// «Mis trabajos» y «Trabajos verificados», leídos de Supabase (llave anon + RLS).
// - Los pedidos son privados: solo los ven sus partes (y el árbitro). De ahí sale la lista privada, con el monto.
// - `trabajos_publicos` es público: solo título, fecha y transacción. Las estrellas salen de `resenas` (pública).
// Las escrituras van por la API (/api/trabajos-publicos).
import { ESTADOS_TRABAJO_TERMINADO, formatoUsdc, type EstadoPedido, type RolTrabajo, type TrabajoPublico } from '@cryptoville/shared';
import { supabase } from '../../lib/supabase';
import type { UsuarioPublico } from '../services/datos';

const CAMPOS_USUARIO = 'id, nombre, avatar, apariencia, direccion, bio, rol, verificado';

/** Un pedido terminado de la persona, como lo ve ella (con el monto). */
export interface MiTrabajo {
  pedidoId: string;
  rol: RolTrabajo;
  titulo: string;
  estado: EstadoPedido;
  terminadoEn: string;
  montoUsdc: string;
  otro: UsuarioPublico;
  /** Estrellas que me dejó la otra persona en este pedido (null si no reseñó). */
  estrellas: number | null;
  /** Ya está en mi perfil público. */
  publico: boolean;
}

interface FilaPedido {
  id: string;
  estado: EstadoPedido;
  monto_usdc: string;
  actualizado_en: string;
  cliente_id: string;
  proveedor_id: string;
  servicio: { titulo: string } | null;
  cliente: UsuarioPublico;
  proveedor: UsuarioPublico;
  resenas: { autor_id: string; destinatario_id: string; calificacion: number }[];
}

export async function cargarMisTrabajos(usuarioId: string): Promise<MiTrabajo[]> {
  const [pedidos, publicos] = await Promise.all([
    supabase()
      .from('pedidos')
      .select(
        `id, estado, monto_usdc, actualizado_en, cliente_id, proveedor_id, servicio:servicios(titulo), ` +
          `cliente:usuarios!pedidos_cliente_id_fkey(${CAMPOS_USUARIO}), proveedor:usuarios!pedidos_proveedor_id_fkey(${CAMPOS_USUARIO}), ` +
          `resenas(autor_id, destinatario_id, calificacion)`,
      )
      .or(`cliente_id.eq.${usuarioId},proveedor_id.eq.${usuarioId}`)
      .in('estado', [...ESTADOS_TRABAJO_TERMINADO])
      .order('actualizado_en', { ascending: false })
      .limit(200),
    supabase().from('trabajos_publicos').select('pedido_id').eq('usuario_id', usuarioId),
  ]);
  if (pedidos.error || publicos.error) throw new Error('No se pudieron cargar tus trabajos');
  const enPerfil = new Set(((publicos.data ?? []) as { pedido_id: string }[]).map((x) => x.pedido_id));
  return ((pedidos.data ?? []) as unknown as FilaPedido[]).map((p) => {
    const rol: RolTrabajo = p.proveedor_id === usuarioId ? 'proveedor' : 'cliente';
    const resena = p.resenas.find((r) => r.destinatario_id === usuarioId);
    return {
      pedidoId: p.id,
      rol,
      titulo: p.servicio?.titulo ?? 'Pedido',
      estado: p.estado,
      terminadoEn: p.actualizado_en,
      montoUsdc: formatoUsdc(p.monto_usdc),
      otro: rol === 'proveedor' ? p.cliente : p.proveedor,
      estrellas: resena?.calificacion ?? null,
      publico: enPerfil.has(p.id),
    };
  });
}

/** Un trabajo verificado tal como se ve en público, con las estrellas que le dejaron. */
export interface TrabajoVerificado extends TrabajoPublico {
  estrellas: number | null;
}

export async function cargarTrabajosVerificados(usuarioId: string): Promise<TrabajoVerificado[]> {
  const { data, error } = await supabase()
    .from('trabajos_publicos')
    .select('*')
    .eq('usuario_id', usuarioId)
    .order('orden')
    .order('terminado_en', { ascending: false });
  if (error) throw new Error('No se pudieron cargar sus trabajos verificados');
  const trabajos = (data ?? []) as TrabajoPublico[];
  if (!trabajos.length) return [];
  const { data: resenas } = await supabase()
    .from('resenas')
    .select('pedido_id, calificacion')
    .eq('destinatario_id', usuarioId)
    .in(
      'pedido_id',
      trabajos.map((x) => x.pedido_id),
    );
  const porPedido = new Map(((resenas ?? []) as { pedido_id: string; calificacion: number }[]).map((r) => [r.pedido_id, r.calificacion]));
  return trabajos.map((x) => ({ ...x, estrellas: porPedido.get(x.pedido_id) ?? null }));
}
