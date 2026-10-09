// Edificios de la Plaza principal (CVs de usuarios): uno por persona con al menos un local activo.
// - Por fuera: varios pisos (más locales, más pisos), una fachada que sale de la persona (siempre la misma),
//   ventanas con luz y, en la planta baja, el letrero (el nombre lo escribe Phaser encima) y la puerta.
// - Por dentro: una oficina con la placa del nombre, la pared de los cuadros (proyectos destacados),
//   la biblioteca y el escritorio.
// Ocupa el mismo lugar que una casa (ANCHO_CASA × ALTO_CASA) y su puerta está donde la de las casas
// (PUERTA_CASA), así el plano de la villa sirve tal cual para la Plaza.
import { ALTO_CASA, ALTO_INTERIOR, ANCHO_CASA, ANCHO_INTERIOR, PUERTA_CASA } from './casa';
import { TINTA, aclarar, azar, envolver, hashTexto, oscurecer } from './svg';

const DORADO = '#e9b44c';
const CREMA = '#fdf6e3';
const PIZARRA = '#3f4a5c';

/** Fachadas posibles (piedra, arena, ladrillo, pizarra clara, terracota suave y salvia). */
export const FACHADAS_EDIFICIO = ['#e9e4da', '#dcc9ab', '#c98a6b', '#c3cdda', '#d9b9a0', '#cfd8c4'] as const;

/** Dónde se para la persona: frente a la vidriera, para no tapar la puerta. */
export const DUENO_EDIFICIO = { x: 46 } as const;

const ALTO_PLANTA_BAJA = 50;
const ALTO_PISO = 26;
const ALTO_CORNISA = 16;

/** Arriba de la fachada: el borde superior del edificio según sus pisos. */
function topeEdificio(pisos: number): number {
  return ALTO_CASA - ALTO_PLANTA_BAJA - (Math.max(2, Math.min(5, Math.floor(pisos))) - 1) * ALTO_PISO;
}

/**
 * El letrero con el nombre va en la cornisa (arriba de todo), así la persona parada en la vereda no lo tapa.
 * Phaser escribe el nombre centrado en (x, y), en letra clara.
 */
export function letreroEdificio(pisos: number): { x: number; y: number; ancho: number } {
  return { x: 75, y: topeEdificio(pisos) - ALTO_CORNISA / 2 + 1, ancho: 120 };
}

/** Pisos del edificio (planta baja incluida) según los locales activos: 2 con uno, hasta 5. */
export function pisosEdificio(locales: number): number {
  return Math.max(2, Math.min(5, 1 + Math.max(1, Math.floor(locales))));
}

export interface DatosEdificio {
  /** Lo que elige la fachada y las luces (el id de la persona: siempre el mismo dibujo). */
  semilla: string;
  pisos: number;
}

