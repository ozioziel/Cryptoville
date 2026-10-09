// Reglas de Cryptoville: todos los números que el equipo puede querer cambiar, en un solo lugar.
//
// - La API valida con estos valores, la web los muestra y la página «Comisiones y reglas» los lee de aquí,
//   así el texto y el código nunca se contradicen.
// - Cada red (testnet / mainnet) tiene sus propios valores.
// - Los valores marcados con «Debe coincidir con el contrato» también viven en el contrato de escrow:
//   si cambias uno aquí, cámbialo también en el contrato (con set_comision, set_plazo_revision…).
import type { RedStellar } from './stellar/lab-links.js';

/** Para qué se exige tener el KYC aprobado (si el KYC está encendido en el servidor). */
export type UsoKyc = 'abrir_local' | 'cobrar' | 'resenar';

export interface Reglas {
  comisiones: {
    /** Pago directo, sin garantía (el contrato solo reparte el pago en el momento). */
    directoBps: number;
    /** Pago con garantía (una sola fase). // Debe coincidir con el contrato (comision_bps). */
    garantiaBps: number;
    /** Pago por etapas: se cobra en cada fase, así que en total es lo mismo que pagar todo junto. */
    etapasBps: number;
  };
  fases: {
    /** Fases de un pago por etapas (la garantía simple es un plan de 1 fase). */
    min: number;
    max: number;
    /** Veces que el cliente puede pedir cambios en una misma fase. // Debe coincidir con el contrato v2. */
    cambiosPorFase: number;
  };
  plazos: {
    /** Plazo de revisión del cliente después de cada entrega. // Debe coincidir con el contrato (plazo_revision_seg). */
    revisionSeg: number;
    /** Si el árbitro no resuelve una disputa en este plazo, cualquiera puede repartirla 50/50. // Debe coincidir con el contrato v2. */
    disputaMaxSeg: number;
    /** Aviso mínimo antes de actualizar el código del contrato v2. // Debe coincidir con el contrato v2. */
    avisoActualizacionSeg: number;
    /** Aviso por correo o notificación antes de que venza un plazo. */
    avisoVencimientoSeg: number;
  };
  /** Monto máximo de un pedido (USDC). 0 = sin tope. // Debe coincidir con el contrato v2 (tope_pedido). */
  topePedidoUsdc: string;
  locales: {
    /** Locales gratis por persona. */
    gratis: number;
    /** Pago único por cada local extra (USDC, a la tesorería). */
    precioExtraUsdc: string;
    /** Tope absoluto de locales por persona. */
    maximo: number;
  };
  villa: {
    /** Casas por sector: la entrada (4 lotes) más 8 calles de 7. Después se abre «Creativo B», «Creativo C»… */
    casasPorSector: number;
  };
  chatCercania: {
    /** Días que se guardan los mensajes (solo para revisar reportes). Después se borran solos. */
    diasGuardado: number;
    /** Mensajes por minuto que puede mandar una persona. */
    mensajesPorMinuto: number;
    /** Distancia (píxeles del mundo) a la que aparece «Hablar con…». */
    distancia: number;
    largoMaximo: number;
  };
  presencia: {
    /** Personas que se dibujan como máximo (las más cercanas). */
    maxVisibles: number;
    /** Posiciones por segundo que manda cada persona. */
    posicionesPorSegundo: number;
  };
  archivos: {
    /** Pruebas de una fase (archivos): tamaño máximo y tipos permitidos. */
    pruebaMaxBytes: number;
    pruebaTipos: readonly string[];
    /** Capturas del botón «Enviar comentarios». */
    capturaMaxBytes: number;
    /** Duración máxima de los videos (Mux), en segundos. */
    videoPruebaMaxSeg: number;
    videoPortafolioMaxSeg: number;
    /** Archivos y enlaces por prueba. */
    maxPorPrueba: number;
  };
  portafolio: {
    maxProyectos: number;
    /** @deprecated Se usa `cv.maxPorSeccion` (cada sección del CV cuenta aparte). */
    maxExperiencias: number;
    maxMediosPorProyecto: number;
    /** Proyectos destacados: se cuelgan como cuadros en la pared del interior de los locales. */
    maxDestacados: number;
    /** Proyectos que se pueden adjuntar a una propuesta. */
    maxEnPropuesta: number;
    /** Dominios de video que se pueden ver dentro de Cryptoville (además de Mux). */
    dominiosVideo: readonly string[];
  };
  trabajos: {
    /** Trabajos terminados que una persona puede mostrar en su perfil público («Trabajos verificados»). */
    maxPublicos: number;
  };
  cv: {
    /** «Acerca de mí». */
    largoAcercaDe: number;
    maxHabilidades: number;
    largoHabilidad: number;
    maxIdiomas: number;
    /** El CV en PDF (bucket público `cvs`). */
    pdfMaxBytes: number;
    /** Elementos por sección (experiencia, educación, certificaciones, premios y voluntariado). */
    maxPorSeccion: number;
  };
  kyc: {
    /** Para qué se exige el KYC aprobado. Si el KYC está apagado en el servidor, no se exige nada. */
    exigidoPara: readonly UsoKyc[];
  };
}

