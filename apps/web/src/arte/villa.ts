// Arte de cada villa: colores del suelo y las calles, árboles, faroles, estatua gigante y edificio central.
// La Villa Audiovisual copia la muestra aprobada (docs/propuestas/estilo-visual/muestra-villa-audiovisual.html);
// las otras tres siguen el mismo nivel de detalle con su paleta y su arquitectura.
//
// Las piezas grandes se dibujan en las coordenadas de la muestra (el cine ocupa x 330–590, y 58–332):
// la escena de Phaser solo las traslada al centro de la villa.
import type { Barrio } from '@cryptoville/shared';
import { TINTA, envolver } from './svg';

const CREMA = '#fdf6e3';
const DORADO = '#e9b44c';

export interface TemaVilla {
  pasto: string;
  plaza: string;
  calle: string;
  bordeCalle: string;
  detalleBorde: string;
  lineaCentro: string;
  estiloCalle: 'pelicula' | 'mosaico' | 'led' | 'adoquin';
}

export const TEMAS: Record<Barrio, TemaVilla> = {
  audiovisual: { pasto: '#c8e4ad', plaza: '#efe6d6', calle: '#dcd1bf', bordeCalle: '#4b4048', detalleBorde: '#efe6d6', lineaCentro: CREMA, estiloCalle: 'pelicula' },
  creativo: { pasto: '#cfe6b0', plaza: '#f6ead8', calle: '#f1e2cf', bordeCalle: '#e8c9a8', detalleBorde: '#e07a5f', lineaCentro: '#fffaf0', estiloCalle: 'mosaico' },
  tech: { pasto: '#c2e0c6', plaza: '#e6edf2', calle: '#cfd8e0', bordeCalle: '#3f4d63', detalleBorde: '#7fd1ff', lineaCentro: '#f4f8fb', estiloCalle: 'led' },
  academy: { pasto: '#c3dea8', plaza: '#ece2d0', calle: '#d8cab4', bordeCalle: '#a65f45', detalleBorde: '#c9785b', lineaCentro: '#e8dcc8', estiloCalle: 'adoquin' },
};

/**
 * Calle de una villa (todas las filas usan la misma imagen): bordes de película como en la muestra,
 * mosaico de colores, luces LED o adoquines. Se dibuja una sola vez con patrones SVG,
 * así el juego no vuelve a calcular miles de figuras en cada cuadro.
 */
