// Utilidades para armar los dibujos en SVG (personas, casas y villas).

/** Contorno de todo el arte: el mismo de la muestra aprobada. */
export const TINTA = '#3b2a25';

function aRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function aHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
}

/** Mezcla dos colores (t = 0 → a, t = 1 → b). */
export function mezclar(a: string, b: string, t: number): string {
  const x = aRgb(a);
  const y = aRgb(b);
  return aHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

export const oscurecer = (color: string, t = 0.22) => mezclar(color, '#2a1d19', t);
export const aclarar = (color: string, t = 0.3) => mezclar(color, '#ffffff', t);

/** ¿Conviene texto claro sobre este color? */
export function esOscuro(color: string): boolean {
  const [r, g, b] = aRgb(color);
  return 0.299 * r + 0.587 * g + 0.114 * b < 140;
}

/** Envuelve el contenido en un <svg> con su viewBox y, si se pide, un tamaño en píxeles. */
export function envolver(viewBox: string, contenido: string, tamano?: { ancho: number; alto: number }, titulo?: string): string {
  const medidas = tamano ? ` width="${tamano.ancho}" height="${tamano.alto}"` : '';
  const accesible = titulo ? ` role="img" aria-label="${escaparTexto(titulo)}"` : ' aria-hidden="true"';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"${medidas}${accesible}>${contenido}</svg>`;
}

/** Texto seguro dentro de un SVG (nombres de locales que escribe la gente). */
export function escaparTexto(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Generador pseudoaleatorio con semilla: el mismo número siempre da el mismo dibujo. */
export function azar(semilla: number): () => number {
  let s = semilla >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10_000) / 10_000;
  };
}

/** Hash corto de un texto (para claves de texturas y semillas). */
export function hashTexto(texto: string): number {
  let h = 5381;
  for (let i = 0; i < texto.length; i++) h = ((h << 5) + h + texto.charCodeAt(i)) | 0;
  return h >>> 0;
}