const DIA = 24 * 60 * 60;
const MB = 1024 * 1024;

const BASE: Reglas = {
  comisiones: { directoBps: 100, garantiaBps: 300, etapasBps: 300 },
  fases: { min: 1, max: 5, cambiosPorFase: 2 },
  plazos: { revisionSeg: 3 * DIA, disputaMaxSeg: 14 * DIA, avisoActualizacionSeg: 7 * DIA, avisoVencimientoSeg: DIA },
  topePedidoUsdc: '0',
  locales: { gratis: 3, precioExtraUsdc: '5', maximo: 10 },
  villa: { casasPorSector: 60 },
  chatCercania: { diasGuardado: 7, mensajesPorMinuto: 20, distancia: 70, largoMaximo: 280 },
  presencia: { maxVisibles: 50, posicionesPorSegundo: 8 },
  archivos: {
    pruebaMaxBytes: 50 * MB,
    pruebaTipos: [
      'image/png',
      'image/jpeg',
      'image/webp',
      'application/pdf',
      'application/zip',
      'text/plain',
      'audio/mpeg',
      'audio/wav',
    ],
    capturaMaxBytes: 2 * MB,
    videoPruebaMaxSeg: 10 * 60,
    videoPortafolioMaxSeg: 5 * 60,
    maxPorPrueba: 10,
  },
  portafolio: {
    maxProyectos: 30,
    maxExperiencias: 20,
    maxMediosPorProyecto: 8,
    maxDestacados: 4,
    maxEnPropuesta: 5,
    dominiosVideo: ['youtube.com', 'www.youtube.com', 'youtu.be', 'vimeo.com', 'player.vimeo.com'],
  },
  trabajos: { maxPublicos: 6 },
  cv: { largoAcercaDe: 2000, maxHabilidades: 30, largoHabilidad: 40, maxIdiomas: 10, pdfMaxBytes: 5 * MB, maxPorSeccion: 20 },
  kyc: { exigidoPara: ['abrir_local', 'cobrar', 'resenar'] },
};

/**
 * Valores por red. En mainnet el tope por pedido limita el riesgo durante el lanzamiento.
 * (Las cifras de mainnet son una propuesta inicial: revísalas antes de lanzar.)
 */
export const REGLAS: Record<RedStellar, Reglas> = {
  testnet: BASE,
  mainnet: { ...BASE, topePedidoUsdc: '500' },
};

export function reglasDe(red: RedStellar): Reglas {
  return REGLAS[red];
}

/** Puntos base a porcentaje legible (300 → "3%", 150 → "1.5%"). */
export function porcentajeBps(bps: number): string {
  const texto = (bps / 100).toFixed(2).replace(/\.?0+$/, '');
  return `${texto}%`;
}

/** Sector de un lote: 1 para los lotes 1–60, 2 para 61–120… (con 60 casas por sector). */
export function sectorDeLote(lote: number, casasPorSector = BASE.villa.casasPorSector): number {
  return Math.max(1, Math.ceil(Math.max(1, Math.floor(lote)) / casasPorSector));
}

/** Lote dentro de su sector (1–60): define dónde se dibuja la casa. */
export function loteEnSector(lote: number, casasPorSector = BASE.villa.casasPorSector): number {
  const n = Math.max(1, Math.floor(lote));
  return ((n - 1) % casasPorSector) + 1;
}

/** Nombre del sector: «Creativo», «Creativo B», «Creativo C»… */
export function nombreSector(nombreVilla: string, sector: number): string {
  if (sector <= 1) return nombreVilla;
  let n = sector - 1;
  let letras = '';
  // B, C, …, Z, AA, AB…
  do {
    letras = String.fromCharCode(65 + (n % 26)) + letras;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return `${nombreVilla} ${letras}`;
}
