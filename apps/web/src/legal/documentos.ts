// Documentos legales: el texto vive en los archivos .md de esta carpeta (fáciles de editar).
// - Arriba de cada archivo va su versión (`version: AAAA-MM-DD`), que tiene que coincidir con
//   DOCUMENTOS_LEGALES en packages/shared/src/legal.ts (lo revisa una prueba).
// - `{{comision_garantia}}` y similares se reemplazan con los números del archivo de reglas.
// - Las líneas `> [!ABOGADO] …` se muestran en rojo con el aviso de que hace falta un abogado.
import { porcentajeBps, type DocumentoLegal, type RedStellar, type Reglas } from '@cryptoville/shared';
import comisiones from './comisiones.md?raw';
import contenido from './contenido.md?raw';
import impuestos from './impuestos.md?raw';
import pagos from './pagos.md?raw';
import privacidad from './privacidad.md?raw';
import terminos from './terminos.md?raw';

export const TEXTOS: Record<DocumentoLegal, string> = { terminos, privacidad, pagos, comisiones, impuestos, contenido };

const DIA = 86_400;

const NOMBRES_KYC: Record<string, string> = { abrir_local: 'abrir un local', cobrar: 'cobrar', resenar: 'dejar reseñas' };

function lista(partes: string[]): string {
  if (partes.length <= 1) return partes.join('');
  return `${partes.slice(0, -1).join(', ')} y ${partes.at(-1)}`;
}

/** Valores que se pueden usar en los documentos con `{{nombre}}`. */
export function valoresDeReglas(r: Reglas, red: RedStellar): Record<string, string> {
  return {
    red,
    comision_directo: porcentajeBps(r.comisiones.directoBps),
    comision_garantia: porcentajeBps(r.comisiones.garantiaBps),
    comision_etapas: porcentajeBps(r.comisiones.etapasBps),
    plazo_revision_dias: String(Math.round(r.plazos.revisionSeg / DIA)),
    plazo_disputa_dias: String(Math.round(r.plazos.disputaMaxSeg / DIA)),
    aviso_actualizacion_dias: String(Math.round(r.plazos.avisoActualizacionSeg / DIA)),
    fases_max: String(r.fases.max),
    cambios_por_fase: String(r.fases.cambiosPorFase),
    tope_pedido: Number(r.topePedidoUsdc) > 0 ? `${r.topePedidoUsdc} USDC` : 'sin tope',
    locales_gratis: String(r.locales.gratis),
    local_extra_numero: String(r.locales.gratis + 1),
    precio_local_extra: `${r.locales.precioExtraUsdc} USDC`,
    locales_maximo: String(r.locales.maximo),
    casas_por_sector: String(r.villa.casasPorSector),
    chat_dias: String(r.chatCercania.diasGuardado),
    prueba_max_mb: String(Math.round(r.archivos.pruebaMaxBytes / (1024 * 1024))),
    kyc_para: lista(r.kyc.exigidoPara.map((u) => NOMBRES_KYC[u] ?? u)),
  };
}

export interface DocumentoLeido {
  version: string | null;
  bloques: Bloque[];
}

export type Bloque =
  | { tipo: 'titulo'; nivel: 1 | 2 | 3; texto: string }
  | { tipo: 'parrafo'; texto: string }
  | { tipo: 'lista'; ordenada: boolean; items: string[] }
  | { tipo: 'tabla'; cabecera: string[]; filas: string[][] }
  | { tipo: 'abogado'; texto: string };

/** Lee un documento: su versión y sus bloques, con los `{{valores}}` ya reemplazados. */
export function leerDocumento(texto: string, valores: Record<string, string>): DocumentoLeido {
  let cuerpo = texto.replace(/\r\n/g, '\n');
  let version: string | null = null;
  const cabecera = /^---\n([\s\S]*?)\n---\n/.exec(cuerpo);
  if (cabecera) {
    version = /version:\s*(\S+)/.exec(cabecera[1])?.[1] ?? null;
    cuerpo = cuerpo.slice(cabecera[0].length);
  }
  cuerpo = cuerpo.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, nombre: string) => valores[nombre] ?? `{{${nombre}}}`);

  const bloques: Bloque[] = [];
  const lineas = cuerpo.split('\n');
  let i = 0;
  while (i < lineas.length) {
    const linea = lineas[i].trimEnd();
    if (!linea.trim()) {
      i++;
      continue;
    }
    const titulo = /^(#{1,3})\s+(.*)$/.exec(linea);
    if (titulo) {
      bloques.push({ tipo: 'titulo', nivel: titulo[1].length as 1 | 2 | 3, texto: titulo[2] });
      i++;
      continue;
    }
    const abogado = /^>\s*\[!ABOGADO\]\s*(.*)$/.exec(linea);
    if (abogado) {
      bloques.push({ tipo: 'abogado', texto: abogado[1] });
      i++;
      continue;
    }
    if (linea.startsWith('|')) {
      const filas: string[][] = [];
      while (i < lineas.length && lineas[i].trim().startsWith('|')) {
        const celdas = lineas[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        if (!celdas.every((c) => /^:?-{3,}:?$/.test(c))) filas.push(celdas);
        i++;
      }
      bloques.push({ tipo: 'tabla', cabecera: filas[0] ?? [], filas: filas.slice(1) });
      continue;
    }
    const item = /^(\s*)(-|\d+\.)\s+(.*)$/.exec(linea);
    if (item) {
      const ordenada = /\d/.test(item[2]);
      const items: string[] = [];
      while (i < lineas.length) {
        const m = /^(\s*)(-|\d+\.)\s+(.*)$/.exec(lineas[i]);
        if (!m) break;
        items.push(m[3]);
        i++;
      }
      bloques.push({ tipo: 'lista', ordenada, items });
      continue;
    }
    // Párrafo: líneas seguidas hasta una línea vacía.
    const partes: string[] = [];
    while (i < lineas.length && lineas[i].trim() && !/^(#|>|\||\s*(-|\d+\.)\s)/.test(lineas[i])) {
      partes.push(lineas[i].trim());
      i++;
    }
    bloques.push({ tipo: 'parrafo', texto: partes.join(' ') });
  }
  return { version, bloques };
}

/** Partes de una línea con formato: **negrita**, `código` y [enlaces](https://…). */
export type Trozo = { tipo: 'texto' | 'negrita' | 'codigo'; texto: string } | { tipo: 'enlace'; texto: string; url: string };

export function trozos(linea: string): Trozo[] {
  const salida: Trozo[] = [];
  const patron = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g;
  let ultimo = 0;
  for (const m of linea.matchAll(patron)) {
    if (m.index! > ultimo) salida.push({ tipo: 'texto', texto: linea.slice(ultimo, m.index) });
    if (m[1]) salida.push({ tipo: 'negrita', texto: m[1] });
    else if (m[2]) salida.push({ tipo: 'codigo', texto: m[2] });
    else salida.push({ tipo: 'enlace', texto: m[3], url: m[4] });
    ultimo = m.index! + m[0].length;
  }
  if (ultimo < linea.length) salida.push({ tipo: 'texto', texto: linea.slice(ultimo) });
  return salida;
}
