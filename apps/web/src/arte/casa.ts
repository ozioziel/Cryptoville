// Casas de las villas en vectores: exterior (lo que se ve en el mapa) e interior (al entrar).
//
// - El exterior sigue la casa de la muestra aprobada: techo visto desde arriba, muro con franja
//   de la villa, letrero, vitrina con toldo y puerta. Mide 150 × 172.
// - Cada pieza viene del catálogo de su villa (CATALOGO_CASA en packages/shared).
// - El color del dueño (`color` del local) pinta el toldo, la puerta y el marco del letrero.
// - El nombre del local lo escribe Phaser encima del letrero (las texturas SVG no cargan fuentes web);
//   en React (vista previa del editor) se puede incluir con `conNombre`.
import {
  CATALOGO_CASA,
  colorDe,
  normalizarAparienciaCasa,
  type AparienciaCasa,
  type Barrio,
} from '@cryptoville/shared';
import { TINTA, aclarar, azar, envolver, escaparTexto, mezclar, oscurecer } from './svg';

export const ANCHO_CASA = 150;
export const ALTO_CASA = 172;
export const ANCHO_INTERIOR = 480;
export const ALTO_INTERIOR = 300;

/** Puerta de la casa (centro del borde inferior), relativa a la esquina superior izquierda. */
export const PUERTA_CASA = { x: 112, y: 168 };
/** Centro del letrero, donde va el nombre del local. */
export const LETRERO_CASA = { x: 75, y: 90, ancho: 92 };

/** Franja de color de cada villa en el muro (identidad de la villa). */
const FRANJA: Record<Barrio, string> = {
  creativo: '#e07a5f',
  tech: '#3d85c6',
  audiovisual: '#a95656',
  academy: '#5d9b78',
};

const VIDRIO = '#8aa0c8';
const CREMA = '#fdf6e3';
const DORADO = '#e9b44c';

export interface DatosCasa {
  barrio: Barrio;
  apariencia: AparienciaCasa | null | undefined;
  /** Color del dueño (toldo, puerta y letrero). */
  color: string;
  /** Nombre del local, solo para vistas previas en React. */
  nombre?: string;
  /** Casa de un «Se busca» (modo «Quiero trabajar»): lleva el cartel SE BUSCA en la vitrina. */
  cartelSeBusca?: boolean;
}

/** Color de las casas «Se busca» (toldo y puerta): el mostaza de los carteles. */
export const COLOR_SE_BUSCA = '#e9b44c';

/** Color del texto del letrero según el tipo de letrero. */
export function colorTextoLetrero(barrio: Barrio, apariencia: AparienciaCasa | null | undefined): string {
  const a = normalizarAparienciaCasa(barrio, apariencia);
  switch (a.letrero) {
    case 'claqueta':
      return CREMA;
    case 'neon':
      return '#bfeaff';
    case 'pantalla':
      return '#9fe3ff';
    case 'clasico':
      return '#f3d27a';
    case 'marquesina':
      return '#7e3f43';
    default:
      return TINTA;
  }
}

export function crearCasa(d: DatosCasa, opciones: { tamano?: { ancho: number; alto: number }; titulo?: string } = {}): string {
  const a = normalizarAparienciaCasa(d.barrio, d.apariencia);
  const cat = CATALOGO_CASA[d.barrio];
  const colorTecho = colorDe(cat.colorTecho, a.colorTecho);
  const colorPared = colorDe(cat.colorPared, a.colorPared);
  const dueno = d.color;

  const partes = [
    `<g stroke="${TINTA}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round">`,
    techo(d.barrio, a.techo, colorTecho),
    `<rect x="4" y="64" width="142" height="104" fill="${colorPared}"/>`,
    pared(a.pared, colorPared),
    `<rect x="4" y="64" width="142" height="104" fill="none"/>`,
    franja(d.barrio),
    letrero(a.letrero, dueno),
    ventana(a.ventana, d.barrio),
    toldo(a.toldo, dueno),
    puerta(a.puerta, dueno),
    `</g>`,
    `<circle cx="112" cy="102" r="3.5" fill="${DORADO}"/>`,
    frente(a.frente, d.barrio),
    d.cartelSeBusca ? cartelEnVitrina() : '',
  ];
  if (d.nombre) {
    const corto = d.nombre.length > 18 ? `${d.nombre.slice(0, 17)}…` : d.nombre;
    partes.push(
      `<text x="75" y="94" text-anchor="middle" font-family="'Plus Jakarta Sans',system-ui,sans-serif" font-weight="700" font-size="12" fill="${colorTextoLetrero(d.barrio, a)}">${escaparTexto(corto)}</text>`,
    );
  }
  return envolver(`0 0 ${ANCHO_CASA} ${ALTO_CASA}`, partes.join(''), opciones.tamano, opciones.titulo);
}

// ---------------------------------------------------------------
// Exterior
// ---------------------------------------------------------------

/** Cartel «SE BUSCA» pegado en la vitrina (las texturas no cargan fuentes web: se usa una del sistema). */
function cartelEnVitrina(): string {
  return (
    `<g transform="rotate(-3 45 138)" stroke="${TINTA}" stroke-linejoin="round">` +
    `<rect x="25" y="122" width="40" height="32" rx="2" fill="#fffaf0" stroke-width="1.4"/>` +
    `<rect x="25" y="122" width="40" height="9" fill="${DORADO}" stroke-width="1.4"/>` +
    `<path d="M31 137H59M31 142H55M31 147H49" stroke="#b9a98f" stroke-width="1.6" stroke-linecap="round"/>` +
    `<circle cx="45" cy="122" r="2.3" fill="#a95656" stroke-width=".9"/>` +
    `</g>` +
    `<text x="45" y="129.4" transform="rotate(-3 45 138)" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="6" letter-spacing=".5" fill="#5c4310">SE BUSCA</text>`
  );
}