export function crearEdificioPersona(d: DatosEdificio, opciones: { tamano?: { ancho: number; alto: number }; titulo?: string } = {}): string {
  const r = azar(hashTexto(d.semilla));
  const fachada = FACHADAS_EDIFICIO[Math.floor(r() * FACHADAS_EDIFICIO.length)];
  const pisos = Math.max(2, Math.min(5, Math.floor(d.pisos)));
  const base = ALTO_CASA - ALTO_PLANTA_BAJA;
  const tope = topeEdificio(pisos);
  const borde = oscurecer(fachada, 0.18);
  const vidrio = '#a9c7e0';
  const luz = '#fbe7b0';

  const ventanas: string[] = [];
  for (let p = 1; p < pisos; p++) {
    const y = base - p * ALTO_PISO + 6;
    for (const x of [20, 62, 104]) {
      const encendida = r() < 0.45;
      ventanas.push(
        `<rect x="${x}" y="${y}" width="26" height="15" rx="2" fill="${encendida ? luz : vidrio}" stroke-width="1.6"/>` +
          `<path d="M${x + 13} ${y}V${y + 15}" stroke-width="1.2"/>` +
          (encendida ? '' : `<path d="M${x + 4} ${y + 11}L${x + 9} ${y + 4}" stroke="#fff" stroke-width="1.6" opacity=".6"/>`),
      );
    }
    // Moldura entre pisos.
    ventanas.push(`<path d="M8 ${base - p * ALTO_PISO + ALTO_PISO}H142" stroke="${borde}" stroke-width="2"/>`);
  }

  const puertaX = PUERTA_CASA.x;
  const partes = [
    `<ellipse cx="75" cy="170" rx="66" ry="4" fill="${TINTA}" opacity=".12"/>`,
    `<g stroke="${TINTA}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round">`,
    // Cuerpo, con su sombra a la derecha.
    `<rect x="8" y="${tope}" width="134" height="${ALTO_CASA - tope - 2}" fill="${fachada}"/>`,
    `<rect x="128" y="${tope + 2}" width="12" height="${ALTO_CASA - tope - 6}" fill="${oscurecer(fachada, 0.12)}" stroke="none"/>`,
    // Cornisa (con el letrero del nombre) y azotea con su asta y la bandera dorada.
    `<path d="M128 ${tope - ALTO_CORNISA}V${tope - ALTO_CORNISA - 20}" stroke-width="2"/>`,
    `<path d="M128 ${tope - ALTO_CORNISA - 20}L142 ${tope - ALTO_CORNISA - 15}L128 ${tope - ALTO_CORNISA - 10}Z" fill="${DORADO}" stroke-width="1.6"/>`,
    `<rect x="4" y="${tope - ALTO_CORNISA}" width="142" height="${ALTO_CORNISA + 2}" rx="2" fill="${PIZARRA}"/>`,
    `<path d="M10 ${tope - 2}H140" stroke="${DORADO}" stroke-width="1.4"/>`,
    ...ventanas,
    // Planta baja: un toldo a rayas, la vidriera y la puerta.
    `<rect x="8" y="${base}" width="134" height="${ALTO_PLANTA_BAJA - 2}" fill="${aclarar(fachada, 0.15)}"/>`,
    `<path d="M12 ${base + 3}H138L134 ${base + 16}H16Z" fill="${CREMA}" stroke-width="1.8"/>`,
    `<path d="${Array.from({ length: 6 }, (_, i) => `M${24 + i * 20} ${base + 4}L${22 + i * 20} ${base + 15}`).join('')}" stroke="${PIZARRA}" stroke-width="7" opacity=".35"/>`,
    `<rect x="16" y="${base + 24}" width="66" height="22" rx="2" fill="${vidrio}" stroke-width="1.8"/>`,
    `<path d="M38 ${base + 24}V${base + 46}M60 ${base + 24}V${base + 46}" stroke-width="1.2"/>`,
    `<path d="M${puertaX - 14} ${ALTO_CASA - 2}V${base + 30}Q${puertaX - 14} ${base + 21} ${puertaX} ${base + 21}Q${puertaX + 14} ${base + 21} ${puertaX + 14} ${base + 30}V${ALTO_CASA - 2}Z" fill="${PIZARRA}"/>`,
    `<path d="M${puertaX} ${base + 21}V${ALTO_CASA - 2}" stroke="${aclarar(PIZARRA, 0.3)}" stroke-width="1.4"/>`,
    `</g>`,
    `<circle cx="${puertaX + 6}" cy="${base + 37}" r="1.8" fill="${DORADO}"/>`,
    // Escalón de piedra.
    `<rect x="${puertaX - 18}" y="${ALTO_CASA - 4}" width="36" height="4" rx="1" fill="#d9d4ca"/>`,
  ];
  return envolver(`0 0 ${ANCHO_CASA} ${ALTO_CASA}`, partes.join(''), opciones.tamano, opciones.titulo);
}

/**
 * Interior del edificio (480 × 300, igual que el de los locales): pared de pizarra clara con zócalo,
 * la placa del nombre al centro (la escribe Phaser), los cuadros a los lados (los pone Phaser),
 * la biblioteca a la izquierda, el escritorio a la derecha y una alfombra. El centro queda libre.
 */
