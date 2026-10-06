import Phaser from 'phaser';

/** Fuente de toda la interfaz y de los textos del mapa. */
export const FUENTE = '"Plus Jakarta Sans", system-ui, sans-serif';

const pendientes = new Map<string, Promise<boolean>>();
const usos = new Map<string, number>();

/** Dibuja un SVG en un canvas del tamaño pedido (el SVG ya trae ese tamaño en width/height). */
async function rasterizar(svg: string, ancho: number, alto: number): Promise<HTMLCanvasElement> {
  const img = new Image();
  img.decoding = 'async';
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = ancho;
  canvas.height = alto;
  canvas.getContext('2d')!.drawImage(img, 0, 0, ancho, alto);
  return canvas;
}

/**
 * Crea (una sola vez) la textura `clave` a partir de un SVG.
 * - `ancho` y `alto` son el tamaño en el mundo; la textura se genera `resolucion` veces más grande
 *   y el objeto se muestra con escala 1 / resolucion, así se ve nítida con cualquier zoom.
 * - Devuelve false si el SVG no se pudo dibujar (el juego sigue sin ese adorno).
 */
export function asegurarTextura(
  escena: Phaser.Scene,
  clave: string,
  crearSvg: (tamano: { ancho: number; alto: number }) => string,
  ancho: number,
  alto: number,
  resolucion: number,
): Promise<boolean> {
  const texturas = escena.textures;
  if (texturas.exists(clave)) return Promise.resolve(true);
  let p = pendientes.get(clave);
  if (!p) {
    const tamano = { ancho: Math.ceil(ancho * resolucion), alto: Math.ceil(alto * resolucion) };
    p = rasterizar(crearSvg(tamano), tamano.ancho, tamano.alto)
      .then((canvas) => {
        if (!texturas.exists(clave)) texturas.addCanvas(clave, canvas);
        // Si mientras se dibujaba ya nadie la usa, no se guarda.
        if (!usos.get(clave) && !permanentes.has(clave)) texturas.remove(clave);
        return true;
      })
      .catch((e) => {
        console.warn(`No se pudo dibujar la textura ${clave}`, e);
        return false;
      })
      .finally(() => pendientes.delete(clave));
    pendientes.set(clave, p);
  }
  return p;
}

const permanentes = new Set<string>();

/** Textura que se usa siempre (árboles, faroles, edificios): no se borra al dejar de verse. */
export function marcarPermanente(clave: string): void {
  permanentes.add(clave);
}

/** Cuenta un uso de la textura (casas y personas que están cerca de la cámara). */
export function usarTextura(clave: string): void {
  usos.set(clave, (usos.get(clave) ?? 0) + 1);
}

/** Deja de usar la textura; si nadie más la usa, se libera la memoria. */
export function soltarTextura(escena: Phaser.Scene, clave: string): void {
  if (!usos.has(clave)) return;
  const n = usos.get(clave)! - 1;
  if (n > 0) {
    usos.set(clave, n);
    return;
  }
  usos.delete(clave);
  if (!permanentes.has(clave) && !pendientes.has(clave) && escena.textures.exists(clave)) escena.textures.remove(clave);
}

/** Texto nítido con la fuente de la interfaz. */
export function texto(
  escena: Phaser.Scene,
  x: number,
  y: number,
  contenido: string,
  estilo: { tamano: number; peso?: number; color: string; espaciado?: number },
  resolucion: number,
): Phaser.GameObjects.Text {
  return escena.add
    .text(x, y, contenido, {
      fontFamily: FUENTE,
      fontSize: `${estilo.tamano}px`,
      fontStyle: String(estilo.peso ?? 700),
      color: estilo.color,
      resolution: Math.max(1, Math.ceil(resolucion)),
    })
    .setLetterSpacing(estilo.espaciado ?? 0)
    .setOrigin(0.5);
}