export function crearCalle(barrio: Barrio, ancho: number, alto: number, tamano?: { ancho: number; alto: number }): string {
  const t = TEMAS[barrio];
  const centro = alto / 2;
  const linea = (color: string, opacidad = 1, grosor = 3) =>
    `<path d="M0 ${centro}H${ancho}" stroke="${color}" stroke-width="${grosor}" stroke-dasharray="22 16" opacity="${opacidad}"/>`;
  let detalle: string;
  switch (t.estiloCalle) {
    case 'mosaico': {
      const colores = ['#e07a5f', '#e9b44c', '#81b29a', '#9b7bc4'];
      const tejas = (dx: number) => colores.map((_, i) => `<rect x="${1 + i * 14}" y="0" width="12" height="10" rx="2" fill="${colores[(i + dx) % 4]}" opacity=".85"/>`).join('');
      detalle =
        `<defs><pattern id="mosaico-arriba" width="56" height="10" patternUnits="userSpaceOnUse">${tejas(0)}</pattern>` +
        `<pattern id="mosaico-abajo" width="56" height="10" patternUnits="userSpaceOnUse">${tejas(2)}</pattern></defs>` +
        `<rect x="0" y="2" width="${ancho}" height="10" fill="url(#mosaico-arriba)"/>` +
        `<rect x="0" y="${alto - 12}" width="${ancho}" height="10" fill="url(#mosaico-abajo)"/>` +
        `<path d="M0 ${centro}H${ancho}" stroke="${t.lineaCentro}" stroke-width="4" stroke-linecap="round" stroke-dasharray="18 20"/>`;
      break;
    }
    case 'led':
      detalle =
        `<rect width="${ancho}" height="12" fill="${t.bordeCalle}"/><rect y="${alto - 12}" width="${ancho}" height="12" fill="${t.bordeCalle}"/>` +
        `<path d="M4 6H${ancho}M4 ${alto - 6}H${ancho}" stroke="${t.detalleBorde}" stroke-width="3" stroke-linecap="round" stroke-dasharray="11 13" opacity=".95"/>` +
        linea(t.lineaCentro, 0.95);
      break;
    case 'adoquin':
      detalle =
        `<defs><pattern id="adoquin" width="24" height="30" patternUnits="userSpaceOnUse">` +
        `<rect x="1" y="1" width="20" height="11" rx="4" fill="#cbbba1" opacity=".75"/><rect x="13" y="16" width="20" height="11" rx="4" fill="#cbbba1" opacity=".75"/><rect x="-11" y="16" width="20" height="11" rx="4" fill="#cbbba1" opacity=".75"/>` +
        `</pattern></defs>` +
        `<rect x="0" y="13" width="${ancho}" height="${alto - 26}" fill="url(#adoquin)"/>` +
        `<rect width="${ancho}" height="10" fill="${t.bordeCalle}"/><rect y="${alto - 10}" width="${ancho}" height="10" fill="${t.bordeCalle}"/>` +
        `<path d="M0 5H${ancho}M10 ${alto - 5}H${ancho}" stroke="#8a4f3a" stroke-width="10" stroke-dasharray="1 19" opacity=".7"/>`;
      break;
    default:
      // Película, como el bulevar de la muestra.
      detalle =
        `<rect width="${ancho}" height="16" fill="${t.bordeCalle}"/><rect y="${alto - 16}" width="${ancho}" height="16" fill="${t.bordeCalle}"/>` +
        `<path d="M0 8H${ancho}M0 ${alto - 8}H${ancho}" stroke="${t.detalleBorde}" stroke-width="7" stroke-dasharray="9 9"/>` +
        linea(t.lineaCentro, 0.8);
  }
  return envolver(`0 0 ${ancho} ${alto}`, `<rect width="${ancho}" height="${alto}" fill="${t.calle}"/>${detalle}`, tamano);
}

// ---------------------------------------------------------------
// Árboles y faroles
// ---------------------------------------------------------------

export const ANCHO_ARBOL = 60;
export const ALTO_ARBOL = 70;

export function crearArbol(barrio: Barrio, tamano?: { ancho: number; alto: number }): string {
  let copa: string;
  switch (barrio) {
    case 'creativo':
      copa =
        `<g stroke="${TINTA}" stroke-width="2"><rect x="26" y="42" width="8" height="20" fill="#8a5a44"/><circle cx="30" cy="30" r="24" fill="#94c97c"/></g>` +
        `<circle cx="22" cy="22" r="9" fill="#b0d99a"/><g><circle cx="38" cy="20" r="2.6" fill="#e07a5f"/><circle cx="18" cy="36" r="2.4" fill="#e9b44c"/><circle cx="40" cy="38" r="2.4" fill="#9b7bc4"/><circle cx="29" cy="12" r="2" fill="${CREMA}"/></g>`;
      break;
    case 'tech':
      copa =
        `<g stroke="${TINTA}" stroke-width="2"><rect x="22" y="52" width="16" height="10" rx="2" fill="#dfe7ee"/><rect x="16" y="6" width="28" height="48" rx="14" fill="#7fbf9a"/></g>` +
        `<rect x="21" y="12" width="8" height="24" rx="4" fill="#a3d6b6"/>`;
      break;
    case 'academy':
      copa =
        `<g stroke="${TINTA}" stroke-width="2"><rect x="26" y="42" width="8" height="20" fill="#7a4a33"/><path d="M8 34C4 22 12 10 22 11C26 3 40 4 43 12C53 12 58 24 52 33C55 43 44 50 35 46C29 52 15 50 13 44C7 43 5 38 8 34Z" fill="#6fae63"/></g>` +
        `<circle cx="22" cy="21" r="7" fill="#8cc47c"/>`;
      break;
    default:
      copa = `<g stroke="${TINTA}" stroke-width="2"><rect x="26" y="42" width="8" height="20" fill="#8a5a44"/><circle cx="30" cy="30" r="24" fill="#8fc47a"/></g><circle cx="22" cy="22" r="9" fill="#a9d494"/>`;
  }
  return envolver('0 0 60 70', `<ellipse cx="30" cy="64" rx="20" ry="5" fill="${TINTA}" opacity=".15"/>${copa}`, tamano);
}

