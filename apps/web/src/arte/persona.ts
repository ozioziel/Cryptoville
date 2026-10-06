// Personas en vectores, al estilo de los personajes de Kenney Tiny Dungeon que usaba el pueblo:
// cabeza grande (casi la mitad de la altura), pelo que enmarca la cara, ojos ovalados sin boca,
// cuerpo corto, manos redondas a los lados, botas y contorno oscuro.
// El modelo es la vecina de la muestra aprobada (docs/propuestas/estilo-visual).
//
// `crearPersona` es una función pura: recibe la apariencia y devuelve el SVG como texto.
// La usan React (componente Avatar y editor del perfil) y Phaser (texturas del jugador y de los dueños).
import {
  CATALOGO_PERSONA,
  colorDe,
  normalizarAparienciaPersona,
  type AparienciaPersona,
} from '@cryptoville/shared';
import { TINTA, aclarar, envolver, oscurecer } from './svg';

/** Tamaño del dibujo completo (el mismo viewBox de la vecina de la muestra). */
export const ANCHO_PERSONA = 60;
export const ALTO_PERSONA = 92;

export interface OpcionesPersona {
  /** 'cuerpo' (por defecto) o 'cabeza' (recorte de la cara para avatares). */
  recorte?: 'cuerpo' | 'cabeza';
  /** Tamaño en píxeles (para rasterizar en Phaser). */
  tamano?: { ancho: number; alto: number };
  titulo?: string;
}

const MANGA_CORTA = new Set(['polera', 'polera-codigo']);
/** Peinados que dejan ver las orejas. */
const CON_OREJAS = new Set(['corto', 'lateral', 'rapado', 'calvo', 'recogido']);

export function crearPersona(apariencia: AparienciaPersona | null | undefined, opciones: OpcionesPersona = {}): string {
  // Se normaliza siempre: el SVG solo usa valores del catálogo (nunca texto que venga de la base).
  const a = normalizarAparienciaPersona(apariencia ?? undefined);
  const piel = colorDe(CATALOGO_PERSONA.piel, a.piel);
  const pelo = colorDe(CATALOGO_PERSONA.colorPelo, a.colorPelo);
  const ropa = colorDe(CATALOGO_PERSONA.colorArriba, a.colorArriba);
  const abajo = colorDe(CATALOGO_PERSONA.colorAbajo, a.colorAbajo);
  const zapato = colorDe(CATALOGO_PERSONA.zapatos, a.zapatos);
  const gorro = colorDe(CATALOGO_PERSONA.colorGorro, a.colorGorro);
  const vestido = a.arriba === 'vestido';

  const partes = [
    `<ellipse cx="30" cy="88" rx="16" ry="3.5" fill="${TINTA}" opacity=".18"/>`,
    `<g stroke="${TINTA}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">`,
    peloAtras(a.peinado, pelo),
    CON_OREJAS.has(a.peinado) ? orejas(piel) : '',
    piernas(vestido ? 'vestido' : a.abajo, abajo, piel),
    zapatos(a.zapatos, zapato),
    vestido ? '' : ropaAbajo(a.abajo, abajo),
    torso(a.arriba, ropa),
    brazos(a.arriba, ropa, piel),
    objeto(a.objeto),
    manos(piel),
    `<ellipse cx="30" cy="27" rx="17" ry="16" fill="${piel}"/>`,
    barba(a.barba, pelo),
    peloAdelante(a.peinado, pelo),
    gorroDe(a.gorro, gorro),
    `</g>`,
    a.lentes === 'sol' ? '' : `<ellipse cx="24" cy="31" rx="1.7" ry="2.5" fill="${TINTA}"/><ellipse cx="36" cy="31" rx="1.7" ry="2.5" fill="${TINTA}"/>`,
    lentes(a.lentes),
  ];
  const viewBox = opciones.recorte === 'cabeza' ? '8 2 44 44' : `0 0 ${ANCHO_PERSONA} ${ALTO_PERSONA}`;
  return envolver(viewBox, partes.join(''), opciones.tamano, opciones.titulo);
}

