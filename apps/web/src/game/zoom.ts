/**
 * Zoom entero (para que el pixel art se vea nítido) según el tamaño de la pantalla.
 * Se busca mostrar unas 22 × 14 casillas de 16 px; en celular, menos ancho y más zoom.
 * @deprecated Era el zoom del pueblo con tiles de Kenney. Las villas en vectores usan `zoomVilla`.
 */
export function zoomPara(ancho: number, alto: number): number {
  const porAncho = ancho / (22 * 16);
  const porAlto = alto / (14 * 16);
  return Math.max(2, Math.min(5, Math.floor(Math.min(porAncho, porAlto) * 1.15) || 2));
}

/**
 * Zoom de las villas: píxeles CSS por píxel del mundo (no tiene que ser entero, el arte es vectorial).
 * En escritorio se ven unos 1150 px del mundo de ancho (casi toda la muestra); en celular, unos 540.
 */
export function zoomVilla(anchoCss: number, altoCss: number): number {
  const anchoVisible = anchoCss < 700 ? 540 : 1150;
  const zoom = Math.min(anchoCss / anchoVisible, altoCss / 700);
  return Math.max(0.5, Math.min(1.8, zoom));
}

/**
 * Resolución de las texturas generadas desde SVG: píxeles de textura por píxel del mundo.
 * Sigue al zoom y al devicePixelRatio (en pasos de 0,5) para que no se vean borrosas ni pixeladas.
 */
export function resolucionTexturas(zoomCss: number, dpr: number): number {
  return Math.max(1, Math.min(4, Math.ceil(zoomCss * dpr * 2) / 2));
}