export function crearInteriorEdificio(opciones: { tamano?: { ancho: number; alto: number }; titulo?: string } = {}): string {
  const muro = '#dfe5ec';
  const madera = '#b98a62';
  const tablas: string[] = [];
  for (let y = 124, fila = 0; y < 300; y += 20, fila++) {
    const cortes: string[] = [];
    for (let x = (fila % 2) * 60 + 90; x < 480; x += 120) cortes.push(`M${x} ${y - 20}V${y}`);
    tablas.push(`M0 ${y}H480 ${cortes.join(' ')}`);
  }
  const libros = (x: number, y: number) =>
    ['#e07a5f', '#5d9b78', '#3d85c6', '#e9b44c', '#a95656', '#5f6f86']
      .map((c, i) => `<rect x="${x + i * 9}" y="${y + (i % 2) * 3}" width="8" height="${22 - (i % 2) * 3}" fill="${c}" stroke-width="1.2"/>`)
      .join('');
  const partes = [
    `<rect x="0" y="104" width="480" height="196" fill="${madera}"/>`,
    `<path d="${tablas.join(' ')}" stroke="${oscurecer(madera, 0.18)}" stroke-width="1.4" fill="none"/>`,
    `<g stroke="${TINTA}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round">`,
    `<rect x="0" y="0" width="480" height="104" fill="${muro}"/>`,
    `<rect x="0" y="0" width="480" height="8" fill="${PIZARRA}"/>`,
    `<rect x="0" y="86" width="480" height="18" fill="${aclarar(PIZARRA, 0.55)}"/>`,
    `<path d="M0 92H480" stroke="${DORADO}" stroke-width="2"/>`,
    // Placa del nombre.
    `<rect x="160" y="16" width="160" height="30" rx="6" fill="${CREMA}" stroke-width="2"/>`,
    `<path d="M168 41H312" stroke="${DORADO}" stroke-width="2" opacity=".8"/>`,
    // Alfombra.
    `<rect x="150" y="196" width="180" height="76" rx="8" fill="#5f6f86"/><rect x="160" y="204" width="160" height="60" rx="5" fill="none" stroke="${aclarar('#5f6f86', 0.45)}" stroke-width="2"/>`,
    // Biblioteca (izquierda).
    `<rect x="28" y="112" width="84" height="104" rx="3" fill="#8a5a44"/>`,
    `<path d="M28 146H112M28 180H112" stroke-width="2"/>`,
    libros(34, 120),
    libros(40, 154),
    libros(34, 188),
    // Escritorio con la computadora y la taza (derecha).
    `<rect x="344" y="160" width="104" height="14" rx="3" fill="#a0714f"/>`,
    `<rect x="352" y="174" width="10" height="40" fill="#8a5a44"/><rect x="430" y="174" width="10" height="40" fill="#8a5a44"/>`,
    `<rect x="372" y="128" width="46" height="30" rx="3" fill="${PIZARRA}"/><rect x="377" y="133" width="36" height="20" rx="2" fill="#a9c7e0" stroke-width="1.4"/>`,
    `<path d="M390 158H400" stroke-width="3"/>`,
    `<rect x="428" y="148" width="10" height="12" rx="2" fill="${CREMA}" stroke-width="1.6"/>`,
    // Planta junto a la puerta.
    `<rect x="62" y="252" width="24" height="24" rx="3" fill="#c97b5a"/>`,
    `<circle cx="66" cy="244" r="11" fill="#7cbf6b"/><circle cx="82" cy="240" r="11" fill="#8fc47a"/><circle cx="74" cy="230" r="9" fill="#7cbf6b"/>`,
    // Paredes laterales y la puerta (abajo al centro).
    `<rect x="0" y="0" width="16" height="300" fill="${oscurecer(muro, 0.3)}"/><rect x="464" y="0" width="16" height="300" fill="${oscurecer(muro, 0.3)}"/>`,
    `<rect x="0" y="286" width="208" height="14" fill="${oscurecer(muro, 0.3)}"/><rect x="272" y="286" width="208" height="14" fill="${oscurecer(muro, 0.3)}"/>`,
    `<rect x="214" y="282" width="52" height="14" rx="3" fill="${DORADO}" stroke-width="2"/>`,
    `</g>`,
  ];
  return envolver(`0 0 ${ANCHO_INTERIOR} ${ALTO_INTERIOR}`, partes.join(''), opciones.tamano, opciones.titulo);
}
