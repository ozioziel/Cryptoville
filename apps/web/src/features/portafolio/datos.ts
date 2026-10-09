// Lectura del portafolio desde Supabase (llave anon + RLS: es público, salvo lo oculto y las cuentas suspendidas).
// Las escrituras van por la API (/api/portafolio).
import type { Experiencia, Proyecto } from '@cryptoville/shared';
import { supabase } from '../../lib/supabase';

export interface Portafolio {
  experiencias: Experiencia[];
  proyectos: Proyecto[];
}

/** Fechas como AAAA-MM-DD (Postgres `date` ya llega así; por las dudas se recorta). */
const dia = (v: string | null): string | null => (v ? v.slice(0, 10) : null);

const normalizarProyecto = (p: Proyecto): Proyecto => ({ ...p, fecha: dia(p.fecha), fotos: p.fotos ?? [], enlaces: p.enlaces ?? [], videos: p.videos ?? [] });

export async function cargarPortafolio(usuarioId: string): Promise<Portafolio> {
  const [e, p] = await Promise.all([
    supabase().from('experiencias').select('*').eq('usuario_id', usuarioId).order('orden').order('desde', { ascending: false }),
    supabase().from('proyectos').select('*').eq('usuario_id', usuarioId).order('orden').order('creado_en', { ascending: false }),
  ]);
  if (e.error || p.error) throw new Error('No se pudo cargar el portafolio');
  return {
    experiencias: ((e.data ?? []) as Experiencia[]).map((x) => ({ ...x, desde: dia(x.desde)!, hasta: dia(x.hasta) })),
    proyectos: ((p.data ?? []) as Proyecto[]).map(normalizarProyecto),
  };
}

export async function cargarProyecto(id: string): Promise<Proyecto | null> {
  const { data, error } = await supabase().from('proyectos').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error('No se pudo cargar el proyecto');
  return data ? normalizarProyecto(data as Proyecto) : null;
}

/** Proyectos por id (los adjuntos a una propuesta). Los que ya no se ven no aparecen. */
export async function cargarProyectos(ids: string[]): Promise<Proyecto[]> {
  if (!ids.length) return [];
  const { data } = await supabase().from('proyectos').select('*').in('id', ids);
  return ((data ?? []) as Proyecto[]).map(normalizarProyecto);
}

/** Los cuadros de la pared: proyectos destacados del dueño del local (máximo 4). */
export async function cargarDestacados(usuarioId: string): Promise<Proyecto[]> {
  const { data } = await supabase().from('proyectos').select('*').eq('usuario_id', usuarioId).eq('destacado', true).order('orden').limit(4);
  return ((data ?? []) as Proyecto[]).map(normalizarProyecto);
}

/** «mar. 2024 – hoy». */
export function periodo(desde: string, hasta: string | null): string {
  const f = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es', { month: 'short', year: 'numeric' });
  return `${f(desde)} – ${hasta ? f(hasta) : 'hoy'}`;
}

/** Fechas de un elemento del CV: «mar. 2019 – hoy», «Emitida en may. 2022» (certificaciones) o «sept. 2021» (premios). */
export function fechasCv(e: Pick<Experiencia, 'tipo' | 'desde' | 'hasta'>): string {
  const mes = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es', { month: 'short', year: 'numeric' });
  if (e.tipo === 'premio') return mes(e.desde);
  if (e.tipo === 'certificacion') return e.hasta ? `Emitida en ${mes(e.desde)} · vence en ${mes(e.hasta)}` : `Emitida en ${mes(e.desde)}`;
  return periodo(e.desde, e.hasta);
}
