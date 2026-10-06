import { esBarrio, type Barrio } from '@cryptoville/shared';
import type { ModoVilla } from './EventBus';

const CLAVE = 'cryptoville-villa';
const CLAVE_MODO = 'cryptoville-modo';

/** Modo con el que se empieza: el último usado o «Quiero contratar». */
export function modoGuardado(): ModoVilla {
  try {
    return localStorage.getItem(CLAVE_MODO) === 'trabajar' ? 'trabajar' : 'contratar';
  } catch {
    return 'contratar';
  }
}

export function guardarModo(modo: ModoVilla): void {
  try {
    localStorage.setItem(CLAVE_MODO, modo);
  } catch {
    // Sin almacenamiento local: no pasa nada.
  }
}

/** Villa donde se empieza: la última visitada (si se puede leer) o la Audiovisual. */
export function villaGuardada(): Barrio {
  try {
    const v = localStorage.getItem(CLAVE);
    if (esBarrio(v)) return v;
  } catch {
    // Sin almacenamiento local: se empieza en la villa por defecto.
  }
  return 'audiovisual';
}

export function guardarVilla(barrio: Barrio): void {
  try {
    localStorage.setItem(CLAVE, barrio);
  } catch {
    // Sin almacenamiento local: no pasa nada.
  }
}
