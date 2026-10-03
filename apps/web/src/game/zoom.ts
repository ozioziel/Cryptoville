/**
 * Zoom entero (para que el pixel art se vea nítido) según el tamaño de la pantalla.
 * Se busca mostrar unas 22 × 14 casillas de 16 px; en celular, menos ancho y más zoom.
 */
export function zoomPara(ancho: number, alto: number): number {
  const porAncho = ancho / (22 * 16);
  const porAlto = alto / (14 * 16);
  return Math.max(2, Math.min(5, Math.floor(Math.min(porAncho, porAlto) * 1.15) || 2));
}
