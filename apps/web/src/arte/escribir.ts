// El personaje escribiendo en un libro (mientras «Mis pedidos» está abierto): un libro abierto en las manos y un lápiz.
// Son piezas aparte para animar solo el lápiz (en Phaser con un tween; en la web con CSS).
import { TINTA, envolver } from './svg';

export const ANCHO_LIBRO = 34;
export const ALTO_LIBRO = 22;
export const ANCHO_LAPIZ = 18;
export const ALTO_LAPIZ = 18;

/** Libro abierto visto desde arriba y un poco de frente, con renglones escritos. */
export function crearLibroAbierto(opciones: { tamano?: { ancho: number; alto: number } } = {}): string {
  const cuerpo =
    `<g stroke="${TINTA}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">` +
    // Tapas.
    `<path d="M2 5 Q17 1 17 5 Q17 1 32 5 L32 20 Q17 16 17 20 Q17 16 2 20 Z" fill="#7e3f43"/>` +
    // Hojas.
    `<path d="M3.5 5.5 Q10 3 16.2 5.6 L16.2 18.4 Q10 15.8 3.5 18.4 Z" fill="#fffaf0"/>` +
    `<path d="M30.5 5.5 Q24 3 17.8 5.6 L17.8 18.4 Q24 15.8 30.5 18.4 Z" fill="#fffaf0"/>` +
    `</g>` +
    // Renglones.
    `<g stroke="#b9a98f" stroke-width="1" stroke-linecap="round">` +
    `<path d="M6 8.5 L14 7.6M6 11.2 L14 10.3M6 13.9 L12 13.2"/>` +
    `<path d="M20 7.6 L28 8.5M20 10.3 L28 11.2"/>` +
    `</g>`;
  return envolver(`0 0 ${ANCHO_LIBRO} ${ALTO_LIBRO}`, cuerpo, opciones.tamano);
}

/** Lápiz amarillo en diagonal (la punta abajo a la izquierda). */
export function crearLapiz(opciones: { tamano?: { ancho: number; alto: number } } = {}): string {
  const cuerpo =
    `<g stroke="${TINTA}" stroke-width="1.3" stroke-linejoin="round">` +
    `<path d="M14.5 1.5 L16.5 3.5 L6 14 L4 12 Z" fill="#e9b44c"/>` +
    `<path d="M4 12 L6 14 L2 16 Z" fill="#f3d9b1"/>` +
    `<path d="M14.5 1.5 L16.5 3.5 L17.5 2.5 Q16.5 0.5 15.5 0.5 Z" fill="#e07a5f"/>` +
    `</g>` +
    `<path d="M2 16 L2.9 14.6 L3.4 15.1 Z" fill="${TINTA}"/>`;
  return envolver(`0 0 ${ANCHO_LAPIZ} ${ALTO_LAPIZ}`, cuerpo, opciones.tamano);
}
