import { BARRIOS, type Barrio } from '@cryptoville/shared';

/** Degradado de la portada de cada villa (panel del local y edificio central), como en la muestra. */
export const portadaDe = (b: Barrio) => `linear-gradient(135deg, ${BARRIOS[b].color}, ${BARRIOS[b].colorOscuro})`;

/** Estilo de los chips con el color de la villa. */
export const chipDe = (b: Barrio) => ({ background: BARRIOS[b].colorSuave, color: BARRIOS[b].colorOscuro });
