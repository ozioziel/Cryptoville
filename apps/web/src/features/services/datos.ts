import { formatoUsdc, type Local, type Reputacion, type Servicio, type Usuario } from '@cryptoville/shared';
import type { LocalEnMapa } from '../../game/EventBus';
import { supabase } from '../../lib/supabase';

export type UsuarioPublico = Pick<Usuario, 'id' | 'nombre' | 'avatar' | 'apariencia' | 'direccion' | 'bio' | 'rol' | 'verificado'>;

export interface LocalDelPueblo extends Local {
  usuario: UsuarioPublico;
  servicios: Servicio[];
  reputacion: Reputacion | null;
}

const normalizarServicio = (s: Servicio): Servicio => ({ ...s, precio_usdc: formatoUsdc(s.precio_usdc) });

/** Todos los locales abiertos con su dueño, servicios activos y reputación (lectura pública con RLS). */
export async function cargarPueblo(): Promise<LocalDelPueblo[]> {
  const { data, error } = await supabase()
    .from('locales')
    .select('*, usuario:usuarios(id, nombre, avatar, apariencia, direccion, bio, rol, verificado), servicios(*)')
    .eq('activo', true)
    .order('lote');
  if (error) throw new Error('No se pudo cargar el pueblo');
  const locales = (data ?? []) as unknown as (Local & { usuario: UsuarioPublico; servicios: Servicio[] })[];
  const reputaciones = await cargarReputaciones(locales.map((l) => l.usuario_id));
  return locales.map((l) => ({
    ...l,
    servicios: l.servicios.filter((s) => s.activo).map(normalizarServicio),
    reputacion: reputaciones.get(l.usuario_id) ?? null,
  }));
}

/** Lo que Phaser necesita para dibujar un local en su villa. */
export function localEnMapa(l: LocalDelPueblo): LocalEnMapa {
  return {
    id: l.id,
    barrio: l.barrio,
    lote: l.lote,
    nombre: l.nombre,
    color: l.color,
    avatarDueno: l.usuario.avatar,
    aparienciaDueno: l.usuario.apariencia,
    aparienciaCasa: l.apariencia,
  };
}

export async function cargarReputaciones(ids: string[]): Promise<Map<string, Reputacion>> {
  if (!ids.length) return new Map();
  const { data } = await supabase().from('reputacion').select('*').in('usuario_id', ids);
  return new Map(
    ((data ?? []) as Reputacion[]).map((r) => [r.usuario_id, { ...r, calificacion: r.calificacion === null ? null : Number(r.calificacion) }]),
  );
}

export interface ResenaPublica {
  id: string;
  calificacion: number;
  comentario: string | null;
  creado_en: string;
  pedido_id: string;
  autor: { nombre: string; avatar: number; apariencia: Usuario['apariencia'] };
}

export async function cargarResenas(usuarioId: string): Promise<ResenaPublica[]> {
  const { data } = await supabase()
    .from('resenas')
    .select('id, calificacion, comentario, creado_en, pedido_id, autor:usuarios!resenas_autor_id_fkey(nombre, avatar, apariencia)')
    .eq('destinatario_id', usuarioId)
    .order('creado_en', { ascending: false })
    .limit(20);
  return (data ?? []) as unknown as ResenaPublica[];
}
