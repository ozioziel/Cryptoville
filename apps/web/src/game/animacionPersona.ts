import type { AparienciaPersona } from '@cryptoville/shared';
import type Phaser from 'phaser';
import { crearPersona } from '../arte/persona';
import { asegurarTextura } from './texturas';

export type RumboPersona = 'frente' | 'derecha' | 'izquierda' | 'espalda';
export const CUADROS_PASO = 8;
export const MS_PASO = 90;

export function rumboPersona(dx: number, dy: number, anterior: RumboPersona): RumboPersona {
  if (Math.hypot(dx, dy) < .15) return anterior;
  return Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'izquierda' : 'derecha') : (dy < 0 ? 'espalda' : 'frente');
}

export function cuadroPersona(rumbo: RumboPersona, caminando: boolean, tiempo: number): string {
  return `${rumbo}-${caminando && rumbo !== 'frente' ? 1 + Math.floor(Math.max(0, tiempo) / MS_PASO) % CUADROS_PASO : 0}`;
}

/** Una sola textura por apariencia: reposo frontal y nueve cuadros para cada perfil y la espalda. */
export async function asegurarPersona(escena: Phaser.Scene, clave: string, a: AparienciaPersona, ancho: number, alto: number, resolucion: number): Promise<boolean> {
  const w = Math.ceil(ancho * resolucion);
  const h = Math.ceil(alto * resolucion);
  const cuadros: { direccion: RumboPersona; paso?: number }[] = [
    { direccion: 'frente' },
    ...(['derecha', 'izquierda', 'espalda'] as const).flatMap((direccion) => [
      { direccion }, ...Array.from({ length: CUADROS_PASO }, (_, paso) => ({ direccion, paso })),
    ]),
  ];
  const filas = Math.ceil(cuadros.length / 5);
  const ok = await asegurarTextura(escena, clave, () => {
    const contenido = cuadros.map((o, i) => crearPersona(a, { ...o, tamano: { ancho: w, alto: h } })
      .replace('<svg ', `<svg x="${i % 5 * w}" y="${Math.floor(i / 5) * h}" `)).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w * 5}" height="${h * filas}" viewBox="0 0 ${w * 5} ${h * filas}">${contenido}</svg>`;
  }, w * 5, h * filas, 1);
  if (!ok || !escena.textures.exists(clave)) return false;
  const textura = escena.textures.get(clave);
  if (!textura.has('frente-0')) {
    cuadros.forEach((o, i) => textura.add(`${o.direccion}-${o.paso === undefined ? 0 : o.paso + 1}`, 0, i % 5 * w, Math.floor(i / 5) * h, w, h));
    // Los retratos estáticos que usan esta textura mantienen el tamaño de un personaje.
    textura.get('__BASE').setSize(w, h, 0, 0);
  }
  return true;
}