export const ANCHO_FAROL = 24;
export const ALTO_FAROL = 80;

export function crearFarol(barrio: Barrio, tamano?: { ancho: number; alto: number }): string {
  let cuerpo: string;
  switch (barrio) {
    case 'creativo':
      cuerpo =
        `<circle cx="12" cy="14" r="12" fill="${DORADO}" opacity=".3"/><g stroke="${TINTA}" stroke-width="2" stroke-linejoin="round"><rect x="10" y="22" width="4" height="50" fill="#b85a42"/><rect x="5" y="70" width="14" height="7" rx="2" fill="#b85a42"/>` +
        `<rect x="5.5" y="7" width="13" height="15" rx="3" fill="${CREMA}"/><path d="M4 8H20L12 2Z" fill="#e07a5f"/></g>`;
      break;
    case 'tech':
      cuerpo =
        `<rect x="2" y="8" width="20" height="10" rx="5" fill="#7fd1ff" opacity=".35"/><g stroke="${TINTA}" stroke-width="2" stroke-linejoin="round"><rect x="10.5" y="14" width="3" height="58" fill="#8aa0b5"/><rect x="6" y="70" width="12" height="7" rx="2" fill="#5f7186"/>` +
        `<rect x="3" y="10" width="18" height="6" rx="3" fill="#dff4ff"/></g>`;
      break;
    case 'academy':
      cuerpo =
        `<circle cx="12" cy="15" r="12" fill="${DORADO}" opacity=".3"/><g stroke="${TINTA}" stroke-width="2" stroke-linejoin="round"><rect x="10" y="24" width="4" height="48" fill="#2f2a2c"/><rect x="5" y="70" width="14" height="7" rx="2" fill="#2f2a2c"/>` +
        `<path d="M6 9H18L17 23H7Z" fill="#fbe7b0"/><path d="M4 9H20L12 3Z" fill="#2f2a2c"/><path d="M12 9V23" stroke-width="1.2"/></g>`;
      break;
    default:
      cuerpo =
        `<circle cx="12" cy="14" r="12" fill="${DORADO}" opacity=".3"/><g stroke="${TINTA}" stroke-width="2"><rect x="10" y="20" width="4" height="52" fill="#4b4048"/><rect x="5" y="70" width="14" height="7" rx="2" fill="#4b4048"/><circle cx="12" cy="14" r="7" fill="${CREMA}"/></g>`;
  }
  return envolver('0 0 24 80', cuerpo, tamano);
}

// ---------------------------------------------------------------
// Estatua gigante (sobre el mismo pedestal de la muestra: x 248–352, y 352–416)
// ---------------------------------------------------------------

export interface PiezaGrande {
  /** viewBox en coordenadas de la muestra. */
  x: number;
  y: number;
  ancho: number;
  alto: number;
  svg: (tamano?: { ancho: number; alto: number }) => string;
}

export interface TextoSobrePieza {
  x: number;
  y: number;
  texto: string;
  tamano: number;
  peso: number;
  color: string;
  espaciado?: number;
}

export interface Estatua extends PiezaGrande {
  textos: TextoSobrePieza[];
}

const PEDESTAL =
  `<rect x="248" y="352" width="104" height="64" rx="10" fill="#d9cfc1"/>` +
  `<rect x="248" y="352" width="104" height="14" rx="7" fill="#ebe3d6"/>` +
  `<rect x="266" y="382" width="68" height="16" rx="3" fill="${DORADO}" stroke-width="1.5"/>`;