function peloAtras(peinado: string, c: string): string {
  switch (peinado) {
    case 'largo':
      return `<path d="M11 30C9 13 20 4 30 4C40 4 51 13 49 30L50 52Q45 57 40 52V42H20V52Q15 57 10 52Z" fill="${c}"/>`;
    case 'melena':
      return `<path d="M11 30C9 13 20 4 30 4C40 4 51 13 49 30L49.5 43Q45 47.5 40 43V40H20V43Q15 47.5 10.5 43Z" fill="${c}"/>`;
    case 'rizado':
      return `<path d="M9 30C5 24 9 15 15 13C16 6 25 3 30 6C35 3 44 6 45 13C51 15 55 24 51 30C55 36 51 43 46 42C44 46 37 46 35 43H25C23 46 16 46 14 42C9 43 5 36 9 30Z" fill="${c}"/>`;
    case 'recogido':
      return `<circle cx="30" cy="7.5" r="5.5" fill="${c}"/>`;
    default:
      return '';
  }
}

function orejas(piel: string): string {
  return `<ellipse cx="13.6" cy="30" rx="3" ry="3.8" fill="${piel}" stroke-width="1.6"/><ellipse cx="46.4" cy="30" rx="3" ry="3.8" fill="${piel}" stroke-width="1.6"/>`;
}

function piernas(abajo: string, color: string, piel: string): string {
  const relleno = abajo === 'pantalon' ? color : piel;
  return `<path d="M25 64V80M35 64V80" stroke-width="10"/><path d="M25 64V80M35 64V80" stroke="${relleno}" stroke-width="6"/>`;
}

function zapatos(tipo: string, c: string): string {
  if (tipo.startsWith('botas')) {
    return `<rect x="20" y="75.5" width="9.6" height="10.5" rx="2.6" fill="${c}"/><rect x="30.4" y="75.5" width="9.6" height="10.5" rx="2.6" fill="${c}"/>`;
  }
  if (tipo.startsWith('zapatillas')) {
    const suela = tipo === 'zapatillas-blancas' ? '#cfc6bb' : '#f4efe6';
    return (
      `<rect x="19.4" y="79.5" width="10.6" height="6.5" rx="3" fill="${c}"/><rect x="30" y="79.5" width="10.6" height="6.5" rx="3" fill="${c}"/>` +
      `<path d="M20.4 84.2H29M31 84.2H39.6" stroke="${suela}" stroke-width="1.4"/>`
    );
  }
  return `<rect x="19.8" y="80.2" width="10" height="5.8" rx="2.8" fill="${c}"/><rect x="30.2" y="80.2" width="10" height="5.8" rx="2.8" fill="${c}"/>`;
}

function ropaAbajo(tipo: string, c: string): string {
  switch (tipo) {
    case 'falda':
      return `<path d="M18 61Q30 63.5 42 61L45 75Q30 78.5 15 75Z" fill="${c}"/><path d="M22 66.5L21 74M30 67V76.5M38 66.5L39 74" stroke="${oscurecer(c, 0.18)}" stroke-width="1.2" fill="none"/>`;
    case 'short':
      return `<path d="M17.6 61Q30 63.5 42.4 61L43 71.5H31.4L30 67.5L28.6 71.5H17Z" fill="${c}"/>`;
    default:
      return `<path d="M17.8 61Q30 63.5 42.2 61L41.6 69.5Q30 70.8 18.4 69.5Z" fill="${c}"/>`;
  }
}

const TORSO = 'M19.5 45Q30 40 40.5 45L42.6 64Q30 67 17.4 64Z';

