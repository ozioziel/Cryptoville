// Portafolio: experiencia previa y proyectos (fotos, enlaces y videos).
//
// - Las fotos se suben al bucket público "fotos" (igual que las de los servicios).
// - Los videos pueden ser de Mux (públicos) o de YouTube y Vimeo; solo se aceptan los dominios
//   de `portafolio.dominiosVideo` en reglas.ts.
// - Los enlaces son solo https: la web muestra el dominio y los abre con rel="nofollow ugc noopener".
import type { Reglas } from './reglas.js';

export interface Experiencia {
  id: string;
  usuario_id: string;
  puesto: string;
  lugar: string;
  /** Fecha (AAAA-MM-DD). */
  desde: string;
  /** Fecha (AAAA-MM-DD) o null si sigue ahí. */
  hasta: string | null;
  descripcion: string | null;
  orden: number;
}

export interface EnlaceProyecto {
  url: string;
  titulo?: string;
}

export type VideoProyecto =
  | { tipo: 'mux'; video_id: string; playback_id: string | null }
  | { tipo: 'youtube' | 'vimeo'; id: string; url: string };

export interface Proyecto {
  id: string;
  usuario_id: string;
  titulo: string;
  descripcion: string;
  /** Fecha (AAAA-MM-DD) o null. */
  fecha: string | null;
  fotos: string[];
  enlaces: EnlaceProyecto[];
  videos: VideoProyecto[];
  /** Se cuelga como cuadro en la pared del interior de sus locales. */
  destacado: boolean;
  orden: number;
  creado_en: string;
}

/**
 * Lee un enlace de YouTube o Vimeo y devuelve su id (o null si no es de un dominio permitido).
 * Acepta youtube.com/watch?v=…, youtu.be/…, youtube.com/shorts/…, youtube.com/embed/…,
 * vimeo.com/123 y player.vimeo.com/video/123.
 */
export function videoExterno(enlace: string, reglas: Pick<Reglas, 'portafolio'>): { tipo: 'youtube' | 'vimeo'; id: string; url: string } | null {
  let url: URL;
  try {
    url = new URL(enlace.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  const host = url.hostname.toLowerCase();
  if (!reglas.portafolio.dominiosVideo.includes(host)) return null;
  const partes = url.pathname.split('/').filter(Boolean);
  if (host.endsWith('youtube.com') || host === 'youtu.be') {
    const id = host === 'youtu.be' ? partes[0] : partes[0] === 'watch' ? url.searchParams.get('v') : ['shorts', 'embed', 'live'].includes(partes[0]) ? partes[1] : null;
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? { tipo: 'youtube', id, url: `https://www.youtube.com/watch?v=${id}` } : null;
  }
  if (host.endsWith('vimeo.com')) {
    const id = host === 'player.vimeo.com' ? (partes[0] === 'video' ? partes[1] : null) : partes.find((p) => /^\d+$/.test(p));
    return id && /^\d{1,12}$/.test(id) ? { tipo: 'vimeo', id, url: `https://vimeo.com/${id}` } : null;
  }
  return null;
}

/** Dirección para incrustar el video (sin cookies de seguimiento en YouTube). */
export function incrustarVideo(v: { tipo: 'youtube' | 'vimeo'; id: string }): string {
  return v.tipo === 'youtube' ? `https://www.youtube-nocookie.com/embed/${v.id}` : `https://player.vimeo.com/video/${v.id}?dnt=1`;
}

/** Dominio de un enlace, para mostrarlo junto al enlace («behance.net»). */
export function dominioDe(enlace: string): string {
  try {
    return new URL(enlace).hostname.replace(/^www\./, '');
  } catch {
    return enlace;
  }
}