export function estatua(barrio: Barrio): Estatua {
  const g = (contenido: string, extra = '') => `<g stroke="${TINTA}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round">${contenido}</g>${extra}`;
  const placa = (texto: string): TextoSobrePieza => ({ x: 300, y: 394, texto, tamano: 9, peso: 700, color: TINTA });
  switch (barrio) {
    case 'creativo': {
      // Lápiz y pincel gigantes cruzados.
      const contenido = g(
        PEDESTAL +
          `<g transform="rotate(-16 300 352)"><rect x="288" y="262" width="24" height="92" fill="${DORADO}"/><path d="M296 262V354M304 262V354" stroke-width="1.5"/>` +
          `<path d="M288 262L300 236L312 262Z" fill="#f2cc8f"/><path d="M296 244L300 236L304 244Z" fill="#4b4048"/></g>` +
          `<g transform="rotate(18 300 352)"><rect x="294" y="270" width="12" height="84" rx="5" fill="#b07a52"/><rect x="291" y="256" width="18" height="16" rx="2" fill="#b9c2cc"/>` +
          `<path d="M291 256Q290 238 300 226Q310 238 309 256Z" fill="#e07a5f"/></g>`,
      );
      return { x: 228, y: 216, ancho: 144, alto: 200, svg: (t) => envolver('228 216 144 200', contenido, t), textos: [placa('CREATIVO')] };
    }
    case 'tech': {
      const pines = [276, 288, 300, 312, 324]
        .map((p) => `M${p} 270V278M${p} 354V362M252 ${p + 16}H260M340 ${p + 16}H348`)
        .join('');
      const contenido = g(
        PEDESTAL +
          `<path d="${pines}" stroke-width="3"/>` +
          `<rect x="260" y="278" width="80" height="76" rx="9" fill="#2f3b4c"/><rect x="278" y="296" width="44" height="40" rx="5" fill="#3d85c6"/>` +
          `<path d="M286 316H296V306M314 316H304V326" stroke="#bfeaff" stroke-width="2.4" fill="none"/>`,
        `<circle cx="268" cy="286" r="2.5" fill="#7fd1ff"/><rect x="282" y="300" width="12" height="4" rx="2" fill="#fff" opacity=".5"/>`,
      );
      return { x: 244, y: 266, ancho: 112, alto: 150, svg: (t) => envolver('244 266 112 150', contenido, t), textos: [placa('TECH')] };
    }
    case 'academy': {
      const contenido = g(
        PEDESTAL +
          `<path d="M300 350L252 340V292L300 302L348 292V340Z" fill="#5d9b78"/>` +
          `<path d="M300 344Q278 330 256 334V290Q278 286 300 300Z" fill="${CREMA}"/><path d="M300 344Q322 330 344 334V290Q322 286 300 300Z" fill="${CREMA}"/>` +
          `<path d="M264 302Q280 298 292 306M264 312Q280 308 292 316M264 322Q280 318 292 326M308 306Q320 298 336 302M308 316Q320 308 336 312M308 326Q320 318 336 322" stroke="#b9a98f" stroke-width="1.6" fill="none"/>` +
          `<path d="M300 300V344" stroke-width="2"/>`,
        `<path d="M318 297V322L322 317L326 322V294" fill="#a95656" stroke="${TINTA}" stroke-width="1.5" stroke-linejoin="round"/>`,
      );
      return { x: 244, y: 280, ancho: 112, alto: 136, svg: (t) => envolver('244 280 112 136', contenido, t), textos: [placa('ACADEMY')] };
    }
    default: {
      // Cámara gigante (la de la muestra).
      const contenido = g(
        PEDESTAL +
          `<rect x="276" y="282" width="30" height="18" rx="4" fill="#4b4048"/><rect x="318" y="287" width="15" height="10" rx="3" fill="${DORADO}"/>` +
          `<rect x="254" y="294" width="92" height="66" rx="12" fill="#4b4048"/><rect x="262" y="302" width="15" height="10" rx="2" fill="${CREMA}" stroke-width="1.5"/>` +
          `<circle cx="300" cy="328" r="25" fill="#6b6070"/><circle cx="300" cy="328" r="16" fill="#8aa0c8"/><circle cx="300" cy="328" r="7" fill="#46557a"/>`,
        `<circle cx="294" cy="321" r="4" fill="#fff" opacity=".6"/>`,
      );
      return { x: 246, y: 280, ancho: 108, alto: 138, svg: (t) => envolver('246 280 108 138', contenido, t), textos: [placa('AUDIOVISUAL')] };
    }
  }
}

