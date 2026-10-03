import type { Barrio, Servicio } from '@cryptoville/shared';
import type { LocalDelPueblo } from './datos';

export interface Filtros {
  texto: string;
  barrio: Barrio | 'todos';
  precioMaximo: number | null;
}

export interface Resultado {
  servicio: Servicio;
  local: LocalDelPueblo;
}

const normalizar = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/** Busca servicios en el pueblo. Ordena por reputación del proveedor y luego por precio. */
export function buscarServicios(locales: LocalDelPueblo[], f: Filtros): Resultado[] {
  const palabras = normalizar(f.texto).split(/\s+/).filter(Boolean);
  const resultados: Resultado[] = [];
  for (const local of locales) {
    if (f.barrio !== 'todos' && local.barrio !== f.barrio) continue;
    for (const servicio of local.servicios) {
      if (f.precioMaximo !== null && Number(servicio.precio_usdc) > f.precioMaximo) continue;
      const texto = normalizar(`${servicio.titulo} ${servicio.descripcion} ${local.nombre} ${local.usuario.nombre}`);
      if (palabras.every((p) => texto.includes(p))) resultados.push({ servicio, local });
    }
  }
  return resultados.sort((a, b) => {
    const ra = a.local.reputacion?.calificacion ?? 0;
    const rb = b.local.reputacion?.calificacion ?? 0;
    return rb - ra || Number(a.servicio.precio_usdc) - Number(b.servicio.precio_usdc);
  });
}
