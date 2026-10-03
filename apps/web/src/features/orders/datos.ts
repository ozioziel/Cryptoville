import { formatoUsdc, type Disputa, type Mensaje, type PasoPedido, type Pedido, type Resena } from '@cryptoville/shared';
import { supabase } from '../../lib/supabase';
import type { UsuarioPublico } from '../services/datos';

export interface PedidoResumen extends Pedido {
  es_ejemplo: boolean;
  servicio: { titulo: string };
  cliente: UsuarioPublico;
  proveedor: UsuarioPublico;
}

export interface PedidoDetalle extends PedidoResumen {
  pasos: PasoPedido[];
  mensajes: Mensaje[];
  disputa: Disputa | null;
  resenas: Resena[];
}

const CAMPOS_USUARIO = 'id, nombre, avatar, direccion, bio, rol';
const SELECT_RESUMEN =
  `*, servicio:servicios(titulo), cliente:usuarios!pedidos_cliente_id_fkey(${CAMPOS_USUARIO}), ` +
  `proveedor:usuarios!pedidos_proveedor_id_fkey(${CAMPOS_USUARIO})`;

const normalizar = <T extends Pedido>(p: T): T => ({ ...p, monto_usdc: formatoUsdc(p.monto_usdc), numero: Number(p.numero) });

/** Pedidos donde participa el usuario (RLS ya filtra; el árbitro ve todos). */
export async function cargarMisPedidos(usuarioId: string): Promise<PedidoResumen[]> {
  const { data, error } = await supabase()
    .from('pedidos')
    .select(SELECT_RESUMEN)
    .or(`cliente_id.eq.${usuarioId},proveedor_id.eq.${usuarioId}`)
    .order('actualizado_en', { ascending: false })
    .limit(100);
  if (error) throw new Error('No se pudieron cargar tus pedidos');
  return ((data ?? []) as unknown as PedidoResumen[]).map(normalizar);
}

export async function cargarPedido(id: string): Promise<PedidoDetalle | null> {
  const { data, error } = await supabase()
    .from('pedidos')
    .select(`${SELECT_RESUMEN}, pasos:pasos_pedido(*), mensajes(*), disputa:disputas(*), resenas(*)`)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error('No se pudo cargar el pedido');
  if (!data) return null;
  const p = data as unknown as PedidoDetalle & { disputa: Disputa | Disputa[] | null };
  return {
    ...normalizar(p),
    disputa: Array.isArray(p.disputa) ? (p.disputa[0] ?? null) : p.disputa,
    pasos: [...p.pasos].sort((a, b) => a.creado_en.localeCompare(b.creado_en)),
    mensajes: [...p.mensajes].sort((a, b) => a.creado_en.localeCompare(b.creado_en)),
  };
}

export interface DisputaArbitro extends Disputa {
  pedido: PedidoResumen;
}

/** Para el panel del árbitro: todas las disputas (RLS deja verlas solo al rol árbitro). */
export async function cargarDisputas(): Promise<DisputaArbitro[]> {
  const { data, error } = await supabase()
    .from('disputas')
    .select(`*, pedido:pedidos(${SELECT_RESUMEN})`)
    .order('creado_en', { ascending: false })
    .limit(100);
  if (error) throw new Error('No se pudieron cargar las disputas');
  return ((data ?? []) as unknown as DisputaArbitro[]).map((d) => ({ ...d, pedido: normalizar(d.pedido) }));
}
