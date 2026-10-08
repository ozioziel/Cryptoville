// Datos curiosos que se leen al entrar al edificio central de cada villa (solo decoración).
//
// - Más de la mitad son sobre Stellar y se comprobaron en la documentación oficial
//   (developers.stellar.org y stellar.org). Cada dato lleva su fuente.
// - Si agregas uno, verifícalo antes: nada de cifras inventadas.
import type { Barrio } from './types/index.js';

export interface DatoCurioso {
  /** 'stellar', 'general' o la villa a la que pertenece el dato. */
  tema: 'stellar' | 'general' | Barrio;
  texto: string;
  fuente: string;
}

const DOCS = 'https://developers.stellar.org/docs';

export const DATOS_CURIOSOS: readonly DatoCurioso[] = [
  // ---------- Stellar ----------
  {
    tema: 'stellar',
    texto: 'El nombre «Soroban», la plataforma de contratos inteligentes de Stellar, viene del ábaco japonés.',
    fuente: `${DOCS}/learn/glossary`,
  },
  {
    tema: 'stellar',
    texto: 'Los contratos de Soroban se escriben en Rust y se compilan a WebAssembly (Wasm) para subirlos a la red.',
    fuente: `${DOCS}/build/smart-contracts/overview`,
  },
  {
    tema: 'stellar',
    texto: 'Los contratos inteligentes llegaron a la red principal de Stellar con el Protocolo 20, que los validadores aprobaron en febrero de 2024.',
    fuente: 'https://stellar.org/blog/developers/protocol-20-and-smart-contracts-are-live-on-mainnet',
  },
  {
    tema: 'stellar',
    texto: 'En Stellar se cierra un nuevo libro contable (ledger) más o menos cada 5 segundos.',
    fuente: `${DOCS}/learn/fundamentals/stellar-data-structures/ledgers`,
  },
  {
    tema: 'stellar',
    texto: 'Un stroop es la unidad más pequeña: la diezmillonésima parte de un lumen (0,0000001 XLM). Por eso los montos tienen 7 decimales, igual que el USDC de prueba de WorkVille.',
    fuente: `${DOCS}/learn/fundamentals/fees-resource-limits-metering`,
  },
  {
    tema: 'stellar',
    texto: 'La comisión mínima de la red es de 100 stroops por operación: 0,00001 XLM.',
    fuente: `${DOCS}/learn/fundamentals/fees-resource-limits-metering`,
  },
  {
    tema: 'stellar',
    texto: 'Una transacción de Stellar puede llevar hasta 100 operaciones. Las que ejecutan un contrato inteligente llevan solo una.',
    fuente: `${DOCS}/learn/fundamentals/fees-resource-limits-metering`,
  },
  {
    tema: 'stellar',
    texto: 'Toda cuenta debe mantener un saldo mínimo de dos reservas base, hoy 1 XLM. Cada línea de confianza u oferta suma media reserva (0,5 XLM).',
    fuente: `${DOCS}/learn/fundamentals/lumens`,
  },
  {
    tema: 'stellar',
    texto: 'En testnet, Friendbot regala 10.000 XLM de prueba para crear una cuenta nueva.',
    fuente: `${DOCS}/networks`,
  },
  {
    tema: 'stellar',
    texto: 'La testnet se reinicia normalmente de 2 a 4 veces al año y se avisa con al menos dos semanas de anticipación.',
    fuente: `${DOCS}/networks`,
  },
  {
    tema: 'stellar',
    texto: 'Cada red tiene su frase de red. La de testnet es «Test SDF Network ; September 2015», y las transacciones se firman para una sola red.',
    fuente: `${DOCS}/networks`,
  },
  {
    tema: 'stellar',
    texto: 'La red nació con 100 mil millones de lumens. La inflación del 1 % anual terminó por votación de los validadores el 28 de octubre de 2019.',
    fuente: `${DOCS}/learn/fundamentals/lumens`,
  },
  {
    tema: 'stellar',
    texto: 'El 4 de noviembre de 2019 la Stellar Development Foundation envió 55,4 mil millones de lumens a una dirección inaccesible: salieron de circulación para siempre.',
    fuente: `${DOCS}/learn/fundamentals/lumens`,
  },
  {
    tema: 'stellar',
    texto: 'Para tener un activo que no sea XLM, una cuenta crea una línea de confianza (trustline): acepta de forma explícita ese activo.',
    fuente: `${DOCS}/learn/glossary`,
  },
  {
    tema: 'stellar',
    texto: 'Con un pago por ruta (path payment) envías un activo y la otra persona recibe otro distinto: la red hace el cambio en el camino.',
    fuente: `${DOCS}/learn/fundamentals/transactions/list-of-operations`,
  },
  {
    tema: 'stellar',
    texto: 'Stellar trae un exchange descentralizado incluido: las operaciones de ofertas de compra y venta permiten cambiar activos directo en la red.',
    fuente: `${DOCS}/learn/fundamentals/transactions/list-of-operations`,
  },
  {
    tema: 'stellar',
    texto: 'El memo de texto de una transacción admite hasta 28 bytes: sirve, por ejemplo, para poner un número de factura.',
    fuente: `${DOCS}/learn/fundamentals/transactions/operations-and-transactions`,
  },
  {
    tema: 'stellar',
    texto: 'Una transacción puede tener límites de tiempo: solo es válida entre dos fechas. Se recomienda usarlos siempre.',
    fuente: `${DOCS}/learn/fundamentals/transactions/operations-and-transactions`,
  },
  {
    tema: 'stellar',
    texto: 'El Stellar Asset Contract (SAC) deja que los contratos usen los activos clásicos de Stellar, incluido el XLM, con la interfaz de tokens SEP-41, parecida a ERC-20.',
    fuente: `${DOCS}/tokens/stellar-asset-contract`,
  },
  {
    tema: 'stellar',
    texto: 'Las SEP (Stellar Ecosystem Proposals) son los estándares para que las apps del ecosistema se entiendan entre sí; las CAP proponen cambios al protocolo.',
    fuente: `${DOCS}/learn/glossary`,
  },
  {
    tema: 'stellar',
    texto: 'Las cuentas de Stellar tienen direcciones que empiezan con G, como las de los vecinos de WorkVille.',
    fuente: `${DOCS}/learn/fundamentals/stellar-data-structures/accounts`,
  },
  {
    tema: 'stellar',
    texto: 'La Stellar Development Foundation (SDF) es una organización sin fines de lucro que impulsa la red.',
    fuente: 'https://stellar.org/foundation',
  },

  // ---------- Creativo ----------
  {
    tema: 'creativo',
    texto: 'SVG, el formato de las imágenes vectoriales de la web, es una recomendación del W3C desde 2001.',
    fuente: 'https://www.w3.org/TR/SVG10/',
  },
  {
    tema: 'creativo',
    texto: 'Una imagen vectorial se describe con formas y curvas, no con píxeles: por eso se puede agrandar sin perder nitidez, como este pueblo.',
    fuente: 'https://developer.mozilla.org/es/docs/Web/SVG',
  },
  {
    tema: 'creativo',
    texto: 'Las pantallas mezclan luz roja, verde y azul (RGB); la imprenta mezcla tintas cian, magenta, amarilla y negra (CMYK).',
    fuente: 'https://es.wikipedia.org/wiki/Modelo_de_color_CMYK',
  },

  // ---------- Tech ----------
  {
    tema: 'tech',
    texto: 'Rust, el lenguaje de los contratos de Soroban, publicó su versión 1.0 en mayo de 2015.',
    fuente: 'https://blog.rust-lang.org/2015/05/15/Rust-1.0.html',
  },
  {
    tema: 'tech',
    texto: 'WebAssembly se convirtió en recomendación del W3C en diciembre de 2019 y hoy corre en todos los navegadores principales.',
    fuente: 'https://www.w3.org/TR/wasm-core-1/',
  },
  {
    tema: 'tech',
    texto: 'JavaScript lo creó Brendan Eich en 1995, mientras trabajaba en Netscape.',
    fuente: 'https://developer.mozilla.org/es/docs/Web/JavaScript',
  },

  // ---------- Audiovisual ----------
  {
    tema: 'audiovisual',
    texto: 'El cine sonoro se estandarizó en 24 fotogramas por segundo, la velocidad que todavía usan muchas películas.',
    fuente: 'https://es.wikipedia.org/wiki/Fotograma',
  },
  {
    tema: 'audiovisual',
    texto: 'Los hermanos Lumière hicieron su primera proyección pública de pago en París el 28 de diciembre de 1895.',
    fuente: 'https://es.wikipedia.org/wiki/Hermanos_Lumi%C3%A8re',
  },
  {
    tema: 'audiovisual',
    texto: 'El audio de un CD guarda 44.100 muestras por segundo (44,1 kHz) en cada canal.',
    fuente: 'https://es.wikipedia.org/wiki/Disco_compacto',
  },

  // ---------- Academy ----------
  {
    tema: 'academy',
    texto: 'Hermann Ebbinghaus describió la «curva del olvido» en 1885: si no repasas, olvidas buena parte de lo aprendido en pocos días.',
    fuente: 'https://es.wikipedia.org/wiki/Curva_del_olvido',
  },
  {
    tema: 'academy',
    texto: 'Repasar en sesiones separadas en el tiempo ayuda a recordar mejor que estudiar todo de una vez (efecto de espaciado).',
    fuente: 'https://es.wikipedia.org/wiki/Repaso_espaciado',
  },
  {
    tema: 'academy',
    texto: 'La Universidad de Bolonia, fundada en 1088, es la universidad más antigua en funcionamiento del mundo occidental.',
    fuente: 'https://es.wikipedia.org/wiki/Universidad_de_Bolonia',
  },
];

/** Datos para el edificio central de una villa: los de su tema, los de Stellar y los generales. */
export function datosCuriososDe(barrio: Barrio): DatoCurioso[] {
  return DATOS_CURIOSOS.filter((d) => d.tema === barrio || d.tema === 'stellar' || d.tema === 'general');
}