function techo(barrio: Barrio, tipo: string, c: string): string {
  const base = `<rect x="4" y="4" width="142" height="60" rx="6" fill="${c}"/>`;
  const panel = `<rect x="13" y="13" width="124" height="42" rx="3" fill="${aclarar(c, 0.1)}" stroke-width="1.5"/>`;
  const os = oscurecer(c, 0.25);
  if (barrio === 'audiovisual') {
    switch (tipo) {
      case 'antena':
        return (
          base + panel +
          `<rect x="22" y="22" width="28" height="20" rx="2" fill="#ded6cf" stroke-width="1.5"/><path d="M26 28H46M26 33H46M26 38H46" stroke-width="1" opacity=".5"/>` +
          `<ellipse cx="102" cy="34" rx="15" ry="11" fill="#ded6cf" stroke-width="1.5"/><path d="M102 34L112 26" stroke-width="1.6"/><circle cx="112" cy="26" r="2.2" fill="${DORADO}" stroke-width="1.2"/>`
        );
      case 'reflectores':
        return (
          base + panel +
          `<path d="M28 34H122" stroke-width="3" stroke="${os}"/>` +
          `<circle cx="42" cy="34" r="10" fill="#4b4048" stroke-width="1.5"/><circle cx="42" cy="34" r="6" fill="${CREMA}" stroke-width="1.2"/>` +
          `<circle cx="108" cy="34" r="10" fill="#4b4048" stroke-width="1.5"/><circle cx="108" cy="34" r="6" fill="${CREMA}" stroke-width="1.2"/>` +
          `<rect x="66" y="26" width="18" height="16" rx="2" fill="#ded6cf" stroke-width="1.5"/>`
        );
      default:
        return (
          base + panel +
          `<rect x="24" y="21" width="30" height="22" rx="2" fill="${VIDRIO}" stroke-width="1.5"/><circle cx="112" cy="33" r="8" fill="#ded6cf" stroke-width="1.5"/>`
        );
    }
  }
  if (barrio === 'tech') {
    switch (tipo) {
      case 'vidrio':
        return (
          base +
          `<rect x="14" y="13" width="122" height="42" rx="3" fill="#b9d3ea" stroke-width="1.5"/>` +
          `<path d="M44.5 13V55M75 13V55M105.5 13V55" stroke-width="1.5"/>` +
          `<path d="M20 48L34 20M52 48L64 22M84 46L96 20M114 46L126 22" stroke="#fff" stroke-width="2.5" opacity=".55"/>`
        );
      case 'antena':
        return (
          base + panel +
          `<path d="M38 50V18M112 50V24" stroke-width="2"/><circle cx="38" cy="16" r="3.4" fill="#ff6b6b" stroke-width="1.4"/><circle cx="112" cy="22" r="3.4" fill="#7fd1ff" stroke-width="1.4"/>` +
          `<path d="M31 26H45M106 32H118" stroke-width="1.6"/><rect x="62" y="24" width="28" height="22" rx="3" fill="#dfe7ee" stroke-width="1.5"/><path d="M66 30H86M66 35H86M66 40H86" stroke-width="1" opacity=".5"/>`
        );
      default: {
        const paneles: string[] = [];
        for (let fila = 0; fila < 2; fila++) {
          for (let col = 0; col < 4; col++) {
            paneles.push(`<rect x="${16 + col * 30}" y="${15 + fila * 20}" width="27" height="17" rx="1.5" fill="#46557a" stroke-width="1.4"/>`);
          }
        }
        return (
          base + `<rect x="12" y="12" width="126" height="44" rx="3" fill="${aclarar(c, 0.2)}" stroke-width="1.5"/>` + paneles.join('') +
          `<path d="M29.5 15V52M59.5 15V52M89.5 15V52M119.5 15V52M16 23.5H136M16 43.5H136" stroke="#8aa0c8" stroke-width="1" opacity=".7"/>`
        );
      }
    }
  }
  if (barrio === 'creativo') {
    switch (tipo) {
      case 'madera': {
        const filas: string[] = [];
        for (let y = 14; y < 60; y += 10) {
          const desfase = ((y - 14) / 10) % 2 === 0 ? 0 : 9;
          const cortes: string[] = [];
          for (let x = 4 + desfase + 18; x < 146; x += 18) cortes.push(`M${x} ${y - 10}V${y}`);
          filas.push(`<path d="M4 ${y}H146${cortes.length ? ' ' + cortes.join(' ') : ''}" stroke="${os}" stroke-width="1.2" fill="none"/>`);
        }
        return base + filas.join('') + `<rect x="108" y="8" width="16" height="20" rx="2" fill="#b07a52" stroke-width="1.8"/>`;
      }
      case 'jardin':
        return (
          base + `<rect x="13" y="13" width="124" height="42" rx="6" fill="#9fcf86" stroke-width="1.5"/>` +
          `<g stroke-width="1.4"><circle cx="30" cy="30" r="9" fill="#7cbf6b"/><circle cx="52" cy="40" r="7" fill="#8fc47a"/><circle cx="118" cy="28" r="9" fill="#7cbf6b"/><circle cx="98" cy="42" r="6" fill="#8fc47a"/></g>` +
          `<g stroke="none"><circle cx="28" cy="27" r="2.2" fill="#e07a5f"/><circle cx="54" cy="38" r="2" fill="#e9b44c"/><circle cx="116" cy="25" r="2.2" fill="#9b7bc4"/><circle cx="100" cy="40" r="1.8" fill="#fdf6e3"/></g>` +
          `<rect x="66" y="24" width="20" height="18" rx="3" fill="#c79e70" stroke-width="1.5"/>`
        );
      default: {
        // Tejas de colores: hileras de tejas redondeadas con algunas de otro tono.
        const r = azar(7);
        const colores = ['#e07a5f', '#e9b44c', '#81b29a', '#9b7bc4'];
        const tejas: string[] = [];
        for (let fila = 0; fila < 4; fila++) {
          const y = 12 + fila * 12;
          for (let x = 8 + (fila % 2) * 8; x < 140; x += 16) {
            const color = r() < 0.18 ? colores[Math.floor(r() * colores.length)] : c;
            tejas.push(`<path d="M${x} ${y}h14v6a7 7 0 0 1 -14 0Z" fill="${color}" stroke="${os}" stroke-width="1.2"/>`);
          }
        }
        return base + tejas.join('') + `<rect x="110" y="6" width="14" height="18" rx="2" fill="#b07a52" stroke-width="1.8"/>`;
      }
    }
  }
  // Academy: tejados clásicos.
  switch (tipo) {
    case 'pizarra': {
      const piezas: string[] = [];
      for (let fila = 0; fila < 5; fila++) {
        const y = 10 + fila * 10;
        for (let x = 8 + (fila % 2) * 7; x < 140; x += 14) {
          piezas.push(`<rect x="${x}" y="${y}" width="12" height="9" rx="2.5" fill="${fila % 2 ? aclarar(c, 0.08) : c}" stroke="${os}" stroke-width="1"/>`);
        }
      }
      return base + piezas.join('') + `<rect x="20" y="6" width="14" height="16" rx="1.5" fill="#a65f45" stroke-width="1.8"/>`;
    }
    case 'buhardilla': {
      const hileras = [16, 26, 36, 46, 56].map((y) => `M4 ${y}H146`).join(' ');
      const buhardilla = (x: number) =>
        `<path d="M${x} 52V30L${x + 14} 18L${x + 28} 30V52Z" fill="${aclarar(c, 0.15)}" stroke-width="1.8"/><rect x="${x + 7}" y="31" width="14" height="15" rx="1.5" fill="${VIDRIO}" stroke-width="1.4"/><path d="M${x + 14} 31V46" stroke-width="1.2"/>`;
      return base + `<path d="${hileras}" stroke="${os}" stroke-width="1.2" fill="none"/>` + buhardilla(26) + buhardilla(96);
    }
    default: {
      const lineas: string[] = [];
      for (let y = 14; y < 62; y += 9) {
        const desfase = ((y - 14) / 9) % 2 === 0 ? 0 : 6;
        const cortes: string[] = [];
        for (let x = 4 + desfase + 12; x < 146; x += 12) cortes.push(`M${x} ${y - 9}V${y}`);
        lineas.push(`<path d="M4 ${y}H146 ${cortes.join(' ')}" stroke="${os}" stroke-width="1.1" fill="none"/>`);
      }
      return base + lineas.join('') + `<path d="M8 8H142" stroke="${oscurecer(c, 0.35)}" stroke-width="3"/><rect x="112" y="6" width="14" height="18" rx="1.5" fill="#8a4a3a" stroke-width="1.8"/>`;
    }
  }
}

