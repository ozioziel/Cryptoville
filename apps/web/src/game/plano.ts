// Plano de una villa: dónde va cada casa según su número de lote.
//
// - La posición de una casa depende SOLO de su número de lote: nunca cambia aunque se abran
//   o cierren otros locales.
// - La primera fila es la entrada de la villa: el edificio central y la estatua quedan fijos al centro,
//   con 2 lotes a cada lado. Desde la segunda fila hay 7 lotes por fila, y cada fila tiene su calle.
// - Las filas se abren a medida que la villa se llena (siempre se ven al menos 2).
// Las medidas son las de la muestra aprobada (casa de 150 × 172, calle de 110 de alto).
import { ALTO_CASA, ANCHO_CASA, PUERTA_CASA } from '../arte/casa';

export const COLUMNAS = 7;
export const PASO_COLUMNA = 200;
export const MARGEN_X = 80;
/** Ancho de cada villa en píxeles del mundo. */
export const ANCHO_VILLA = MARGEN_X * 2 + PASO_COLUMNA * (COLUMNAS - 1) + ANCHO_CASA;
export const CENTRO_X = ANCHO_VILLA / 2;
/** Cuánto se corre la plaza de la muestra (el cine estaba centrado en x = 460) para quedar al centro. */
export const DESPLAZAMIENTO_PLAZA = CENTRO_X - 460;

export const PRIMERA_FILA_Y = 255;
export const ALTO_FILA = 301;
export const ALTO_CALLE = 110;
/** La calle empieza justo debajo de las casas (como en la muestra). */
const CALLE_DESDE = 170;
/** Columnas libres de la primera fila (al centro están el edificio y la estatua). */
const COLUMNAS_ENTRADA = [0, 1, 5, 6] as const;
export const MIN_FILAS = 2;
/**
 * Filas de un sector completo: la entrada (4 lotes) más 8 calles de 7 = 60 casas
 * (`villa.casasPorSector` en packages/shared/src/reglas.ts). Después se abre «Creativo B».
 */
export const FILAS_POR_SECTOR = 9;

export interface Punto {
  x: number;
  y: number;
}

export function filaYColumna(lote: number): { fila: number; columna: number } {
  const n = Math.max(1, Math.floor(lote));
  if (n <= COLUMNAS_ENTRADA.length) return { fila: 0, columna: COLUMNAS_ENTRADA[n - 1] };
  const i = n - COLUMNAS_ENTRADA.length - 1;
  return { fila: 1 + Math.floor(i / COLUMNAS), columna: i % COLUMNAS };
}

/** Esquina superior izquierda de la casa del lote. */
export function posicionDeLote(lote: number): Punto {
  const { fila, columna } = filaYColumna(lote);
  return { x: MARGEN_X + columna * PASO_COLUMNA, y: topeDeFila(fila) };
}

/** Punto frente a la puerta de la casa (ahí se detecta que el jugador quiere entrar). */
export function puertaDeLote(lote: number): Punto {
  const p = posicionDeLote(lote);
  return { x: p.x + PUERTA_CASA.x, y: p.y + ALTO_CASA + 10 };
}

/** Punto frente al lote disponible (centro de su borde inferior). */
export function frenteDeLote(lote: number): Punto {
  const p = posicionDeLote(lote);
  return { x: p.x + ANCHO_CASA / 2, y: p.y + ALTO_CASA + 10 };
}

export function topeDeFila(fila: number): number {
  return PRIMERA_FILA_Y + fila * ALTO_FILA;
}

/** Franja de la calle de una fila. */
export function calleDeFila(fila: number): { y: number; alto: number } {
  return { y: topeDeFila(fila) + CALLE_DESDE, alto: ALTO_CALLE };
}

/** Lotes que caben en una fila, en orden. */
export function lotesDeFila(fila: number): number[] {
  if (fila === 0) return COLUMNAS_ENTRADA.map((_, i) => i + 1);
  const primero = COLUMNAS_ENTRADA.length + (fila - 1) * COLUMNAS + 1;
  return Array.from({ length: COLUMNAS }, (_, i) => primero + i);
}

/** Filas que hay que mostrar para que entren todos los lotes indicados (como mínimo 2). */
export function filasNecesarias(lotes: Iterable<number>): number {
  let filas = MIN_FILAS;
  for (const l of lotes) filas = Math.max(filas, filaYColumna(l).fila + 1);
  return filas;
}

export function altoVilla(filas: number): number {
  const ultima = calleDeFila(filas - 1);
  return ultima.y + ultima.alto + 60;
}

/** Donde aparece el jugador al llegar a una villa: en la calle, frente al edificio central. */
export const INICIO: Punto = { x: CENTRO_X, y: calleDeFila(0).y + ALTO_CALLE / 2 };

/** Columnas de una fila que no tienen casa porque ahí está la plaza (solo la primera fila). */
export function columnasDeFila(fila: number): readonly number[] {
  return fila === 0 ? COLUMNAS_ENTRADA : Array.from({ length: COLUMNAS }, (_, i) => i);
}