// ---------------------------------------------------------------
// Edificio central (se entra para ver datos curiosos). Cuerpo: x 330–590 hasta y 332.
// "Frente": la alfombra o el camino de entrada (y 332–428), que se dibuja a ras del suelo.
// ---------------------------------------------------------------

export interface EdificioCentral {
  nombre: string;
  cuerpo: PiezaGrande;
  frente: PiezaGrande;
  textos: TextoSobrePieza[];
  /** Luces que titilan (Phaser las anima). */
  luces: { x: number; y: number; r: number; color: string }[];
  /** Puerta para entrar (borde inferior del camino de entrada). */
  puerta: { x: number; y: number };
  /** Rectángulo que no se puede atravesar. */
  solido: { x: number; y: number; ancho: number; alto: number };
}

export function edificioCentral(barrio: Barrio): EdificioCentral {
  const g = (contenido: string) => `<g stroke="${TINTA}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round">${contenido}</g>`;
  const pieza = (x: number, y: number, ancho: number, alto: number, contenido: string): PiezaGrande => ({
    x,
    y,
    ancho,
    alto,
    svg: (t) => envolver(`${x} ${y} ${ancho} ${alto}`, contenido, t),
  });
  const postes =
    `<path d="M420 346V414M500 346V414" stroke="${DORADO}" stroke-width="3"/>` +
    `<g fill="${DORADO}" stroke="${TINTA}" stroke-width="1.5"><circle cx="420" cy="346" r="4.5"/><circle cx="420" cy="414" r="4.5"/><circle cx="500" cy="346" r="4.5"/><circle cx="500" cy="414" r="4.5"/></g>`;

  switch (barrio) {
    case 'creativo': {
      const dientes = Array.from({ length: 8 }, (_, i) => `<path d="M${336 + i * 32} 124V74L${364 + i * 32} 124Z" fill="#8aa0c8" stroke-width="1.5"/>`).join('');
      const bolitas = ['#e07a5f', DORADO, '#81b29a', '#9b7bc4'];
      const cuerpo =
        g(
          `<rect x="330" y="58" width="260" height="74" rx="6" fill="#e07a5f"/>${dientes}` +
            `<rect x="330" y="132" width="260" height="200" fill="#fdf0dc"/><rect x="330" y="132" width="260" height="10" fill="#e9b44c"/>` +
            `<rect x="348" y="148" width="224" height="54" rx="6" fill="${CREMA}"/>` +
            `<rect x="350" y="214" width="46" height="68" rx="2" fill="#b07a52"/><rect x="355" y="219" width="36" height="58" fill="#e9b44c" stroke-width="1.5"/>` +
            `<rect x="524" y="214" width="46" height="68" rx="2" fill="#b07a52"/><rect x="529" y="219" width="36" height="58" fill="#9b7bc4" stroke-width="1.5"/>` +
            `<path d="M424 332V262Q424 236 460 236Q496 236 496 262V332Z" fill="#8aa0c8"/><path d="M460 236V332M424 282H496" stroke-width="1.6"/>` +
            `<path d="M410 236H510L500 226H420Z" fill="#81b29a"/>`,
        ) +
        Array.from({ length: 14 }, (_, i) => `<circle cx="${356 + i * 16}" cy="${i % 2 ? 198 : 152}" r="2.6" fill="${bolitas[i % 4]}"/>`).join('') +
        `<circle cx="373" cy="238" r="8" fill="#e07a5f"/><path d="M360 272L370 256L380 266L386 260L390 272Z" fill="#5d9b78"/>` +
        `<circle cx="547" cy="242" r="10" fill="${CREMA}"/><rect x="537" y="258" width="20" height="10" rx="2" fill="#e07a5f"/>`;
      const tejas = ['#e07a5f', DORADO, '#81b29a', '#9b7bc4', '#8aa0c8'];
      const frente =
        g(`<rect x="430" y="332" width="60" height="96" fill="#f6ead8"/>`) +
        Array.from({ length: 12 }, (_, i) => `<rect x="${i % 2 ? 462 : 434}" y="${336 + i * 7.5}" width="24" height="6" rx="1.5" fill="${tejas[i % 5]}" opacity=".85"/>`).join('') +
        g(`<rect x="412" y="396" width="16" height="18" rx="3" fill="#c97b5a"/><rect x="492" y="396" width="16" height="18" rx="3" fill="#c97b5a"/>`) +
        g(`<circle cx="420" cy="390" r="9" fill="#8fc47a"/><circle cx="500" cy="390" r="9" fill="#8fc47a"/>`) +
        `<circle cx="417" cy="387" r="2" fill="#e07a5f"/><circle cx="503" cy="388" r="2" fill="${DORADO}"/>`;
      return {
        nombre: 'Galería Cryptoville',
        cuerpo: pieza(328, 56, 264, 278, cuerpo),
        frente: pieza(404, 330, 112, 100, frente),
        textos: [
          { x: 460, y: 177, texto: 'GALERÍA CRYPTOVILLE', tamano: 16, peso: 800, color: '#b85a42', espaciado: 1.2 },
          { x: 460, y: 192, texto: 'Muestra: datos curiosos de Stellar', tamano: 11, peso: 700, color: TINTA },
        ],
        luces: [],
        puerta: { x: 460, y: 432 },
        solido: { x: 330, y: 70, ancho: 260, alto: 260 },
      };
    }
    case 'tech': {
      const ventanas = [376, 500].map((x) => `<rect x="${x}" y="214" width="44" height="68" rx="3" fill="#a9c7e0" stroke-width="1.5"/>`);
      const cuerpo =
        g(
          `<rect x="350" y="8" width="220" height="70" rx="8" fill="#5f7186"/><rect x="362" y="18" width="196" height="50" rx="4" fill="#6f86a0" stroke-width="1.5"/>` +
            `<path d="M390 18V68M420 18V68M450 18V68M480 18V68M510 18V68M540 18V68" stroke="#8aa0b5" stroke-width="1.2"/>` +
            `<path d="M380 28V6M540 30V2" stroke-width="2"/>` +
            `<rect x="350" y="78" width="220" height="254" fill="#dfe7ee"/>` +
            `<rect x="364" y="90" width="192" height="44" rx="4" fill="#2f3b4c"/>` +
            `<rect x="368" y="148" width="184" height="54" rx="6" fill="#1f2a3a"/>` +
            ventanas.join('') +
            `<rect x="424" y="244" width="72" height="88" fill="#a9c7e0"/><path d="M460 244V332" stroke-width="1.8"/>` +
            `<rect x="418" y="232" width="84" height="12" rx="3" fill="#3d85c6"/>`,
        ) +
        `<path d="M372 102H548M372 112H548M372 122H548" stroke="#46557a" stroke-width="3"/>` +
        `<path d="M380 290L392 262M386 270L396 252M504 290L516 262M510 270L520 252" stroke="#fff" stroke-width="3" opacity=".5"/>` +
        `<path d="M372 152H548M372 198H548" stroke="#7fd1ff" stroke-width="2" stroke-dasharray="10 6" opacity=".8"/>`;
      const frente =
        g(`<rect x="430" y="332" width="60" height="96" fill="#e6edf2"/>`) +
        `<path d="M434 334V426M486 334V426" stroke="#7fd1ff" stroke-width="3" stroke-dasharray="8 8" opacity=".9"/>` +
        g(`<rect x="414" y="398" width="10" height="18" rx="3" fill="#5f7186"/><rect x="496" y="398" width="10" height="18" rx="3" fill="#5f7186"/>`) +
        `<rect x="414" y="398" width="10" height="5" rx="2" fill="#7fd1ff"/><rect x="496" y="398" width="10" height="5" rx="2" fill="#7fd1ff"/>`;
      const luces: EdificioCentral['luces'] = [];
      for (let i = 0; i < 9; i++) luces.push({ x: 378 + i * 21, y: 102 + (i % 3) * 10, r: 2.6, color: i % 3 === 1 ? '#8fe3a1' : '#7fd1ff' });
      luces.push({ x: 380, y: 5, r: 3.4, color: '#ff6b6b' }, { x: 540, y: 2, r: 3.4, color: '#ff6b6b' });
      return {
        nombre: 'Torre de datos',
        cuerpo: pieza(346, 0, 228, 334, cuerpo),
        frente: pieza(404, 330, 112, 100, frente),
        textos: [
          { x: 460, y: 177, texto: 'TORRE DE DATOS', tamano: 17, peso: 800, color: '#7fd1ff', espaciado: 1.4 },
          { x: 460, y: 192, texto: 'En pantalla: datos de Stellar', tamano: 11, peso: 700, color: '#dfe7ee' },
        ],
        luces,
        puerta: { x: 460, y: 432 },
        solido: { x: 350, y: 20, ancho: 220, alto: 310 },
      };
    }
    case 'academy': {
      const columnas = [344, 376, 530, 562].map((x) => `<rect x="${x}" y="212" width="14" height="120" fill="#ece2d0"/><rect x="${x - 3}" y="206" width="20" height="8" fill="#ece2d0"/>`).join('');
      const tejas = [70, 82, 94, 106, 118].map((y) => `M330 ${y}H590`).join(' ');
      const marcas = Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return `M${(460 + Math.sin(a) * 18).toFixed(1)} ${(82 - Math.cos(a) * 18).toFixed(1)}L${(460 + Math.sin(a) * 15).toFixed(1)} ${(82 - Math.cos(a) * 15).toFixed(1)}`;
      }).join('');
      const cuerpo =
        g(
          `<rect x="330" y="58" width="260" height="74" rx="4" fill="#5b6770"/>` +
            `<path d="${tejas}" stroke="#46525a" stroke-width="1.4"/>` +
            `<rect x="330" y="132" width="260" height="200" fill="#c9785b"/>` +
            `<path d="${[150, 166, 182, 198, 214, 230, 246, 262, 278, 294, 310, 326].map((y) => `M330 ${y}H590`).join(' ')}" stroke="#a9604a" stroke-width="1" opacity=".7"/>` +
            `<rect x="348" y="148" width="224" height="54" rx="3" fill="#2f5a40"/><rect x="352" y="152" width="216" height="46" rx="2" fill="none" stroke="${DORADO}" stroke-width="1.5"/>` +
            columnas +
            `<path d="M398 332V256Q398 240 412 240Q426 240 426 256V332Z" fill="#8aa0c8" stroke-width="1.8"/><path d="M494 332V256Q494 240 508 240Q522 240 522 256V332Z" fill="#8aa0c8" stroke-width="1.8"/>` +
            `<path d="M430 332V258Q430 230 460 230Q490 230 490 258V332Z" fill="#7a4a33"/><path d="M460 232V332" stroke-width="1.8"/>` +
            `<rect x="428" y="20" width="64" height="112" fill="#d8c9b0"/><path d="M420 22L460 -4L500 22Z" fill="#5b6770"/>` +
            `<circle cx="460" cy="82" r="22" fill="${CREMA}"/>`,
        ) +
        `<path d="${marcas}" stroke="${TINTA}" stroke-width="1.6" stroke-linecap="round"/>` +
        `<path d="M460 82V68M460 82L470 88" stroke="${TINTA}" stroke-width="2.6" stroke-linecap="round"/><circle cx="460" cy="82" r="2.2" fill="${TINTA}"/>` +
        `<circle cx="451" cy="248" r="2" fill="${DORADO}"/><circle cx="469" cy="248" r="2" fill="${DORADO}"/>`;
      const frente =
        g(`<rect x="416" y="332" width="88" height="10" fill="#ece2d0"/><rect x="424" y="342" width="72" height="10" fill="#e3d6c0"/><rect x="430" y="352" width="60" height="76" fill="#d8cab4"/>`) +
        `<path d="M430 372H490M430 392H490M430 412H490M450 352V372M470 372V392M450 392V412M470 412V428" stroke="#b8a68a" stroke-width="1.2"/>` +
        postes;
      return {
        nombre: 'Biblioteca Cryptoville',
        cuerpo: pieza(326, -8, 268, 342, cuerpo),
        frente: pieza(404, 330, 112, 100, frente),
        textos: [
          { x: 460, y: 177, texto: 'BIBLIOTECA', tamano: 17, peso: 800, color: '#f3d27a', espaciado: 2 },
          { x: 460, y: 192, texto: 'Sala de lectura: datos curiosos', tamano: 11, peso: 700, color: '#ece2d0' },
        ],
        luces: [],
        puerta: { x: 460, y: 432 },
        solido: { x: 330, y: 20, ancho: 260, alto: 310 },
      };
    }
    default: {
      // El cine de la muestra, tal cual.
      const cuerpo =
        g(
          `<rect x="330" y="58" width="260" height="74" rx="6" fill="#7e3f43"/><rect x="342" y="68" width="236" height="52" rx="3" fill="#8f4a4e" stroke-width="1.5"/>` +
            `<circle cx="460" cy="94" r="20" fill="${CREMA}"/><rect x="330" y="132" width="260" height="200" fill="#a95656"/>` +
            `<rect x="348" y="148" width="224" height="54" rx="6" fill="${CREMA}"/>` +
            `<rect x="350" y="214" width="46" height="68" rx="2" fill="${CREMA}"/><rect x="524" y="214" width="46" height="68" rx="2" fill="${CREMA}"/>` +
            `<rect x="355" y="219" width="36" height="58" fill="#46557a" stroke-width="1.5"/><rect x="529" y="219" width="36" height="58" fill="#5d9b78" stroke-width="1.5"/>` +
            `<rect x="414" y="226" width="92" height="14" rx="3" fill="#7e3f43"/><rect x="424" y="240" width="72" height="92" fill="#46557a"/><path d="M460 240V332"/>`,
        ) +
        `<circle cx="460" cy="94" r="10" fill="none" stroke="#7e3f43" stroke-width="6" stroke-linecap="round" stroke-dasharray="0 10.47"/>` +
        `<path d="M356 152H564M356 198H564" stroke="${DORADO}" stroke-width="5" stroke-linecap="round" stroke-dasharray="0 13"/>` +
        `<circle cx="373" cy="236" r="7" fill="${DORADO}"/><path d="M362 270L373 252L384 270Z" fill="${CREMA}" opacity=".8"/>` +
        `<circle cx="547" cy="246" r="11" fill="${CREMA}" opacity=".8"/><circle cx="547" cy="246" r="4" fill="${DORADO}"/>`;
      const frente = `<rect x="430" y="332" width="60" height="96" fill="#b5554f"/>` + postes;
      return {
        nombre: 'Cine Cryptoville',
        cuerpo: pieza(328, 56, 264, 278, cuerpo),
        frente: pieza(404, 330, 112, 100, frente),
        textos: [
          { x: 460, y: 177, texto: 'CINE CRYPTOVILLE', tamano: 17, peso: 800, color: '#7e3f43', espaciado: 1.36 },
          { x: 460, y: 192, texto: 'Hoy: ¿Cómo funciona Stellar?', tamano: 11, peso: 700, color: TINTA },
        ],
        luces: [],
        puerta: { x: 460, y: 432 },
        solido: { x: 330, y: 70, ancho: 260, alto: 260 },
      };
    }
  }
}

// ---------------------------------------------------------------
// Lote disponible y marca sobre la puerta cercana
// ---------------------------------------------------------------

export function crearLoteDisponible(tamano?: { ancho: number; alto: number }): string {
  return envolver(
    '0 0 150 148',
    `<rect x="1" y="1" width="148" height="146" rx="12" fill="#fff" fill-opacity=".35" stroke="${TINTA}" stroke-opacity=".45" stroke-width="2" stroke-dasharray="8 7"/>`,
    tamano,
  );
}

export function crearMarca(tamano?: { ancho: number; alto: number }): string {
  return envolver('0 0 24 22', `<path d="M3 3H21L12 19Z" fill="${CREMA}" stroke="${TINTA}" stroke-width="2.5" stroke-linejoin="round"/>`, tamano);
}
