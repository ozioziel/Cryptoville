// Lectura de los «Se busca» y sus propuestas desde Supabase (llave anon + RLS).
// Las escrituras van por la API (/api/busquedas y /api/propuestas).
import { formatoUsdc, type Barrio, type Busqueda, type EstadoBusqueda, type Propuesta } from '@cryptoville/shared';
import type { SeBuscaEnMapa } from '../../game/EventBus';
import { supabase } from '../../lib/supabase';
import type { UsuarioPublico } from '../services/datos';

const CAMPOS_USUARIO = 'id, nombre, avatar, apariencia, direccion, bio, rol';

export interface BusquedaPublica extends Busqueda {
  autor: UsuarioPublico;
}

export interface LocalDeProveedor {
  id: string;
  nombre: string;
  barrio: Barrio;
  lote: number;
  activo: boolean;
}

export interface PropuestaDetalle extends Propuesta {
  proveedor: UsuarioPublico & { local: LocalDeProveedor | null };
}

export interface BusquedaDetalle extends BusquedaPublica {
  /** RLS: quien publicó ve todas; quien propuso, solo la suya; los demás, ninguna. */
  propuestas: PropuestaDetalle[];
}

export interface PropuestaPropia extends Propuesta {
  busqueda: Pick<Busqueda, 'id' | 'titulo' | 'estado' | 'barrio' | 'presupuesto_usdc' | 'fecha_limite' | 'pedido_id'>;
}

const conMontos = <T extends Busqueda>(b: T): T => ({ ...b, presupuesto_usdc: formatoUsdc(b.presupuesto_usdc) });
const propuestaConMonto = <T extends Propuesta>(p: T): T => ({ ...p, monto_usdc: formatoUsdc(p.monto_usdc) });
/** PostgREST devuelve la relación uno a uno como objeto (o como lista en versiones viejas). */
const uno = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

/** Lo que Phaser necesita para dibujar un «Se busca» como casa en el modo «Quiero trabajar». */
export function seBuscaEnMapa(b: BusquedaPublica): SeBuscaEnMapa {
  return { id: b.id, barrio: b.barrio, lote: b.lote, titulo: b.titulo, avatarAutor: b.autor.avatar, aparienciaAutor: b.autor.apariencia };
}

/** «Se busca» abiertos y sin vencer, los más nuevos primero (lectura pública). */
export async function cargarSeBusca(): Promise<BusquedaPublica[]> {
  const { data, error } = await supabase()
    .from('busquedas')
    .select(`*, autor:usuarios!busquedas_autor_id_fkey(${CAMPOS_USUARIO})`)
    .eq('estado', 'abierta')
    .gt('fecha_limite', new Date().toISOString())
    .order('creado_en', { ascending: false })
    .limit(200);
  if (error) throw new Error('No se pudieron cargar los «Se busca»');
  return ((data ?? []) as unknown as BusquedaPublica[]).map(conMontos);
}

export async function cargarBusqueda(id: string): Promise<BusquedaDetalle | null> {
  const { data, error } = await supabase()
    .from('busquedas')
    .select(
      `*, autor:usuarios!busquedas_autor_id_fkey(${CAMPOS_USUARIO}), ` +
        `propuestas(*, proveedor:usuarios!propuestas_proveedor_id_fkey(${CAMPOS_USUARIO}, local:locales(id, nombre, barrio, lote, activo)))`,
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error('No se pudo cargar el «Se busca»');
  if (!data) return null;
  const b = data as unknown as BusquedaDetalle & { propuestas: (PropuestaDetalle & { proveedor: { local: unknown } })[] };
  return {
    ...conMontos(b),
    propuestas: (b.propuestas ?? [])
      .map((p) => propuestaConMonto({ ...p, proveedor: { ...p.proveedor, local: uno(p.proveedor.local as LocalDeProveedor | LocalDeProveedor[]) } }))
      .sort((x, y) => x.creado_en.localeCompare(y.creado_en)),
  };
}

/** Los «Se busca» que publicó el usuario (para "Mis pedidos"). */
export async function cargarMisSeBusca(usuarioId: string): Promise<Busqueda[]> {
  const { data, error } = await supabase()
    .from('busquedas')
    .select('*')
    .eq('autor_id', usuarioId)
    .order('actualizado_en', { ascending: false })
    .limit(100);
  if (error) throw new Error('No se pudieron cargar tus «Se busca»');
  return ((data ?? []) as Busqueda[]).map(conMontos);
}

/** Las propuestas que mandó el usuario, con su «Se busca». */
export async function cargarMisPropuestas(usuarioId: string): Promise<PropuestaPropia[]> {
  const { data, error } = await supabase()
    .from('propuestas')
    .select('*, busqueda:busquedas(id, titulo, estado, barrio, presupuesto_usdc, fecha_limite, pedido_id)')
    .eq('proveedor_id', usuarioId)
    .order('actualizado_en', { ascending: false })
    .limit(100);
  if (error) throw new Error('No se pudieron cargar tus propuestas');
  return ((data ?? []) as unknown as PropuestaPropia[]).map(propuestaConMonto);
}

/** Color del chip de estado de un «Se busca». */
export const CLASE_ESTADO_BUSQUEDA: Record<EstadoBusqueda, string> = {
  abierta: 'aviso',
  asignada: 'exito',
  cancelada: 'apagado',
};
