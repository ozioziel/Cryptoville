// Documentos legales de Cryptoville.
//
// - El texto de cada documento está en apps/web/src/legal/<id>.md (Markdown) y se ve dentro de la app.
// - Cuando cambies un documento, sube su `version` aquí y en el archivo: la app vuelve a pedir que lo acepten.
// - Todo lo que necesita un abogado va marcado en rojo con AVISO_ABOGADO.

export type DocumentoLegal = 'terminos' | 'privacidad' | 'pagos' | 'comisiones' | 'impuestos' | 'contenido';

export interface DatosDocumento {
  id: DocumentoLegal;
  titulo: string;
  /** Versión vigente (fecha). Debe coincidir con la del archivo .md. */
  version: string;
  /** Si se pide aceptarlo al entrar. */
  requiereAceptacion: boolean;
}

export const DOCUMENTOS_LEGALES: readonly DatosDocumento[] = [
  { id: 'terminos', titulo: 'Términos y condiciones', version: '2026-10-07', requiereAceptacion: true },
  { id: 'privacidad', titulo: 'Política de privacidad', version: '2026-10-07', requiereAceptacion: true },
  { id: 'pagos', titulo: 'Pagos, fases y disputas', version: '2026-10-07', requiereAceptacion: true },
  { id: 'comisiones', titulo: 'Comisiones y reglas', version: '2026-10-07', requiereAceptacion: false },
  { id: 'impuestos', titulo: 'Impuestos', version: '2026-10-07', requiereAceptacion: false },
  { id: 'contenido', titulo: 'Contenido y reportes', version: '2026-10-07', requiereAceptacion: true },
];

/** Texto exacto que acompaña, en rojo, todo lo que necesita revisión de un abogado. */
export const AVISO_ABOGADO =
  'Este texto es solo un ejemplo de lo que recomienda una IA. Para que esté completo y tenga validez, debe revisarlo un abogado.';

export function datosDocumento(id: string): DatosDocumento | undefined {
  return DOCUMENTOS_LEGALES.find((d) => d.id === id);
}

/** Documentos que la persona todavía no aceptó en su versión vigente. */
export function documentosPendientes(aceptados: readonly { documento: string; version: string }[]): DatosDocumento[] {
  return DOCUMENTOS_LEGALES.filter(
    (d) => d.requiereAceptacion && !aceptados.some((a) => a.documento === d.id && a.version === d.version),
  );
}
