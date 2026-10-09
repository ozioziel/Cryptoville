// La Plaza principal (CVs de usuarios): un «lugar» más del mapa, solo en el modo «Quiero contratar».
// No es una villa: no tiene locales ni «Se busca», sino un edificio por persona con al menos un local
// activo (su CV). En la base no hay un barrio «plaza»: el lote de cada edificio es `usuarios.lote_plaza`.
import { BARRIOS, LISTA_BARRIOS, type Barrio } from './types/index.js';

/** Un lugar del mapa: una de las 4 villas o la Plaza principal. */
export type Lugar = Barrio | 'plaza';

export const PLAZA = {
  nombre: 'Plaza',
  nombreLargo: 'Plaza principal',
  descripcion: 'Los CVs de quienes trabajan en WorkVille: un edificio por persona, con sus locales',
  // Paleta propia y neutra (piedra y pizarra con detalles dorados) que combina con las cuatro villas.
  color: '#5f6f86',
  colorOscuro: '#3f4a5c',
  colorSuave: '#e6eaf0',
} as const;

/** Lugares en el orden del selector: la Plaza va primero. */
export const LISTA_LUGARES: readonly Lugar[] = ['plaza', ...LISTA_BARRIOS];

export function esLugar(valor: unknown): valor is Lugar {
  return valor === 'plaza' || (typeof valor === 'string' && valor in BARRIOS);
}

/** «Plaza» o el nombre de la villa («Creativo»). Con `nombreSector` da «Plaza B», «Creativo C»… */
export function nombreLugar(lugar: Lugar): string {
  return lugar === 'plaza' ? PLAZA.nombre : BARRIOS[lugar].nombre;
}

/** «Plaza principal» o «Villa Creativo». */
export function tituloLugar(lugar: Lugar): string {
  return lugar === 'plaza' ? PLAZA.nombreLargo : `Villa ${BARRIOS[lugar].nombre}`;
}

export function colorLugar(lugar: Lugar): { color: string; colorOscuro: string; colorSuave: string } {
  return lugar === 'plaza' ? PLAZA : BARRIOS[lugar];
}
