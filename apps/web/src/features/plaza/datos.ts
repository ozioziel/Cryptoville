// La Plaza principal (CVs de usuarios), leída de Supabase (llave anon + RLS). Las escrituras van por la API.
// - Los edificios salen de los locales del pueblo: una persona con al menos un local activo y su `lote_plaza`.
// - El CV: la dueña lee la tabla `cvs` (todo); los demás, la vista `cvs_publicos` (solo lo público).
import type { CvPropio, CvPublico, Idioma } from '@cryptoville/shared';
import type { EdificioEnMapa } from '../../game/EventBus';
import { supabase } from '../../lib/supabase';
import type { LocalDelPueblo } from '../services/datos';

/** Un edificio por persona con locales activos (los locales ya llegan solo activos). */
export function edificiosDe(locales: LocalDelPueblo[]): EdificioEnMapa[] {
  const porPersona = new Map<string, EdificioEnMapa>();
  for (const l of locales) {
    const u = l.usuario;
    if (!u?.lote_plaza) continue;
    const e = porPersona.get(u.id);
    if (e) e.locales += 1;
    else porPersona.set(u.id, { usuarioId: u.id, lote: u.lote_plaza, nombre: u.nombre, verificado: Boolean(u.verificado), avatar: u.avatar, apariencia: u.apariencia, locales: 1 });
  }
  return [...porPersona.values()].sort((a, b) => a.lote - b.lote);
}

const normalizarIdiomas = (v: unknown): Idioma[] => (Array.isArray(v) ? (v as Idioma[]) : []);

/** El CV de otra persona: solo lo que marcó como público (null si todavía no armó nada o está oculto). */
export async function cargarCvPublico(usuarioId: string): Promise<CvPublico | null> {
  const { data } = await supabase().from('cvs_publicos').select('*').eq('usuario_id', usuarioId).maybeSingle();
  if (!data) return null;
  const cv = data as CvPublico;
  return { ...cv, habilidades: cv.habilidades ?? [], idiomas: normalizarIdiomas(cv.idiomas) };
}

/** Mi CV, con lo privado (la tabla `cvs` solo deja leer a su dueña y al árbitro). */
export async function cargarMiCv(usuarioId: string): Promise<CvPropio | null> {
  const { data } = await supabase().from('cvs').select('*').eq('usuario_id', usuarioId).maybeSingle();
  if (!data) return null;
  const cv = data as CvPropio;
  return { ...cv, habilidades: cv.habilidades ?? [], idiomas: normalizarIdiomas(cv.idiomas) };
}

/** Enlace para descargar el PDF (bucket público `cvs`). */
export function urlPdf(ruta: string): string {
  return supabase().storage.from('cvs').getPublicUrl(ruta).data.publicUrl;
}