function torso(tipo: string, c: string): string {
  const os = oscurecer(c, 0.22);
  const claro = '#fdf6e3';
  switch (tipo) {
    case 'vestido':
      return `<path d="M19.5 45Q30 40 40.5 45L44 76Q30 80 16 76Z" fill="${c}"/><path d="M17.6 64Q30 67 42.4 64" stroke="${os}" stroke-width="2.5" fill="none"/>`;
    case 'polera':
      return `<path d="${TORSO}" fill="${c}"/><path d="M26 42.6Q30 46.5 34 42.6" stroke="${os}" stroke-width="1.6" fill="none"/>`;
    case 'polera-codigo':
      return (
        `<path d="${TORSO}" fill="${c}"/><path d="M26 42.6Q30 46.5 34 42.6" stroke="${os}" stroke-width="1.6" fill="none"/>` +
        `<path d="M25.2 52.5L22.6 55.3L25.2 58.1M34.8 52.5L37.4 55.3L34.8 58.1M31.6 51.6L28.4 59" stroke="${claro}" stroke-width="1.7" fill="none"/>`
      );
    case 'camisa':
      return (
        `<path d="${TORSO}" fill="${c}"/><path d="M30 47V64" stroke="${os}" stroke-width="1.2" fill="none"/>` +
        `<path d="M25.4 42.2L30 47.4L26.6 49.6Z" fill="${aclarar(c, 0.35)}" stroke-width="1.4"/><path d="M34.6 42.2L30 47.4L33.4 49.6Z" fill="${aclarar(c, 0.35)}" stroke-width="1.4"/>` +
        `<g fill="${claro}" stroke="none"><circle cx="30" cy="52" r=".95"/><circle cx="30" cy="56" r=".95"/><circle cx="30" cy="60" r=".95"/></g>`
      );
    case 'sueter':
      return (
        `<path d="${TORSO}" fill="${c}"/><path d="M17.7 61Q30 64 42.3 61L42.6 64Q30 67 17.4 64Z" fill="${os}" stroke-width="1.4"/>` +
        `<path d="M25 43Q30 47.5 35 43" stroke="${os}" stroke-width="2.6" fill="none"/>` +
        `<path d="M24 53Q30 55 36 53" stroke="${os}" stroke-width="1" fill="none" opacity=".6"/>`
      );
    case 'sudadera':
      return (
        `<path d="M21 46.5Q18.6 41 23 39.4Q30 37 37 39.4Q41.4 41 39 46.5Z" fill="${os}"/>` +
        `<path d="${TORSO}" fill="${c}"/><path d="M23.5 56.5H36.5L35.6 62.5H24.4Z" fill="${os}" stroke-width="1.4"/>` +
        `<path d="M28 45.5V50.5M32 45.5V50.5" stroke="${claro}" stroke-width="1.3" fill="none"/>`
      );
    case 'chaqueta':
      return (
        `<path d="${TORSO}" fill="#f4efe6"/>` +
        `<path d="M19.5 45Q24.5 42.4 27.2 42.4L29.2 64.9Q23 65.6 17.4 64Z" fill="${c}"/><path d="M40.5 45Q35.5 42.4 32.8 42.4L30.8 64.9Q37 65.6 42.6 64Z" fill="${c}"/>` +
        `<path d="M27.2 42.4L25.4 49.4L28.4 51.4M32.8 42.4L34.6 49.4L31.6 51.4" stroke="${os}" stroke-width="1.3" fill="none"/>`
      );
    case 'delantal':
      return (
        `<path d="${TORSO}" fill="${c}"/>` +
        `<path d="M22.2 46.5L20.6 43M37.8 46.5L39.4 43" stroke-width="1.6" fill="none"/>` +
        `<path d="M22 46.5H38L39.6 67Q30 69 20.4 67Z" fill="#efe3cf"/><path d="M24 57H36" stroke="#cbbba3" stroke-width="1.2" fill="none"/>` +
        `<g stroke="none"><circle cx="26" cy="51" r="1.6" fill="#e07a5f"/><circle cx="33.5" cy="53" r="1.3" fill="#3d85c6"/><circle cx="29" cy="62" r="1.5" fill="#e9b44c"/><circle cx="35" cy="61" r="1" fill="#5d9b78"/></g>`
      );
    default:
      return `<path d="${TORSO}" fill="${c}"/>`;
  }
}

