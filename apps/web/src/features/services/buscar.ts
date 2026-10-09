import type { Barrio, Servicio } from '@cryptoville/shared';
import type { LocalDelPueblo } from './datos';

/** Orden de los resultados: mejor reputación (como antes), más nuevos o por precio. */
export type OrdenServicios = 'reputacion' | 'nuevos' | 'precio-menor' | 'precio-mayor';

export interface Filtros {
  texto: string;
  /** Villa (el campo se sigue llamando barrio). */
  barrio: Barrio | 'todos';
  /** Categoría del local (opcional, para no romper llamadas anteriores). */
  categoria?: string | 'todas';
  precioMaximo: number | null;
  /** Entrega en a lo sumo estos días. */
  plazoMaximo?: number | null;
  /** Solo proveedores que verificaron su identidad (✔). */
  soloVerificados?: boolean;
  /** Si falta: mejor reputación y, a igual reputación, más barato. */
  orden?: OrdenServicios;
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

const precio = (r: Resultado) => Number(r.servicio.precio_usdc);
const reputacion = (r: Resultado) => r.local.reputacion?.calificacion ?? 0;
const creado = (r: Resultado) => Date.parse(r.servicio.creado_en ?? '') || 0;

/** Busca servicios en el pueblo (el tablón de afiches de «Quiero contratar»). */
export function buscarServicios(locales: LocalDelPueblo[], f: Filtros): Resultado[] {
  const palabras = normalizar(f.texto).split(/\s+/).filter(Boolean);
  const resultados: Resultado[] = [];
  for (const local of locales) {
    if (f.barrio !== 'todos' && local.barrio !== f.barrio) continue;
    if (f.categoria && f.categoria !== 'todas' && local.categoria !== f.categoria) continue;
    if (f.soloVerificados && !local.usuario.verificado) continue;
    for (const servicio of local.servicios) {
      if (f.precioMaximo !== null && Number(servicio.precio_usdc) > f.precioMaximo) continue;
      if (f.plazoMaximo != null && servicio.dias_entrega > f.plazoMaximo) continue;
      const texto = normalizar(`${servicio.titulo} ${servicio.descripcion} ${local.nombre} ${local.usuario.nombre}`);
      if (palabras.every((p) => texto.includes(p))) resultados.push({ servicio, local });
    }
  }
  switch (f.orden ?? 'reputacion') {
    case 'nuevos':
      return resultados.sort((a, b) => creado(b) - creado(a) || reputacion(b) - reputacion(a));
    case 'precio-menor':
      return resultados.sort((a, b) => precio(a) - precio(b) || reputacion(b) - reputacion(a));
    case 'precio-mayor':
      return resultados.sort((a, b) => precio(b) - precio(a) || reputacion(b) - reputacion(a));
    default:
      return resultados.sort((a, b) => reputacion(b) - reputacion(a) || precio(a) - precio(b));
  }
}
