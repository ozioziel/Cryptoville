import type { Barrio, Busqueda } from '@cryptoville/shared';

export interface FiltrosSeBusca {
  texto: string;
  barrio: Barrio | 'todos';
  categoria: string | 'todas';
  /** Presupuesto mínimo en USDC (para quien busca trabajo). */
  presupuestoMinimo: number | null;
}

const normalizar = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

/** Filtra los «Se busca» como el buscador de servicios: texto sin acentos, villa, categoría y presupuesto. */
export function filtrarSeBusca<T extends Busqueda>(busquedas: T[], f: FiltrosSeBusca): T[] {
  const palabras = normalizar(f.texto).split(/\s+/).filter(Boolean);
  return busquedas.filter((b) => {
    if (f.barrio !== 'todos' && b.barrio !== f.barrio) return false;
    if (f.categoria !== 'todas' && b.categoria !== f.categoria) return false;
    if (f.presupuestoMinimo !== null && Number(b.presupuesto_usdc) < f.presupuestoMinimo) return false;
    const texto = normalizar(`${b.titulo} ${b.descripcion}`);
    return palabras.every((p) => texto.includes(p));
  });
}