function brazos(tipo: string, c: string, piel: string): string {
  const linea = 'M20 48L16.5 60M40 48L43.5 60';
  if (MANGA_CORTA.has(tipo)) {
    return `<path d="${linea}" stroke-width="9"/><path d="${linea}" stroke="${piel}" stroke-width="5"/><path d="M20 48L18.9 52.2M40 48L41.1 52.2" stroke="${c}" stroke-width="5"/>`;
  }
  return `<path d="${linea}" stroke-width="9"/><path d="${linea}" stroke="${c}" stroke-width="5"/>`;
}

function manos(piel: string): string {
  return `<circle cx="16" cy="62.5" r="3.6" fill="${piel}" stroke-width="1.5"/><circle cx="44" cy="62.5" r="3.6" fill="${piel}" stroke-width="1.5"/>`;
}

function objeto(tipo: string): string {
  switch (tipo) {
    case 'camara':
      return (
        `<path d="M23 46L28 55M37 46L32 55" stroke-width="1.4" fill="none"/>` +
        `<rect x="23.5" y="53.5" width="13" height="9" rx="2" fill="#4b4048" stroke-width="1.5"/><circle cx="30" cy="58" r="2.8" fill="#8aa0c8" stroke-width="1.2"/>`
      );
    case 'laptop':
      return `<rect x="19.6" y="53" width="20.8" height="12.5" rx="2" fill="#b9c2cc" stroke-width="1.5"/><circle cx="30" cy="59.2" r="1.7" fill="#fdf6e3" stroke-width="1"/>`;
    case 'libro':
      return (
        `<rect x="22" y="52" width="15.5" height="11.5" rx="1.6" fill="#5d9b78" stroke-width="1.5"/><path d="M24.6 52V63.5" stroke-width="1.2" fill="none"/>` +
        `<rect x="27" y="54.6" width="8" height="3" rx=".8" fill="#fdf6e3" stroke-width="1"/>`
      );
    case 'tableta':
      return (
        `<rect x="19.6" y="53" width="20.8" height="12.5" rx="2" fill="#4b4048" stroke-width="1.5"/><rect x="22" y="55.3" width="16" height="8" rx="1" fill="#8aa0c8" stroke-width="1"/>` +
        `<path d="M44 62L48.4 52.4" stroke-width="3.6"/><path d="M44 62L48.4 52.4" stroke="#e07a5f" stroke-width="1.6"/>`
      );
    case 'pincel':
      return (
        `<path d="M44.4 63L48.6 50.2" stroke-width="4.4"/><path d="M44.4 63L48.6 50.2" stroke="#b07a52" stroke-width="2.2"/>` +
        `<path d="M47.4 51.2L49.9 52L51 47.8Q50.6 44.4 49.8 43.6Q48.6 44.6 47.6 47.6Z" fill="#e07a5f" stroke-width="1.4"/>`
      );
    case 'taza':
      return (
        `<path d="M50 58.2Q53 58.2 53 60.6Q53 63 50 63" stroke-width="1.6" fill="none"/><rect x="42.6" y="56.4" width="7.6" height="8" rx="1.8" fill="#fdf6e3" stroke-width="1.5"/>` +
        `<path d="M45 54.2Q44 52.6 45 51M48 54.2Q47 52.6 48 51" stroke="#7a6a5f" stroke-width="1" fill="none" opacity=".7"/>`
      );
    case 'microfono':
      return (
        `<path d="M44 64L45.8 55.4" stroke-width="4.6"/><path d="M44 64L45.8 55.4" stroke="#4b4048" stroke-width="2.4"/>` +
        `<circle cx="46.3" cy="52.4" r="3.6" fill="#aab3c0" stroke-width="1.5"/><path d="M44 51.6H48.6M44.4 53.4H48.2" stroke="#7a6a5f" stroke-width=".9" fill="none"/>`
      );
    default:
      return '';
  }
}