function pared(tipo: string, c: string): string {
  const os = oscurecer(c, 0.18);
  switch (tipo) {
    case 'paneles':
      return `<path d="${[22, 40, 58, 76, 94, 112, 130].map((x) => `M${x} 74V168`).join(' ')}" stroke="${os}" stroke-width="1.2" fill="none"/>`;
    case 'ladrillo': {
      const lineas: string[] = [];
      for (let y = 82; y < 168; y += 8) {
        const desfase = ((y - 82) / 8) % 2 === 0 ? 0 : 8;
        const cortes: string[] = [];
        for (let x = 4 + desfase + 16; x < 146; x += 16) cortes.push(`M${x} ${y - 8}V${y}`);
        lineas.push(`M4 ${y}H146 ${cortes.join(' ')}`);
      }
      return `<path d="${lineas.join(' ')}" stroke="${os}" stroke-width=".9" fill="none" opacity=".75"/>`;
    }
    case 'madera':
      return `<path d="${[83, 92, 101, 110, 119, 128, 137, 146, 155, 164].map((y) => `M4 ${y}H146`).join(' ')}" stroke="${os}" stroke-width="1" fill="none"/>`;
    case 'mosaico': {
      const r = azar(11);
      const colores = ['#e07a5f', '#e9b44c', '#81b29a', '#9b7bc4', '#8aa0c8'];
      const piezas: string[] = [];
      for (let i = 0; i < 26; i++) {
        const x = 8 + r() * 130;
        const y = 104 + r() * 60;
        if (x > 12 && x < 80 && y > 104 && y < 160) continue;
        if (x > 90 && x < 134 && y > 104) continue;
        piezas.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="5" height="5" rx="1" fill="${colores[i % colores.length]}" stroke="none" opacity=".8"/>`);
      }
      return piezas.join('');
    }
    case 'metal':
      return (
        `<path d="M4 90H146M4 118H146M4 146H146" stroke="${os}" stroke-width="1.3" fill="none"/>` +
        `<g fill="${os}" stroke="none">${[10, 140].flatMap((x) => [84, 112, 140, 162].map((y) => `<circle cx="${x}" cy="${y}" r="1.4"/>`)).join('')}</g>`
      );
    case 'vidrio':
      return (
        `<rect x="4" y="74" width="142" height="94" fill="#a9c7e0" opacity=".35" stroke="none"/>` +
        `<path d="M24 74V168M44 74V104M84 74V104M104 74V104M136 74V168M4 104H146" stroke="${oscurecer(c, 0.3)}" stroke-width="1.3" fill="none" opacity=".7"/>`
      );
    case 'piedra': {
      const r = azar(5);
      const piedras: string[] = [];
      for (let y = 76; y < 166; y += 10) {
        let x = 4 + (y % 20 === 6 ? 0 : 6);
        while (x < 146) {
          const ancho = 12 + Math.floor(r() * 10);
          const w = Math.min(ancho, 146 - x);
          if (w > 4) piedras.push(`<rect x="${x + 0.5}" y="${y + 0.5}" width="${w - 1}" height="9" rx="3" fill="${r() < 0.5 ? c : mezclar(c, '#b8a98f', 0.25)}" stroke="${os}" stroke-width=".9"/>`);
          x += ancho;
        }
      }
      return piedras.join('');
    }
    default:
      return '';
  }
}

function franja(barrio: Barrio): string {
  const c = FRANJA[barrio];
  switch (barrio) {
    case 'creativo': {
      const colores = ['#e07a5f', '#e9b44c', '#81b29a', '#9b7bc4'];
      const tramos = Array.from({ length: 8 }, (_, i) => `<rect x="${4 + i * 17.75}" y="64" width="17.75" height="10" fill="${colores[i % 4]}" stroke="none"/>`);
      return tramos.join('') + `<rect x="4" y="64" width="142" height="10" fill="none"/>`;
    }
    case 'tech':
      return (
        `<rect x="4" y="64" width="142" height="10" fill="${c}"/>` +
        `<path d="M10 69H140" stroke="#bfeaff" stroke-width="2.4" stroke-dasharray="5 7" opacity=".9"/>`
      );
    case 'academy':
      return (
        `<rect x="4" y="64" width="142" height="10" fill="${c}"/>` +
        `<path d="${Array.from({ length: 17 }, (_, i) => `M${10 + i * 8} 70V74`).join(' ')}" stroke="${oscurecer(c, 0.3)}" stroke-width="2" fill="none"/>`
      );
    default:
      return `<rect x="4" y="64" width="142" height="10" fill="${c}"/>`;
  }
}

function letrero(tipo: string, dueno: string): string {
  switch (tipo) {
    case 'marquesina':
      return (
        `<rect x="22" y="78" width="106" height="24" rx="5" fill="${CREMA}" stroke-width="1.8"/>` +
        `<path d="M28 81.5H122M28 98.5H122" stroke="${DORADO}" stroke-width="3.6" stroke-dasharray="0 8" stroke-linecap="round"/>`
      );
    case 'claqueta':
      return (
        `<rect x="25" y="78" width="100" height="23" rx="3" fill="#3b3134" stroke-width="1.6"/>` +
        `<rect x="25" y="78" width="100" height="6" fill="${CREMA}" stroke-width="1.6"/>` +
        `<path d="${Array.from({ length: 10 }, (_, i) => `M${30 + i * 10} 78L${26 + i * 10} 84`).join(' ')}" stroke="#3b3134" stroke-width="2.6"/>`
      );
    case 'neon':
      return (
        `<rect x="25" y="80" width="100" height="20" rx="6" fill="#2f3b4c" stroke-width="1.6"/>` +
        `<rect x="28.5" y="83.5" width="93" height="13" rx="4" fill="none" stroke="#7fd1ff" stroke-width="1.6" opacity=".9"/>`
      );
    case 'pantalla':
      return (
        `<rect x="25" y="79" width="100" height="22" rx="3" fill="#1f2a3a" stroke-width="1.6"/>` +
        `<path d="M27 83H123M27 87H123M27 91H123M27 95H123" stroke="#2c3d55" stroke-width="1" opacity=".9"/>`
      );
    case 'madera':
      return (
        `<rect x="25" y="80" width="100" height="20" rx="4" fill="#d9a877" stroke-width="1.6"/>` +
        `<path d="M30 85Q60 83 90 86T120 85M32 95Q58 93 84 96T118 95" stroke="#b9875a" stroke-width="1" fill="none"/>`
      );
    case 'pintado':
      return (
        `<rect x="25" y="80" width="100" height="20" rx="4" fill="${CREMA}" stroke-width="1.6"/>` +
        `<g stroke="none"><circle cx="30" cy="84" r="3.4" fill="#e07a5f" opacity=".8"/><circle cx="121" cy="96" r="3" fill="#3d85c6" opacity=".8"/><circle cx="117" cy="84" r="2" fill="#e9b44c"/><circle cx="33" cy="96" r="1.8" fill="#81b29a"/></g>`
      );
    case 'colgante':
      return (
        `<path d="M30 77H120" stroke-width="2.6"/><path d="M44 77V82M106 77V82" stroke-width="1.3"/>` +
        `<rect x="34" y="82" width="82" height="19" rx="4" fill="${CREMA}" stroke-width="1.6"/>`
      );
    case 'clasico':
      return (
        `<rect x="24" y="79" width="102" height="22" rx="2" fill="#2f5a40" stroke-width="1.6"/>` +
        `<rect x="27.5" y="82.5" width="95" height="15" rx="1" fill="none" stroke="${DORADO}" stroke-width="1.2"/>`
      );
    default:
      // Placa (la de la muestra), con un filo del color del dueño.
      return `<rect x="25" y="80" width="100" height="20" rx="4" fill="${CREMA}" stroke-width="1.5"/><path d="M29 98.5H121" stroke="${dueno}" stroke-width="1.6" opacity=".55"/>`;
  }
}

function ventana(tipo: string, barrio: Barrio): string {
  const vidrio = barrio === 'tech' ? '#a9c7e0' : VIDRIO;
  const reflejo = `<path d="M22 150L32 126" stroke="#fff" stroke-width="2.5" opacity=".45"/>`;
  switch (tipo) {
    case 'dos':
      return (
        `<rect x="16" y="122" width="26" height="32" rx="2" fill="${vidrio}" stroke-width="1.5"/><rect x="48" y="122" width="26" height="32" rx="2" fill="${vidrio}" stroke-width="1.5"/>` +
        `<path d="M16 138H42M48 138H74" stroke-width="1.3"/>`
      );
    case 'redonda':
      return `<circle cx="45" cy="139" r="16" fill="${vidrio}" stroke-width="1.6"/><path d="M45 123V155M29 139H61" stroke-width="1.3"/>`;
    case 'arco':
      return `<path d="M18 156V136Q18 121 45 121Q72 121 72 136V156Z" fill="${vidrio}" stroke-width="1.6"/><path d="M45 121V156M18 140H72" stroke-width="1.3"/>`;
    default:
      return `<rect x="16" y="120" width="58" height="36" fill="${vidrio}" stroke-width="1.5"/><path d="M45 120V156" stroke-width="1.5"/>${reflejo}`;
  }
}

function toldo(tipo: string, c: string): string {
  switch (tipo) {
    case 'ninguno':
      return `<rect x="13" y="114" width="64" height="5" rx="2" fill="${oscurecer(c, 0.1)}" stroke-width="1.5"/>`;
    case 'liso':
      return `<rect x="12" y="106" width="66" height="16" rx="3" fill="${c}"/><path d="M14 118H76" stroke="${oscurecer(c, 0.25)}" stroke-width="1.5"/>`;
    case 'ondas':
      return `<path d="M12 106H78V118${'a5.5 5.5 0 0 1 -11 0'.repeat(6)}Z" fill="${c}"/><path d="M14 111H76" stroke="#fff" stroke-width="2" opacity=".45"/>`;
    default: {
      const rayas = Array.from({ length: 6 }, (_, i) => `<rect x="${13 + i * 12}" y="107" width="6" height="14" fill="#fff" opacity=".5" stroke="none"/>`);
      return `<rect x="12" y="106" width="66" height="16" rx="3" fill="${c}"/>${rayas.join('')}<rect x="12" y="106" width="66" height="16" rx="3" fill="none"/>`;
    }
  }
}

function puerta(tipo: string, c: string): string {
  const pomo = (x: number) => `<circle cx="${x}" cy="140" r="2.5" fill="${CREMA}" stroke="none"/>`;
  switch (tipo) {
    case 'vidrio':
      return `<rect x="94" y="108" width="36" height="60" rx="3" fill="${c}"/><rect x="100" y="114" width="24" height="28" rx="2" fill="${VIDRIO}" stroke-width="1.4"/>${pomo(123)}`;
    case 'doble':
      return `<rect x="94" y="108" width="36" height="60" rx="3" fill="${c}"/><path d="M112 108V168" stroke-width="1.6"/>${pomo(108)}${pomo(116)}`;
    case 'arco':
      return `<path d="M94 168V125Q94 108 112 108Q130 108 130 125V168Z" fill="${c}"/><path d="M101 125Q101 116 112 116Q123 116 123 125" stroke="${CREMA}" stroke-width="1.3" fill="none" opacity=".6"/>${pomo(123)}`;
    default:
      return `<rect x="94" y="108" width="36" height="60" rx="3" fill="${c}"/>${pomo(123)}`;
  }
}

function frente(tipo: string, barrio: Barrio): string {
  const g = (contenido: string) => `<g stroke="${TINTA}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round">${contenido}</g>`;
  switch (tipo) {
    case 'plantas':
      return g(
        `<rect x="16" y="156" width="58" height="8" rx="2" fill="#b07a52"/>` +
        `<circle cx="24" cy="155" r="5" fill="#8fc47a"/><circle cx="36" cy="154" r="5.5" fill="#7cbf6b"/><circle cx="50" cy="155" r="5" fill="#8fc47a"/><circle cx="64" cy="154" r="5.5" fill="#7cbf6b"/>` +
        `<rect x="134" y="154" width="12" height="13" rx="2" fill="#c97b5a"/><circle cx="140" cy="148" r="7" fill="#7cbf6b"/>`,
      ) + `<g stroke="none"><circle cx="36" cy="152" r="1.6" fill="#e07a5f"/><circle cx="64" cy="152" r="1.6" fill="#e9b44c"/></g>`;
    case 'farol': {
      const luz = barrio === 'tech' ? '#7fd1ff' : DORADO;
      return (
        `<circle cx="139" cy="126" r="11" fill="${luz}" opacity=".3"/>` +
        g(`<path d="M134 120H146V134" fill="none"/><rect x="134" y="120" width="10" height="13" rx="2" fill="${barrio === 'tech' ? '#dff4ff' : CREMA}"/>`)
      );
    }
    case 'caballete':
      return g(
        `<path d="M134 168L140 132L146 168M140 132V168" fill="none"/>` +
        `<rect x="131" y="134" width="18" height="16" rx="1.5" fill="${CREMA}"/>`,
      ) + `<g stroke="none"><circle cx="136" cy="140" r="2.4" fill="#e07a5f"/><circle cx="143" cy="144" r="2.2" fill="#3d85c6"/><rect x="134" y="145" width="9" height="2" fill="#81b29a"/></g>`;
    case 'reflector':
      return g(
        `<path d="M134 168L140 146L146 168M140 146V168" fill="none"/>` +
        `<rect x="132" y="130" width="16" height="15" rx="3" fill="#4b4048"/><circle cx="140" cy="137.5" r="4.6" fill="${CREMA}"/>`,
      );
    case 'cartelera':
      return g(
        `<path d="M133 168L137 132H143L147 168" fill="#7e3f43"/><rect x="134.5" y="136" width="11" height="16" rx="1" fill="${CREMA}"/>`,
      ) + `<g stroke="none"><circle cx="140" cy="141" r="2.4" fill="${DORADO}"/><path d="M136 150L140 145L144 150Z" fill="#a95656"/></g>`;
    case 'robot':
      return g(
        `<rect x="132" y="146" width="16" height="16" rx="3" fill="#dfe7ee"/><rect x="134.5" y="149" width="11" height="6" rx="1.5" fill="#2f3b4c"/>` +
        `<circle cx="135.5" cy="165" r="2.6" fill="#4b4048"/><circle cx="144.5" cy="165" r="2.6" fill="#4b4048"/><path d="M140 146V141" fill="none"/>`,
      ) + `<g stroke="none"><circle cx="140" cy="140" r="1.8" fill="#7fd1ff"/><circle cx="137.5" cy="152" r="1" fill="#7fd1ff"/><circle cx="142.5" cy="152" r="1" fill="#7fd1ff"/></g>`;
    case 'pizarra':
      return g(`<path d="M133 168L137.5 134H142.5L147 168Z" fill="#2f5a40"/><path d="M134.5 160H145.5" fill="none"/>`) +
        `<path d="M137 141H143M136.5 146H143.5M136 151H142" stroke="#f4efe6" stroke-width="1.2" stroke-linecap="round" opacity=".85"/>`;
    default:
      return '';
  }
}

// ---------------------------------------------------------------
// Interior (480 × 300): pared del fondo arriba, piso abajo y la puerta al centro del borde inferior.
// El centro queda libre: ahí está el dueño (Phaser lo dibuja encima) y el camino desde la puerta.
// ---------------------------------------------------------------

/** Dónde se para el dueño y dónde aparece el jugador dentro del local. */
export const DUENO_INTERIOR = { x: 240, y: 168 };
export const JUGADOR_INTERIOR = { x: 240, y: 278 };
/** Centro de la placa con el nombre del local en la pared del fondo. */
export const PLACA_INTERIOR = { x: 240, y: 30 };

export function crearInterior(d: DatosCasa, opciones: { tamano?: { ancho: number; alto: number }; titulo?: string } = {}): string {
  const a = normalizarAparienciaCasa(d.barrio, d.apariencia);
  const cat = CATALOGO_CASA[d.barrio];
  const muro = colorDe(cat.paredInterior, a.paredInterior);
  const partes = [
    piso(d.barrio, a.piso),
    `<g stroke="${TINTA}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round">`,
    `<rect x="0" y="0" width="480" height="104" fill="${muro}"/>`,
    `<rect x="0" y="0" width="480" height="8" fill="${oscurecer(muro, 0.35)}"/>`,
    `<rect x="0" y="94" width="480" height="10" fill="${oscurecer(muro, 0.2)}"/>`,
    `<rect x="160" y="16" width="160" height="30" rx="6" fill="${CREMA}" stroke-width="2"/>`,
    `<path d="M168 41H312" stroke="${d.color}" stroke-width="2" opacity=".6"/>`,
    decoracion(a.decoracion),
    muebles(a.muebles),
    `<rect x="0" y="0" width="16" height="300" fill="${oscurecer(muro, 0.3)}"/><rect x="464" y="0" width="16" height="300" fill="${oscurecer(muro, 0.3)}"/>`,
    `<rect x="0" y="286" width="208" height="14" fill="${oscurecer(muro, 0.3)}"/><rect x="272" y="286" width="208" height="14" fill="${oscurecer(muro, 0.3)}"/>`,
    `<rect x="214" y="282" width="52" height="14" rx="3" fill="${d.color}" stroke-width="2"/>`,
    `</g>`,
  ];
  return envolver(`0 0 ${ANCHO_INTERIOR} ${ALTO_INTERIOR}`, partes.join(''), opciones.tamano, opciones.titulo);
}

function piso(barrio: Barrio, tipo: string): string {
  const fondo = (c: string) => `<rect x="0" y="104" width="480" height="196" fill="${c}"/>`;
  const tablas = (c: string, alto = 18) => {
    const lineas: string[] = [];
    for (let y = 104 + alto, fila = 0; y < 300; y += alto, fila++) {
      const cortes: string[] = [];
      for (let x = (fila % 2) * 60 + 90; x < 480; x += 120) cortes.push(`M${x} ${y - alto}V${y}`);
      lineas.push(`M0 ${y}H480 ${cortes.join(' ')}`);
    }
    return fondo(c) + `<path d="${lineas.join(' ')}" stroke="${oscurecer(c, 0.18)}" stroke-width="1.4" fill="none"/>`;
  };
  const cuadros = (c1: string, c2: string, lado = 32) => {
    const celdas: string[] = [];
    for (let y = 104, fila = 0; y < 300; y += lado, fila++) {
      for (let x = 0, col = 0; x < 480; x += lado, col++) {
        if ((fila + col) % 2) celdas.push(`<rect x="${x}" y="${y}" width="${lado}" height="${lado}" fill="${c2}"/>`);
      }
    }
    return fondo(c1) + celdas.join('');
  };
  const alfombra = (base: string, c: string) =>
    tablas(base) +
    `<rect x="120" y="128" width="240" height="150" rx="10" fill="${c}" stroke="${TINTA}" stroke-width="2"/><rect x="132" y="140" width="216" height="126" rx="6" fill="none" stroke="${aclarar(c, 0.35)}" stroke-width="2"/>`;

  if (barrio === 'audiovisual') {
    if (tipo === 'madera') return tablas('#7a5243');
    if (tipo === 'damero') return cuadros('#ece3d6', '#4b4048');
    return alfombra('#6b4a3e', '#b5554f');
  }
  if (barrio === 'tech') {
    if (tipo === 'madera') return tablas('#e6d2b5');
    if (tipo === 'baldosa') return cuadros('#d6dde4', '#c8d1da', 40);
    return fondo('#d9dee3') + `<g fill="#c6cdd4">${[60, 170, 300, 410, 120, 360].map((x, i) => `<circle cx="${x}" cy="${140 + (i * 37) % 140}" r="${2 + (i % 3)}"/>`).join('')}</g>`;
  }
  if (barrio === 'creativo') {
    if (tipo === 'baldosa') {
      const colores = ['#f3c9b9', '#f6e1a8', '#cfe3d4', '#ddd1ee'];
      const celdas: string[] = [];
      for (let y = 104, f = 0; y < 300; y += 28, f++) {
        for (let x = 0, c = 0; x < 480; x += 28, c++) celdas.push(`<rect x="${x}" y="${y}" width="28" height="28" fill="${colores[(f + c * 3) % 4]}"/>`);
      }
      return fondo('#fdf0dc') + celdas.join('') + `<path d="${Array.from({ length: 18 }, (_, i) => `M${i * 28} 104V300`).join(' ')} ${Array.from({ length: 8 }, (_, i) => `M0 ${104 + i * 28}H480`).join(' ')}" stroke="#fdf6e3" stroke-width="2"/>`;
    }
    if (tipo === 'alfombra') return alfombra('#d9b08a', '#e9b44c');
    return tablas('#d9b08a');
  }
  // Academy
  if (tipo === 'baldosa') return cuadros('#e8dcc8', '#d4c3a6');
  if (tipo === 'alfombra') return alfombra('#9a6a4f', '#5d9b78');
  // Parquet en espiga sencillo.
  const piezas: string[] = [];
  for (let y = 104, f = 0; y < 300; y += 20, f++) {
    for (let x = (f % 2) * 20, c = 0; x < 480; x += 40, c++) piezas.push(`M${x} ${y}l20 20M${x + 20} ${y}l20 20`);
  }
  return fondo('#b98a62') + `<path d="${piezas.join('')}" stroke="#9a6d4b" stroke-width="1.4"/>`;
}

function decoracion(tipo: string): string {
  const marco = (x: number, y: number, w: number, h: number, relleno: string) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="#b07a52" stroke-width="2"/><rect x="${x + 4}" y="${y + 4}" width="${w - 8}" height="${h - 8}" fill="${relleno}" stroke-width="1.4"/>`;
  const plantaPiso = (x: number) =>
    `<rect x="${x - 11}" y="260" width="22" height="22" rx="3" fill="#c97b5a"/><circle cx="${x - 7}" cy="252" r="10" fill="#7cbf6b"/><circle cx="${x + 7}" cy="248" r="11" fill="#8fc47a"/><circle cx="${x}" cy="238" r="9" fill="#7cbf6b"/>`;
  switch (tipo) {
    case 'cuadros':
      return (
        marco(40, 22, 44, 54, '#e9b44c') + `<circle cx="62" cy="44" r="10" fill="#e07a5f" stroke-width="1.4"/>` +
        marco(96, 30, 48, 38, '#8aa0c8') + `<path d="M104 60L116 46L126 56L132 50L140 60Z" fill="#5d9b78" stroke-width="1.4"/>` +
        marco(340, 22, 40, 50, '#9b7bc4') + `<rect x="350" y="34" width="20" height="26" fill="#fdf6e3" stroke-width="1.4"/>` +
        marco(392, 30, 52, 40, '#81b29a') + `<circle cx="418" cy="50" r="8" fill="#fdf6e3" stroke-width="1.4"/>`
      );
    case 'repisas':
      return (
        `<path d="M36 52H148M36 82H148M332 52H444M332 82H444" stroke-width="3.5"/>` +
        [44, 64, 84, 110, 130, 340, 362, 384, 410, 430]
          .map((x, i) => `<rect x="${x}" y="${i % 2 ? 36 : 66}" width="12" height="15" rx="2" fill="${['#e07a5f', '#e9b44c', '#3d85c6', '#81b29a', '#9b7bc4'][i % 5]}" stroke-width="1.6"/>`)
          .join('') + plantaPiso(36) + plantaPiso(444)
      );
    case 'plantas':
      return (
        `<path d="M70 8V30M410 8V30" stroke-width="1.6"/><path d="M58 30H82L78 44H62Z" fill="#c97b5a"/><path d="M398 30H422L418 44H402Z" fill="#c97b5a"/>` +
        `<path d="M62 44Q56 64 52 76M70 44Q70 66 68 82M78 44Q86 62 90 74M402 44Q396 64 392 76M410 44Q410 66 408 82M418 44Q426 62 430 74" stroke="#5d9b78" stroke-width="4" fill="none"/>` +
        plantaPiso(36) + plantaPiso(444)
      );
    case 'pantallas':
      return (
        `<rect x="36" y="20" width="110" height="64" rx="4" fill="#1f2a3a"/><rect x="334" y="20" width="110" height="64" rx="4" fill="#1f2a3a"/>` +
        `<path d="M46 34H90M52 44H120M52 54H98M46 64H76M344 34H400M350 44H426M350 54H392M344 64H372" stroke="#7fd1ff" stroke-width="3" opacity=".9"/>` +
        `<path d="M96 34H112M400 64H420" stroke="#e9b44c" stroke-width="3"/>`
      );
    case 'luces':
      return (
        `<path d="M20 12H460" stroke="#7fd1ff" stroke-width="4" stroke-dasharray="10 8" opacity=".95"/>` +
        `<rect x="44" y="28" width="96" height="44" rx="10" fill="none" stroke="#9b7bc4" stroke-width="4"/><path d="M62 50H122" stroke="#9b7bc4" stroke-width="4"/>` +
        `<rect x="340" y="28" width="96" height="44" rx="22" fill="none" stroke="#7fd1ff" stroke-width="4"/>`
      );
    case 'afiches': {
      const afiche = (x: number, c: string, simbolo: string) =>
        `<rect x="${x}" y="18" width="44" height="64" rx="2" fill="${c}" stroke-width="2"/><rect x="${x + 5}" y="23" width="34" height="40" fill="${CREMA}" stroke-width="1.4"/>${simbolo}<path d="M${x + 8} 72H${x + 36}" stroke="${CREMA}" stroke-width="3"/>`;
      return (
        afiche(40, '#46557a', `<circle cx="62" cy="40" r="8" fill="#e9b44c" stroke-width="1.4"/><path d="M50 60L62 46L74 60Z" fill="#a95656" stroke-width="1.4"/>`) +
        afiche(96, '#7e3f43', `<path d="M108 52L118 34L128 52Z" fill="#5d9b78" stroke-width="1.4"/>`) +
        afiche(340, '#5d9b78', `<circle cx="362" cy="43" r="11" fill="#fdf6e3" stroke-width="1.4"/><circle cx="362" cy="43" r="4" fill="#e9b44c" stroke-width="1.2"/>`) +
        afiche(396, '#a95656', `<rect x="408" y="34" width="20" height="16" rx="3" fill="#4b4048" stroke-width="1.4"/>`)
      );
    }
    case 'focos':
      return (
        `<path d="M24 14Q122 34 220 14M260 14Q358 34 456 14" stroke-width="1.6" fill="none"/>` +
        [44, 80, 116, 152, 188, 284, 320, 356, 392, 428].map((x, i) => `<circle cx="${x}" cy="${20 + Math.round(Math.sin((i % 5) / 4 * Math.PI) * 6)}" r="5" fill="${DORADO}" stroke-width="1.4"/>`).join('') +
        `<path d="M60 52L84 66M420 52L396 66" stroke-width="3"/><rect x="40" y="36" width="34" height="26" rx="4" fill="${CREMA}" stroke-width="2" transform="rotate(25 57 49)"/>` +
        `<rect x="406" y="36" width="34" height="26" rx="4" fill="${CREMA}" stroke-width="2" transform="rotate(-25 423 49)"/>`
      );
    case 'vinilos':
      return [52, 104, 356, 408]
        .map((x, i) => `<circle cx="${x}" cy="${48 + (i % 2) * 6}" r="22" fill="#2b2326" stroke-width="2"/><circle cx="${x}" cy="${48 + (i % 2) * 6}" r="8" fill="${['#e07a5f', '#e9b44c', '#5d9b78', '#8aa0c8'][i]}" stroke-width="1.4"/><circle cx="${x}" cy="${48 + (i % 2) * 6}" r="14" fill="none" stroke="#4b4048" stroke-width="1"/>`)
        .join('');
    case 'diplomas':
      return [40, 96, 340, 396]
        .map((x) => marco(x, 24, 44, 52, CREMA) + `<path d="M${x + 12} 40H${x + 32}M${x + 12} 48H${x + 32}M${x + 16} 56H${x + 28}" stroke="#7a6a5f" stroke-width="2"/><circle cx="${x + 22}" cy="66" r="4" fill="#a95656" stroke-width="1.2"/>`)
        .join('');
    case 'mapa':
      return (
        marco(36, 18, 120, 66, '#cfe3ea') +
        `<path d="M50 40Q60 32 72 38T92 36Q100 46 90 54T66 58Q52 54 50 40ZM104 30Q118 26 128 34T140 50Q132 64 118 60T104 30Z" fill="#8fc47a" stroke-width="1.4"/>` +
        `<path d="M360 86H444" stroke-width="3.5"/><path d="M394 86L402 78H410L418 86" fill="#8a5a44" stroke-width="2"/>` +
        `<circle cx="406" cy="54" r="22" fill="#cfe3ea"/><path d="M392 46Q404 40 414 48T420 64Q408 70 398 60Z" fill="#8fc47a" stroke-width="1.4"/><path d="M406 30V78" stroke-width="2"/>`
      );
    default:
      return '';
  }
}

function muebles(tipo: string): string {
  const silla = (x: number, y: number, c = '#8a5a44') => `<rect x="${x - 10}" y="${y - 10}" width="20" height="20" rx="5" fill="${c}"/>`;
  const escritorio = (x: number, y: number, w: number, c = '#b07a52') => `<rect x="${x}" y="${y}" width="${w}" height="34" rx="4" fill="${c}"/>`;
  const monitor = (x: number, y: number) =>
    `<rect x="${x}" y="${y}" width="40" height="26" rx="3" fill="#2f3b4c"/><rect x="${x + 4}" y="${y + 4}" width="32" height="18" rx="1.5" fill="#7fd1ff" stroke-width="1.4"/>`;
  switch (tipo) {
    // Creativo
    case 'atril':
      return (
        `<path d="M62 262L88 150L114 262M88 150V262" stroke-width="4" fill="none"/><rect x="58" y="146" width="60" height="62" rx="2" fill="${CREMA}"/>` +
        `<circle cx="78" cy="168" r="10" fill="#e9b44c" stroke-width="1.6"/><path d="M66 200L84 180L98 194L108 186L114 200Z" fill="#81b29a" stroke-width="1.6"/>` +
        escritorio(346, 186, 92) + `<g stroke-width="1.6">${['#e07a5f', '#3d85c6', '#e9b44c', '#9b7bc4'].map((c, i) => `<rect x="${356 + i * 20}" y="174" width="12" height="16" rx="2" fill="${c}"/>`).join('')}</g>` + silla(150, 236, '#c97b5a')
      );
    case 'mesa-dibujo':
      return (
        `<path d="M54 248L70 200M150 248L136 200" stroke-width="4"/><path d="M48 202L156 182L160 214L52 232Z" fill="#e8dcc6"/><rect x="74" y="196" width="50" height="22" rx="2" fill="#fff" stroke-width="1.4" transform="rotate(-10 99 207)"/>` +
        `<path d="M150 150V186M150 150L176 160" stroke-width="3" fill="none"/><path d="M168 154L190 162L182 176Z" fill="#e9b44c"/>` +
        escritorio(340, 190, 100, '#c9a27a') + `<rect x="354" y="160" width="70" height="30" rx="3" fill="#e8dcc6"/>` + silla(100, 262)
      );
    case 'taller':
      return (
        `<ellipse cx="96" cy="228" rx="40" ry="16" fill="#8a7a6e"/><ellipse cx="96" cy="222" rx="30" ry="11" fill="#b5a79b"/><path d="M84 220Q86 196 96 196Q106 196 108 220Z" fill="#c97b5a"/>` +
        `<rect x="336" y="140" width="110" height="18" rx="2" fill="#b07a52"/><rect x="336" y="196" width="110" height="18" rx="2" fill="#b07a52"/>` +
        [350, 380, 410].map((x, i) => `<path d="M${x} 140Q${x - 6} 120 ${x + 2} 116H${x + 14}Q${x + 22} 120 ${x + 16} 140Z" fill="${['#e07a5f', '#81b29a', '#e9b44c'][i]}" stroke-width="1.8"/>`).join('') +
        [356, 396].map((x, i) => `<ellipse cx="${x + 8}" cy="186" rx="13" ry="10" fill="${['#9b7bc4', '#c97b5a'][i]}" stroke-width="1.8"/>`).join('')
      );
    // Tech
    case 'escritorio':
      return (
        escritorio(36, 190, 150, '#dfe7ee') + monitor(52, 162) + monitor(100, 162) + `<rect x="148" y="176" width="26" height="14" rx="2" fill="#2f3b4c"/>` + silla(110, 246, '#46557a') +
        escritorio(300, 190, 150, '#dfe7ee') + monitor(318, 162) + `<rect x="370" y="168" width="60" height="20" rx="3" fill="#b9c2cc"/>` + silla(372, 246, '#46557a')
      );
    case 'servidores': {
      const rack = (x: number) =>
        `<rect x="${x}" y="122" width="40" height="120" rx="3" fill="#2f3b4c"/>` +
        [134, 154, 174, 194, 214].map((y) => `<rect x="${x + 5}" y="${y}" width="30" height="12" rx="1.5" fill="#46557a" stroke-width="1.2"/>`).join('') +
        `<g stroke="none">${[140, 160, 180, 200, 220].map((y, i) => `<circle cx="${x + 30}" cy="${y}" r="2" fill="${i % 2 ? '#7fd1ff' : '#8fe3a1'}"/>`).join('')}</g>`;
      return rack(36) + rack(84) + rack(132) + escritorio(318, 196, 126, '#dfe7ee') + monitor(340, 168) + monitor(390, 168) + silla(380, 252, '#46557a');
    }
    case 'arcade': {
      const maquina = (x: number, c: string) =>
        `<path d="M${x} 250V150L${x + 10} 130H${x + 50}L${x + 56} 150V250Z" fill="${c}"/><rect x="${x + 8}" y="144" width="40" height="32" rx="2" fill="#1f2a3a"/><path d="M${x + 14} 156H${x + 42}M${x + 14} 164H${x + 32}" stroke="#7fd1ff" stroke-width="2.5"/>` +
        `<rect x="${x + 4}" y="186" width="48" height="12" rx="2" fill="#4b4048"/><circle cx="${x + 18}" cy="192" r="3" fill="#e07a5f" stroke-width="1.2"/><circle cx="${x + 34}" cy="192" r="3" fill="#e9b44c" stroke-width="1.2"/>`;
      return maquina(40, '#3d85c6') + maquina(108, '#9b7bc4') + `<ellipse cx="384" cy="232" rx="44" ry="30" fill="#e07a5f"/><ellipse cx="384" cy="222" rx="30" ry="16" fill="#e8907a" stroke-width="1.6"/>`;
    }
    // Audiovisual
    case 'set-fotos':
      return (
        `<rect x="40" y="110" width="130" height="10" rx="5" fill="#4b4048"/><path d="M50 120H160V246Q105 236 50 246Z" fill="#ece3d6"/>` +
        `<path d="M98 258L106 214L114 258M106 214V258" stroke-width="3.5" fill="none"/><rect x="92" y="198" width="28" height="18" rx="3" fill="#4b4048"/><circle cx="106" cy="207" r="5" fill="#8aa0c8" stroke-width="1.4"/>` +
        `<path d="M356 262L380 190L404 262M380 190V262" stroke-width="3.5" fill="none"/><path d="M350 150H410L396 192H364Z" fill="${CREMA}"/>`
      );
    case 'sala-edicion':
      return (
        escritorio(36, 186, 160, '#4b4048') + `<rect x="50" y="146" width="70" height="40" rx="3" fill="#1f2a3a"/><rect x="56" y="152" width="58" height="28" rx="1.5" fill="#8aa0c8" stroke-width="1.2"/>` +
        `<path d="M58 172H70M74 172H96M60 176H88" stroke="#e9b44c" stroke-width="2"/>` +
        `<rect x="126" y="152" width="56" height="34" rx="3" fill="#1f2a3a"/><rect x="131" y="157" width="46" height="24" rx="1.5" fill="#a95656" stroke-width="1.2"/>` +
        `<rect x="40" y="160" width="10" height="26" rx="2" fill="#2b2326"/>` + silla(116, 244, '#7e3f43') +
        `<rect x="318" y="200" width="128" height="50" rx="12" fill="#7e3f43"/><rect x="318" y="190" width="128" height="22" rx="10" fill="#a95656" stroke-width="2"/>`
      );
    case 'cabina':
      return (
        `<path d="M96 262V176M80 262H112M96 176L122 160" stroke-width="3.5" fill="none"/><rect x="116" y="146" width="14" height="22" rx="7" fill="#aab3c0" transform="rotate(-30 123 157)"/>` +
        escritorio(300, 188, 146, '#4b4048') +
        `<g stroke-width="1.4">${Array.from({ length: 8 }, (_, i) => `<rect x="${310 + i * 16}" y="196" width="8" height="18" rx="2" fill="#2b2326"/><circle cx="${314 + i * 16}" cy="${200 + (i * 5) % 12}" r="2.4" fill="${CREMA}"/>`).join('')}</g>` +
        silla(372, 250, '#7e3f43') + `<g stroke-width="1.6">${[36, 64].map((x) => `<rect x="${x}" y="120" width="22" height="60" rx="3" fill="#5d5159"/>`).join('')}</g>`
      );
    // Academy
    case 'aula': {
      const pupitre = (x: number, y: number) => `<rect x="${x}" y="${y}" width="52" height="26" rx="3" fill="#b07a52"/>` + silla(x + 26, y + 40, '#5d9b78');
      return (
        `<rect x="40" y="112" width="132" height="56" rx="3" fill="#2f5a40"/><rect x="40" y="166" width="132" height="6" rx="2" fill="#8a5a44"/>` +
        `<path d="M54 128H104M54 140H128M54 152H92" stroke="#f4efe6" stroke-width="2.4" opacity=".85"/>` +
        pupitre(48, 196) + pupitre(120, 196) + pupitre(316, 176) + pupitre(388, 176)
      );
    }
    case 'biblioteca': {
      const estante = (x: number) =>
        `<rect x="${x}" y="112" width="58" height="140" rx="3" fill="#8a5a44"/>` +
        [124, 158, 192, 226]
          .map((y) => Array.from({ length: 5 }, (_, i) => `<rect x="${x + 5 + i * 10}" y="${y}" width="8" height="26" rx="1" fill="${['#a95656', '#5d9b78', '#e9b44c', '#46557a', '#c97b5a'][(i + y) % 5]}" stroke-width="1.1"/>`).join(''))
          .join('');
      return estante(28) + estante(92) + estante(330) + estante(394) + `<ellipse cx="240" cy="236" rx="48" ry="16" fill="#b07a52" stroke-width="2"/>`;
    }
    case 'mesa-redonda':
      return (
        `<circle cx="110" cy="214" r="46" fill="#b07a52"/>${[[110, 154], [52, 214], [168, 214], [110, 272]].map(([x, y]) => silla(x, y, '#5d9b78')).join('')}` +
        `<rect x="88" y="200" width="30" height="20" rx="2" fill="${CREMA}" stroke-width="1.4"/>` +
        `<circle cx="378" cy="214" r="46" fill="#b07a52"/>${[[378, 154], [320, 214], [436, 214], [378, 272]].map(([x, y]) => silla(x, y, '#5d9b78')).join('')}`
      );
    default:
      return '';
  }
}
