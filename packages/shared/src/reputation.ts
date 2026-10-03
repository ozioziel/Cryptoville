import type { NivelReputacion } from './types/index.js';

/**
 * Nivel de reputación. Es la misma regla que usa la vista SQL `reputacion`
 * (apps/api/prisma/migrations): si cambias una, cambia la otra.
 * - Destacado: 10+ pedidos completados y calificación >= 4.5
 * - Confiable: 3+ pedidos completados y calificación >= 4
 * - Nuevo: el resto
 */
export function nivelReputacion(completados: number, calificacion: number | null): NivelReputacion {
  const nota = calificacion ?? 0;
  if (completados >= 10 && nota >= 4.5) return 'Destacado';
  if (completados >= 3 && nota >= 4) return 'Confiable';
  return 'Nuevo';
}

/** Estrellas para mostrar (1 decimal), o "Sin reseñas". */
export function textoCalificacion(calificacion: number | null, total: number): string {
  if (calificacion === null || total === 0) return 'Sin reseñas';
  return `${calificacion.toFixed(1)} ★ (${total} ${total === 1 ? 'reseña' : 'reseñas'})`;
}