function barba(tipo: string, c: string): string {
  const bigote = `<path d="M24 36.6C26 34.6 29 35 30 36.1C31 35 34 34.6 36 36.6C34 38.4 31 38 30 37.1C29 38 26 38.4 24 36.6Z" fill="${c}" stroke-width="1.2"/>`;
  switch (tipo) {
    case 'bigote':
      return bigote;
    case 'candado':
      return `<path d="M25.6 38.4C26.6 40.4 28.2 41.2 30 41.2C31.8 41.2 33.4 40.4 34.4 38.4C34.6 41.8 32.6 43.4 30 43.4C27.4 43.4 25.4 41.8 25.6 38.4Z" fill="${c}" stroke-width="1.2"/>${bigote}`;
    case 'corta':
      return `<path d="M13.6 30C14.4 37.6 20.6 43.2 30 43.2C39.4 43.2 45.6 37.6 46.4 30C44.4 34 41 36.4 37 36.6C34.4 35.2 25.6 35.2 23 36.6C19 36.4 15.6 34 13.6 30Z" fill="${c}" opacity=".45" stroke="none"/>`;
    case 'completa':
      return `<path d="M13.4 29.6C13.6 38.8 20.4 44.6 30 44.6C39.6 44.6 46.4 38.8 46.6 29.6C44.6 33.8 41.2 36 37.2 36.4C34.4 35.4 25.6 35.4 22.8 36.4C18.8 36 15.4 33.8 13.4 29.6Z" fill="${c}"/>${bigote}`;
    default:
      return '';
  }
}

function peloAdelante(peinado: string, c: string): string {
  switch (peinado) {
    case 'largo':
    case 'melena':
      return `<path d="M13 31C11 13 21 5 30 5C39 5 49 13 47 31C45 25 42 21 38 19C33 23 25 25 17 24C15.5 26 14 28 13 31Z" fill="${c}"/>`;
    case 'corto':
      return `<path d="M13.3 27C12 13 21 6 30 6C39 6 48 13 46.7 27C45 22 42 19.5 38 18.5C33 20.5 25 21 19 20C16.5 21.5 14.5 24 13.3 27Z" fill="${c}"/>`;
    case 'lateral':
      return `<path d="M13.3 28C12 13 21 6 30 6C39 6 48 13 46.7 28C45.5 22 43 18 38 16.5C33 20 24 22 18 21.5C16 23.5 14.3 25.5 13.3 28Z" fill="${c}"/><path d="M35.6 8Q36.8 12.4 38 16.5" stroke="${oscurecer(c, 0.3)}" stroke-width="1.2" fill="none"/>`;
    case 'recogido':
      return `<path d="M13.5 27C12.5 14 21 7.5 30 7.5C39 7.5 47.5 14 46.5 27C44 20 38 16.4 30 16.4C22 16.4 16 20 13.5 27Z" fill="${c}"/>`;
    case 'rizado':
      return `<path d="M12.5 26C11 18 15 12 20 11C22 7 27 6 30 8C33 6 38 7 40 11C45 12 49 18 47.5 26C45.5 22 43 21 41 21.5C39 18.5 35 18.5 33.5 20.5C31.5 18 28.5 18 26.5 20.5C25 18.5 21 18.5 19 21.5C17 21 14.5 22 12.5 26Z" fill="${c}"/>`;
    case 'rapado':
      return `<path d="M14.2 23C15.5 13.5 22 9.5 30 9.5C38 9.5 44.5 13.5 45.8 23C42 18.5 36.5 16.5 30 16.5C23.5 16.5 18 18.5 14.2 23Z" fill="${c}" opacity=".9"/>`;
    case 'calvo':
      return (
        `<path d="M12.9 32C12.4 28.5 13.1 26 14.6 24.5C15.1 27 15.7 29 16.7 30.5Z" fill="${c}" stroke-width="1.4"/><path d="M47.1 32C47.6 28.5 46.9 26 45.4 24.5C44.9 27 44.3 29 43.3 30.5Z" fill="${c}" stroke-width="1.4"/>` +
        `<ellipse cx="23.5" cy="16" rx="4.2" ry="2.2" fill="#fff" opacity=".28" stroke="none"/>`
      );
    default:
      return '';
  }
}

