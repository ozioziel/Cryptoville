import type { Barrio, Busqueda } from '@cryptoville/shared';

/** Orden de los «Se busca»: más nuevos, mayor presupuesto, el que vence antes o la mejor reputación de quien publica. */
export type OrdenSeBusca = 'nuevos' | 'presupuesto' | 'vence' | 'reputacion';

export interface FiltrosSeBusca {
  texto: string;
  barrio: Barrio | 'todos';
  categoria: string | 'todas';
  /** Presupuesto mínimo en USDC (para quien busca trabajo). */
  presupuestoMinimo: number | null;
  /** Que cierre dentro de estos días (su fecha límite). */
  plazoDias?: number | null;
  /** Solo quienes verificaron su identidad (✔). */
  soloVerificados?: boolean;
  /** Si falta, se deja el orden en que llegan (los más nuevos primero). */
  orden?: OrdenSeBusca;
}

const normalizar = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const DIA = 86_400_000;

/**
 * Filtra los «Se busca» como el buscador de servicios: texto sin acentos, villa, categoría, presupuesto,
 * plazo y solo verificados; después los ordena. `reputaciones`: calificación de cada autor (para ese orden).
 */
export function filtrarSeBusca<T extends Busqueda & { autor?: { verificado?: boolean | null } }>(
  busquedas: T[],
  f: FiltrosSeBusca,
  reputaciones: Map<string, number | null> = new Map(),
  ahora = Date.now(),
): T[] {
  const palabras = normalizar(f.texto).split(/\s+/).filter(Boolean);
  const lista = busquedas.filter((b) => {
    if (f.barrio !== 'todos' && b.barrio !== f.barrio) return false;
    if (f.categoria !== 'todas' && b.categoria !== f.categoria) return false;
    if (f.presupuestoMinimo !== null && Number(b.presupuesto_usdc) < f.presupuestoMinimo) return false;
    if (f.plazoDias != null && Date.parse(b.fecha_limite) > ahora + f.plazoDias * DIA) return false;
    if (f.soloVerificados && !b.autor?.verificado) return false;
    const texto = normalizar(`${b.titulo} ${b.descripcion}`);
    return palabras.every((p) => texto.includes(p));
  });
  switch (f.orden) {
    case 'nuevos':
      return lista.sort((a, b) => Date.parse(b.creado_en) - Date.parse(a.creado_en));
    case 'presupuesto':
      return lista.sort((a, b) => Number(b.presupuesto_usdc) - Number(a.presupuesto_usdc));
    case 'vence':
      return lista.sort((a, b) => Date.parse(a.fecha_limite) - Date.parse(b.fecha_limite));
    case 'reputacion':
      return lista.sort((a, b) => (reputaciones.get(b.autor_id) ?? 0) - (reputaciones.get(a.autor_id) ?? 0));
    default:
      return lista;
  }
}