function gorroDe(tipo: string, c: string): string {
  const os = oscurecer(c, 0.2);
  switch (tipo) {
    case 'lana':
      return `<path d="M12.6 24.5C12 12 20.5 4.5 30 4.5C39.5 4.5 48 12 47.4 24.5Z" fill="${c}"/><rect x="11.8" y="20.5" width="36.4" height="6.6" rx="3.2" fill="${os}"/>`;
    case 'gorra':
      return (
        `<path d="M13.6 23.5C13 12.5 21 6 30 6C39 6 47 12.5 46.4 23.5Z" fill="${c}"/>` +
        `<path d="M12.4 23.4Q30 19.4 47.6 23.4Q47.8 27.4 44 27.4Q30 24.4 16 27.4Q12.2 27.4 12.4 23.4Z" fill="${os}"/><circle cx="30" cy="6.6" r="1.6" fill="${os}" stroke-width="1.2"/>`
      );
    case 'boina':
      return `<path d="M11.5 19.5C12 11.5 21.5 7 31 7.5C40.5 8 48.5 12 48 18.5C46 21.5 38 22 30 21.5C22 21 15 22 11.5 19.5Z" fill="${c}"/><path d="M31 7.6L31.6 4.6" stroke-width="2.2" fill="none"/>`;
    case 'sombrero':
      return (
        `<ellipse cx="30" cy="17.8" rx="22.5" ry="4.8" fill="${c}"/>` +
        `<path d="M18.5 17.6C18 9 23.5 4.5 30 4.5C36.5 4.5 42 9 41.5 17.6Q30 20.2 18.5 17.6Z" fill="${c}"/><path d="M18.6 14.4Q30 17 41.4 14.4L41.5 17.6Q30 20.2 18.5 17.6Z" fill="${os}" stroke-width="1.4"/>`
      );
    case 'vincha':
      return `<path d="M13.2 19.8Q30 13 46.8 19.8L46.4 24.8Q30 18.2 13.6 24.8Z" fill="${c}"/>`;
    default:
      return '';
  }
}

function lentes(tipo: string): string {
  const patillas = `<path d="M28.4 30.6Q30 29.4 31.6 30.6M19.6 30L13.6 28.6M40.4 30L46.4 28.6" stroke="${TINTA}" stroke-width="1.5" fill="none" stroke-linecap="round"/>`;
  switch (tipo) {
    case 'redondos':
      return `<g fill="#fff" fill-opacity=".25" stroke="${TINTA}" stroke-width="1.5"><circle cx="24" cy="31" r="4.4"/><circle cx="36" cy="31" r="4.4"/></g>${patillas}`;
    case 'cuadrados':
      return `<g fill="#fff" fill-opacity=".25" stroke="${TINTA}" stroke-width="1.5" stroke-linejoin="round"><rect x="19.3" y="27.4" width="9.4" height="7.4" rx="1.8"/><rect x="31.3" y="27.4" width="9.4" height="7.4" rx="1.8"/></g>${patillas}`;
    case 'sol':
      return (
        `<g fill="${TINTA}" stroke="${TINTA}" stroke-width="1.5" stroke-linejoin="round"><path d="M19.3 28.4H28.7V31.6Q28.7 35.2 24 35.2Q19.3 35.2 19.3 31.6Z"/><path d="M31.3 28.4H40.7V31.6Q40.7 35.2 36 35.2Q31.3 35.2 31.3 31.6Z"/></g>` +
        `<path d="M21.2 30H23.6M33.2 30H35.6" stroke="#fff" stroke-width="1" opacity=".55" stroke-linecap="round"/>${patillas}`
      );
    case 'lectura':
      return `<g fill="#fff" fill-opacity=".25" stroke="${TINTA}" stroke-width="1.5" stroke-linejoin="round"><path d="M19.6 31.6H28.4Q28.2 35.6 24 35.6Q19.8 35.6 19.6 31.6Z"/><path d="M31.6 31.6H40.4Q40.2 35.6 36 35.6Q31.8 35.6 31.6 31.6Z"/></g><path d="M28.4 31.8Q30 30.8 31.6 31.8M19.6 31.6L13.6 29.6M40.4 31.6L46.4 29.6" stroke="${TINTA}" stroke-width="1.5" fill="none" stroke-linecap="round"/>`;
    default:
      return '';
  }
}
